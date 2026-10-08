import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/app/registration-analytics.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { initRegistrationAnalytics } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const loader = await readFile(new URL("../public/analytics.js", import.meta.url), "utf8");

function fixture({ consent = "granted", marker = false, loaded = true, counter = "112672745" } = {}) {
  const calls = [];
  const scripts = [];
  const banners = [];
  const root = { dataset: { registrationCreated: String(marker) } };
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
  const win = { WIRING_METRIKA_ID: counter, localStorage: storage };
  if (loaded) win.ym = (...args) => calls.push(args);
  const context = vm.createContext({ window: win, document: doc, localStorage: storage,
    location: { pathname: "/register" }, Event, setTimeout });
  const stop = initRegistrationAnalytics(win, doc);
  return { win, doc, root, calls, scripts, banners, stop,
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

test("OAuth marker is consumed once and survives delayed analytics initialization", () => {
  const f = fixture({ marker: true, loaded: false });
  assert.equal(f.root.dataset.registrationCreated, undefined);
  assert.deepEqual(f.calls, []);
  f.load();
  const queued = f.win.ym.a.map((args) => Array.from(args));
  assert.equal(queued[0][1], "init");
  assert.deepEqual(queued[1], [112672745, "reachGoal", "registration_success"]);
  f.changed();
  assert.equal(f.win.ym.a.length, 2);
});

test("creation waits for consent and for the real loader's counter queue", () => {
  const f = fixture({ consent: null, loaded: false });
  f.load();
  f.created();
  assert.equal(f.scripts.length, 0);
  assert.equal(f.banners.length, 1); // Ask only after creation, even on a direct /register visit.
  f.win.WIRING_ANALYTICS.setConsent("granted");
  assert.equal(f.scripts.length, 1);
  assert.deepEqual(Array.from(f.win.ym.a[1]), [112672745, "reachGoal", "registration_success"]);
  f.win.WIRING_ANALYTICS.setConsent("granted");
  assert.equal(f.win.ym.a.length, 2);
});

test("denial discards the pending registration without silently opting in", () => {
  const f = fixture({ consent: null, loaded: false });
  f.load();
  f.created();
  f.win.WIRING_ANALYTICS.setConsent("denied");
  assert.equal(f.win.localStorage.getItem(), "denied");
  assert.equal(f.scripts.length, 0);
  f.win.WIRING_ANALYTICS.setConsent("granted");
  assert.equal(f.win.ym.a.length, 1); // init only; no retroactive goal after refusal.
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
