import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/chat/message-gesture.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { replySwipePull, replySwipeCommits, longPressCancelled, lockReplyAxis } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const start = () => ({ x: 100, y: 200, axis: null });

test("a rightward swipe past the threshold starts a reply", () => {
  assert.equal(replySwipeCommits(start(), 160, 204), true);
  assert.equal(replySwipePull(start(), 160, 204), 60);
});

test("a short or leftward swipe does not reply", () => {
  assert.equal(replySwipeCommits(start(), 130, 200), false);
  assert.equal(replySwipePull(start(), 20, 200), 0);
  assert.equal(replySwipeCommits(start(), 20, 206), false);
});

test("the pull stops at the visual cap", () => {
  assert.equal(replySwipePull(start(), 400, 200), 76);
});

test("vertical scrolling is not a reply, and the first axis sticks", () => {
  assert.equal(replySwipePull(start(), 108, 280), 0);
  const gesture = start();
  lockReplyAxis(gesture, 40, 202);
  assert.equal(gesture.axis, "x");
  assert.equal(replySwipePull(gesture, 40, 80), 0);
});

test("a long-press is cancelled once the finger actually moves", () => {
  assert.equal(longPressCancelled(start(), 104, 203), false);
  assert.equal(longPressCancelled(start(), 112, 200), true);
});
