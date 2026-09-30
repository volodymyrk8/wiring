import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createApi } from "../src/api/core.ts";

function harness(handler, { access = "old-access", refresh = "old-refresh" } = {}) {
  const store = { access, refresh };
  const calls = [];
  const events = { lost: 0, upgrade: [] };
  const fetchFn = async (url, init) => {
    const path = url.replace("https://x.test", "");
    calls.push({ path, headers: init.headers, body: init.body });
    return handler(path, init, calls);
  };
  const api = createApi({
    baseUrl: "https://x.test",
    version: "1.2.3",
    platform: "ios",
    fetchFn,
    tokens: {
      get: (k) => store[k],
      set: async (k, v) => { store[k] = v; },
      clear: async () => { store.access = null; store.refresh = null; },
    },
    hooks: { onSessionLost: () => { events.lost++; }, onUpgradeRequired: (v) => events.upgrade.push(v) },
  });
  return { api, store, calls, events };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("sends version headers and a bearer token, but no bearer on auth endpoints", async () => {
  const { api, calls } = harness(() => json(200, { ok: true }));
  await api("/api/feed");
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  assert.equal(calls[0].headers.Authorization, "Bearer old-access");
  assert.equal(calls[0].headers["X-App-Version"], "1.2.3");
  assert.equal(calls[0].headers["X-App-Platform"], "ios");
  assert.equal(calls[1].headers.Authorization, undefined);
  assert.equal(calls[1].headers["Content-Type"], "application/json");
});

test("expired access token is refreshed once and the request retried", async () => {
  const { api, store, calls } = harness((path, init) => {
    if (path === "/api/auth/refresh") return json(200, { ok: true, access_token: "new-access", refresh_token: "new-refresh" });
    return init.headers.Authorization === "Bearer new-access" ? json(200, { ok: true, cards: [] }) : json(401, { ok: false, token_expired: true });
  });
  const res = await api("/api/feed");
  assert.deepEqual(res.cards, []);
  assert.equal(store.access, "new-access");
  assert.equal(store.refresh, "new-refresh");
  assert.deepEqual(calls.map((c) => c.path), ["/api/feed", "/api/auth/refresh", "/api/feed"]);
  assert.equal(JSON.parse(calls[1].body).refresh_token, "old-refresh");
});

test("concurrent 401s share a single refresh rotation", async () => {
  const { api, calls } = harness((path, init) => {
    if (path === "/api/auth/refresh") return json(200, { ok: true, access_token: "new-access", refresh_token: "new-refresh" });
    return init.headers.Authorization === "Bearer new-access" ? json(200, { ok: true }) : json(401, { ok: false, token_expired: true });
  });
  await Promise.all([api("/api/a"), api("/api/b"), api("/api/c")]);
  assert.equal(calls.filter((c) => c.path === "/api/auth/refresh").length, 1);
});

test("rejected refresh clears tokens, signals session loss and throws", async () => {
  const { api, store, events } = harness((path) =>
    path === "/api/auth/refresh" ? json(401, { ok: false, token_expired: true }) : json(401, { ok: false, token_expired: true, error: "токен недействителен" }),
  );
  await assert.rejects(() => api("/api/feed"), (e) => e instanceof ApiError && e.status === 401);
  assert.equal(events.lost, 1);
  assert.equal(store.access, null);
  assert.equal(store.refresh, null);
});

test("a refresh that fails on the network keeps the session", async () => {
  const { api, store, events } = harness((path) => {
    if (path === "/api/auth/refresh") throw new TypeError("offline");
    return json(401, { ok: false, token_expired: true });
  });
  await assert.rejects(() => api("/api/feed"));
  assert.equal(events.lost, 0);
  assert.equal(store.refresh, "old-refresh");
});

test("a second 401 after a successful refresh does not loop", async () => {
  const { api, calls } = harness((path) =>
    path === "/api/auth/refresh" ? json(200, { ok: true, access_token: "n", refresh_token: "r" }) : json(401, { ok: false, token_expired: true }),
  );
  await assert.rejects(() => api("/api/feed"));
  assert.equal(calls.filter((c) => c.path === "/api/feed").length, 2);
});

test("426 reports the required version to the app", async () => {
  const { api, events } = harness(() => json(426, { ok: false, error: "устарело", upgrade: true, min_version: "2.0.0" }));
  await assert.rejects(() => api("/api/feed"), (e) => e.status === 426);
  assert.deepEqual(events.upgrade, ["2.0.0"]);
});

test("network failure and non-JSON responses become friendly ApiErrors", async () => {
  const offline = harness(() => { throw new TypeError("Network request failed"); });
  await assert.rejects(() => offline.api("/api/feed"), (e) => e.status === 0 && /нет соединения/.test(e.message));
  const html = harness(() => new Response("<html>oops</html>", { status: 502 }));
  await assert.rejects(() => html.api("/api/feed"), (e) => /недоступен/.test(e.message));
});

test("ok:false payloads surface the server message", async () => {
  const { api } = harness(() => json(400, { ok: false, error: "только 18+" }));
  await assert.rejects(() => api("/api/me", { method: "PATCH", body: "{}" }), (e) => e.message === "только 18+" && e.status === 400);
});
