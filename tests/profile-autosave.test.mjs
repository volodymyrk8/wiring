import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/profile/draft-autosave.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { createDraftAutosave } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
let id = 0;
function setup(t, overrides = {}) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const calls = [], saved = [];
  const key = `profile-${++id}`;
  const saver = createDraftAutosave({
    key, initial: { bio: "original" }, restored: false, delay: 60_000,
    storage: () => storage,
    save: async (value, publish) => { calls.push({ value, publish }); return value; },
    onSaved: (value) => saved.push(value), onState: () => {}, ...overrides,
  });
  t.after(() => saver.dispose());
  return { saver, storage, key, calls, saved };
}

test("opening an unchanged profile does not write to server or storage", async (t) => {
  const { saver, storage, key, calls } = setup(t);
  saver.start();
  await saver.save();
  assert.equal(calls.length, 0);
  assert.equal(storage.getItem(key), null);
  assert.equal(saver.state.phase, "idle");
});

test("input survives leaving before debounce and starts no deferred request", async (t) => {
  const { saver, storage, key, calls } = setup(t);
  saver.update({ bio: "typed just before leaving" });
  assert.deepEqual(JSON.parse(storage.getItem(key)), { bio: "typed just before leaving" });
  saver.dispose();
  await saver.save();
  assert.equal(calls.length, 0);
});

test("debounce saves automatically and clears a confirmed local copy", async (t) => {
  const done = deferred();
  const { saver, storage, key } = setup(t, { delay: 0, onSaved: done.resolve });
  saver.update({ bio: "automatic" });
  await done.promise;
  assert.equal(saver.state.phase, "saved");
  assert.equal(storage.getItem(key), null);
});

test("failed request retains text and retry saves it", async (t) => {
  let failed = true;
  const { saver, storage, key } = setup(t, { save: async (value) => {
    if (failed) throw new Error("offline");
    return value;
  } });
  saver.update({ bio: "unsent" });
  await assert.rejects(saver.save(), /offline/);
  assert.equal(saver.state.phase, "error");
  assert.equal(saver.state.local, true);
  assert.equal(JSON.parse(storage.getItem(key)).bio, "unsent");
  failed = false;
  await saver.save();
  assert.equal(saver.state.phase, "saved");
});

test("storage refusal does not claim the local draft is safe", async (t) => {
  const { saver } = setup(t, {
    storage: () => { throw new Error("storage blocked"); },
    save: async () => { throw new Error("offline"); },
  });
  saver.update({ bio: "at risk" });
  assert.equal(saver.state.local, false);
  await assert.rejects(saver.save());
  assert.equal(saver.state.phase, "error");
  assert.equal(saver.state.local, false);
});

test("old response cannot clear newer local edits or report them as saved", async (t) => {
  const gate = deferred(), writes = [];
  const { saver, storage, key, saved } = setup(t, { save: async (value) => {
    writes.push(value.bio);
    if (writes.length === 1) await gate.promise;
    return value;
  } });
  saver.update({ bio: "first" });
  const first = saver.save();
  await tick();
  saver.update({ bio: "latest" });
  const second = saver.save();
  await tick();
  assert.deepEqual(writes, ["first"]);
  gate.resolve();
  await first;
  assert.equal(saved.some((value) => value.bio === "first"), false);
  await second;
  assert.deepEqual(writes, ["first", "latest"]);
  assert.equal(storage.getItem(key), null);
  assert.equal(saved.at(-1).bio, "latest");
});

test("publishing waits for an in-flight draft and cancels pending debounce", async (t) => {
  const gate = deferred(), writes = [];
  const { saver } = setup(t, { save: async (value, publish) => {
    writes.push({ bio: value.bio, publish });
    if (writes.length === 1) await gate.promise;
    return value;
  } });
  saver.update({ bio: "draft" });
  const first = saver.save();
  await tick();
  saver.update({ bio: "publication" });
  const publication = saver.save(true);
  await tick();
  assert.equal(writes.length, 1);
  gate.resolve();
  await Promise.all([first, publication]);
  assert.deepEqual(writes, [{ bio: "draft", publish: false }, { bio: "publication", publish: true }]);
  await saver.save();
  assert.equal(writes.length, 2);
});

test("new profile instance waits for old request and old instance cannot clear its draft", async (t) => {
  const gate = deferred(), writes = [];
  const old = setup(t, { save: async (value) => { writes.push(value.bio); await gate.promise; return value; } });
  old.saver.update({ bio: "old" });
  const first = old.saver.save();
  await tick();
  old.saver.dispose();
  const next = setup(t, { key: old.key, restored: true, initial: { bio: "old" }, storage: () => old.storage,
    save: async (value) => { writes.push(value.bio); return value; },
  });
  next.saver.update({ bio: "new" });
  const second = next.saver.save();
  await tick();
  assert.deepEqual(writes, ["old"]);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ["old", "new"]);
  assert.equal(old.saved.length, 0);
  assert.equal(next.saver.state.phase, "saved");
});

test("repeated retry clicks share the same request", async (t) => {
  const gate = deferred();
  const { saver } = setup(t, { save: () => gate.promise });
  saver.update({ bio: "once" });
  const first = saver.save();
  assert.equal(saver.save(), first);
  gate.resolve({ bio: "once" });
  await first;
});

test("restored unfinished answers are retained after validation failure", async (t) => {
  const value = { bio: "text", prompts: [{ id: "special", answer: "ab" }] };
  const { saver, storage, key } = setup(t, {
    initial: value, restored: true,
    save: async () => { throw new Error("ответ промпта: 4–280 символов"); },
  });
  await assert.rejects(saver.save());
  assert.deepEqual(JSON.parse(storage.getItem(key)), value);
  assert.equal(saver.state.phase, "error");
});
