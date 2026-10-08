import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/deck/vertical-swipe.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { feedSwipeTarget, lockFeedSwipeAxis } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const start = (index = 1) => ({ x: 100, y: 200, index, axis: null });

test("short vertical swipes go to the adjacent card in either direction", () => {
  assert.equal(feedSwipeTarget(start(), 100, 140, 5), 2);
  assert.equal(feedSwipeTarget(start(), 100, 260, 5), 0);
});

test("a long fling still takes one step from its starting card", () => {
  assert.equal(feedSwipeTarget(start(2), 100, -1800, 8), 3);
  assert.equal(feedSwipeTarget(start(2), 100, 2200, 8), 1);
});

test("taps, small movements and horizontal photo swipes do not navigate", () => {
  assert.equal(feedSwipeTarget(start(), 100, 200, 5), null);
  assert.equal(feedSwipeTarget(start(), 100, 160, 5), null);
  assert.equal(feedSwipeTarget(start(), 30, 200, 5), null);
  assert.equal(feedSwipeTarget(start(), 140, 240, 5), null);
});

test("a photo swipe that turns vertically keeps its first clear axis", () => {
  const gesture = start();
  lockFeedSwipeAxis(gesture, 40, 202);
  assert.equal(feedSwipeTarget(gesture, 30, 80, 5), null);
});

test("the first card and final empty slide bound navigation", () => {
  assert.equal(feedSwipeTarget(start(0), 100, 260, 3), 0);
  assert.equal(feedSwipeTarget(start(3), 100, 140, 3), 3);
  assert.equal(feedSwipeTarget(start(3), 100, 260, 3), 2);
});
