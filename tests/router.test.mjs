import assert from "node:assert/strict";
import {
  PUBLIC_VIEWS,
  SPA_PATHS,
  hrefFor,
  matchRoute,
  normalizePath,
  planRoute,
  STATIC_PATH_TO_VIEW,
} from "../public/dist/router.js";

const BASE = "";

for (const [path, view] of Object.entries(STATIC_PATH_TO_VIEW)) {
  assert.equal(matchRoute(path, BASE).view, view, `path ${path} → ${view}`);
}

assert.deepEqual(matchRoute("/", BASE), { view: "home" });
assert.deepEqual(matchRoute("/unknown/deep", BASE), { view: "home" });
assert.deepEqual(matchRoute("/r/Ab12", BASE), { view: "register", inviteRef: "Ab12" });
assert.deepEqual(matchRoute("/r/ab", BASE), { view: "home" });
assert.deepEqual(matchRoute("/chats/42", BASE), { view: "chat", id: 42 });
assert.deepEqual(matchRoute("/p/7", BASE), { view: "person", id: 7 });
assert.equal(normalizePath("/feed/", BASE), "/feed");
assert.equal(normalizePath("/feed", "/prefix"), "/feed");

assert.equal(hrefFor(BASE, "deck"), SPA_PATHS.deck);
assert.equal(hrefFor(BASE, "chat", { id: 9 }), "/chats/9");
assert.equal(hrefFor(BASE, "person", { id: 3 }), "/p/3");

const guest = { loggedIn: false };
const member = { loggedIn: true, isGuest: false };
const guestSession = { loggedIn: true, isGuest: true };

for (const view of PUBLIC_VIEWS) {
  const path = view === "home" ? "/" : SPA_PATHS[view] ?? `/${view}`;
  const route = matchRoute(path, BASE);
  assert.equal(
    planRoute(route, guest, path).kind,
    "show",
    `guest may open ${view}`,
  );
}

assert.equal(planRoute({ view: "register" }, guest, "/sign-up").kind, "show");
assert.equal(planRoute({ view: "register" }, guest, "/register").kind, "show");
assert.equal(planRoute({ view: "deck" }, guest, "/feed").kind, "login");
const guestChat = planRoute({ view: "chat", id: 1 }, guest, "/chats/1");
assert.equal(guestChat.kind, "login");
assert.equal(guestChat.pendingPath, "/chats/1");
assert.equal(planRoute({ view: "likes" }, guest, "/likes").kind, "login");

assert.equal(planRoute({ view: "login" }, member, "/sign-in").kind, "feed");
assert.equal(planRoute({ view: "login" }, member, "/login").kind, "feed");
assert.equal(planRoute({ view: "register" }, member, "/sign-up").kind, "feed");
assert.equal(planRoute({ view: "register" }, member, "/register").kind, "feed");
assert.equal(planRoute({ view: "onboard" }, member, "/onboard").kind, "feed");
assert.equal(planRoute({ view: "login" }, guestSession, "/sign-in").kind, "show");
assert.equal(planRoute({ view: "login" }, guestSession, "/login").kind, "show");

assert.equal(planRoute({ view: "chat", id: 5 }, member, "/chats/5").kind, "chat");
assert.equal(planRoute({ view: "person", id: 2 }, member, "/p/2").kind, "person");
assert.equal(planRoute({ view: "matches" }, member, "/chats").kind, "show");

console.log("router.test.mjs ok");
