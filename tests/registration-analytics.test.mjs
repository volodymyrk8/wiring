import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/app/registration-analytics.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { initRegistrationAnalytics } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const loader = await readFile(new URL("../public/analytics.js", import.meta.url), "utf8");

function fixture({ consent = "granted", marker = false, loaded = true, counter = "112672745", receipt = "", search = "" } = {}) {
  const calls = [];
  const scripts = [];
  const banners = [];
  const root = { dataset: { registrationCreated: String(marker), registrationManaged: receipt ? "true" : "false" } };
  const doc = new EventTarget();
  doc.documentElement = { dataset: {} };
  doc.getElementById = () => root;
  doc.querySelector = () => null;
  doc.createElement = () => ({ setAttribute() {}, querySelector: () => ({ addEventListener() {} }) });
  doc.body = { appendChild: (banner) => banners.push(banner) };
  doc.head = { appendChild: (script) => scripts.push(script) };
  const storage = {
    getItem: () => consent,
    setItem: (_key, value) => { consent = value; },
  };
  const location = { pathname: "/register", search };
  const fetches = [];
  const receipts = new Map();
  const win = new EventTarget();
  Object.assign(win, { WIRING_METRIKA_ID: counter, localStorage: storage,
    fetch: async (...args) => { fetches.push(args); return { ok: true, status: 200 }; },
    sessionStorage: { getItem: key => receipts.get(key), setItem: (key, value) => receipts.set(key, value), removeItem: key => receipts.delete(key) },
    history: Object.fromEntries(["pushState", "replaceState"].map(method => [method,
      (_state, _title, path) => { location.pathname = path.split(/[?#]/)[0]; }])) });
  if (loaded) win.ym = (...args) => calls.push(args);
  const context = vm.createContext({ window: win, document: doc, localStorage: storage,
    location, Event, setTimeout });
  const stop = initRegistrationAnalytics(win, doc);
  return { win, doc, root, calls, scripts, banners, stop, location, fetches, receipts,
    created: () => doc.dispatchEvent(new Event("wiring:registration-created")),
    changed: () => doc.dispatchEvent(new Event("wiring:analytics-change")),
    load: () => vm.runInContext(loader, context),
  };
}

test("a successful creation sends the target to the configured counter, once", () => {
  const f = fixture();
  assert.deepEqual(f.calls, []); // Loading an ordinary login/profile page is not registration.
  f.created();
  f.changed();
  f.changed();
  assert.deepEqual(f.calls, [[112672745, "reachGoal", "registration_success"]]);
  f.stop();
  f.created();
  assert.equal(f.calls.length, 1);
});

test("managed signup sends signed attribution to our API and never also reachGoal", async () => {
  const f = fixture({ receipt: "signed-local-receipt" });
  const call = f.calls.find(args => args[1] === "getClientID");
  assert.ok(call);
  call[2]("1710232430899999999");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.fetches.length, 1);
  assert.equal(f.fetches[0][0], "/api/analytics/registration");
  assert.deepEqual(JSON.parse(f.fetches[0][1].body), {
    consent: true, client_id: "1710232430899999999",
  });
  f.changed();
  assert.equal(f.fetches.length, 1);
  assert.ok(!f.calls.some(args => args[1] === "reachGoal"));
  assert.equal(f.receipts.size, 0);
  f.stop();
});

test("managed signup respects denial even while ClientID callback is queued", async () => {
  const f = fixture({ receipt: "signed-local-receipt" });
  const call = f.calls.find(args => args[1] === "getClientID");
  f.win.localStorage.setItem("wiring-analytics-consent", "denied");
  call[2]("1710232430899999999");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.parse(f.fetches[0][1].body).consent, false);
  assert.equal(JSON.parse(f.fetches[0][1].body).client_id, "");
  assert.ok(!f.calls.some(args => args[1] === "reachGoal"));
  f.stop();
});

test("account token URLs never initialize third party analytics", () => {
  const f = fixture({ loaded: false, search: "?reset=private-token" });
  f.load();
  assert.equal(f.scripts.length, 0);
  assert.equal(f.win.ym, undefined);
});

test("OAuth marker is consumed once and survives delayed analytics initialization", () => {
  const f = fixture({ marker: true, loaded: false });
  assert.equal(f.root.dataset.registrationCreated, undefined);
  assert.deepEqual(f.calls, []);
  f.load();
  const queued = f.win.ym.a.map((args) => Array.from(args));
  assert.equal(queued[0][1], "init");
  assert.deepEqual(queued[2], [112672745, "reachGoal", "registration_success"]);
  f.changed();
  assert.equal(f.win.ym.a.length, 3);
});

test("creation waits for consent and for the real loader's counter queue", () => {
  const f = fixture({ consent: null, loaded: false });
  f.load();
  f.created();
  assert.equal(f.scripts.length, 0);
  assert.equal(f.banners.length, 1); // Ask only after creation, even on a direct /register visit.
  f.win.WIRING_ANALYTICS.setConsent("granted");
  assert.equal(f.scripts.length, 1);
  assert.deepEqual(Array.from(f.win.ym.a[2]), [112672745, "reachGoal", "registration_success"]);
  f.win.WIRING_ANALYTICS.setConsent("granted");
  assert.equal(f.win.ym.a.length, 3);
});

test("denial discards the pending registration without silently opting in", () => {
  const f = fixture({ consent: null, loaded: false });
  f.load();
  f.created();
  f.win.WIRING_ANALYTICS.setConsent("denied");
  assert.equal(f.win.localStorage.getItem(), "denied");
  assert.equal(f.scripts.length, 0);
  f.win.WIRING_ANALYTICS.setConsent("granted");
  assert.equal(f.win.ym.a.length, 2); // init + page; no retroactive goal after refusal.
});

test("behavior maps are consent-gated, SPA hits omit tokens and duplicates", () => {
  const f = fixture({ consent: null, loaded: false });
  f.load();
  f.win.history.pushState({}, "", "/reset?reset=private-token");
  assert.equal(f.scripts.length, 0);
  f.win.WIRING_ANALYTICS.setConsent("granted");
  const queue = () => f.win.ym.a.map(args => Array.from(args));
  assert.equal(queue()[0][2].clickmap, true);
  assert.equal(queue()[0][2].webvisor, true);
  assert.equal(queue()[0][2].sendTitle, false);
  assert.equal(queue()[0][2].defer, true);
  f.win.history.replaceState({}, "", "/reset?reset=another-token");
  f.win.history.pushState({}, "", "/feed");
  f.location.pathname = "/reset";
  f.win.dispatchEvent(new Event("popstate"));
  const hits = queue().filter(args => args[1] === "hit");
  assert.deepEqual(Array.from(hits, args => args[2]), ["/reset", "/feed", "/reset"]);
  assert.equal(hits[1][3].referer, "/reset");
  assert.ok(!JSON.stringify(queue()).includes("private-token"));
  f.win.WIRING_ANALYTICS.setConsent("denied");
  assert.equal(queue().at(-1)[1], "destruct");
  const length = queue().length;
  f.win.history.pushState({}, "", "/me");
  assert.equal(queue().length, length);
});

test("all analytics templates mask their entire body before the recorder starts", async () => {
  for (const name of ["index", "landing", "legal"]) {
    const html = await readFile(new URL(`../templates/${name}.html`, import.meta.url), "utf8");
    assert.match(html, /<body[^>]*class="[^"]*\bym-hide-content\b/);
    assert.doesNotMatch(html, /ym-show-content|ym-record-keys/);
  }
});

test("missing configuration, blocked storage and tracking errors do not break auth", () => {
  const missing = fixture({ counter: "" });
  missing.created();
  assert.equal(missing.calls.length, 0);
  const blocked = fixture();
  blocked.win.localStorage.getItem = () => { throw new Error("blocked"); };
  assert.doesNotThrow(blocked.created);
  assert.equal(blocked.calls.length, 0);
  const broken = fixture();
  broken.win.ym = () => { throw new Error("counter unavailable"); };
  assert.doesNotThrow(broken.created);
});
