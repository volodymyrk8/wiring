import assert from "node:assert/strict";
import { test } from "node:test";
import { activeFilterCount, defaultFilters, filtersQuery, normalizeFilters } from "../src/filtersCore.ts";

test("defaults produce an empty query and no active filters", () => {
  const f = defaultFilters();
  assert.equal(filtersQuery(f), "");
  assert.equal(activeFilterCount(f), 0);
});

test("query uses the server's parameter names and omits defaults", () => {
  const f = { ...defaultFilters(), neuro: ["adhd", "asd"], vibe: ["selfdx"], intents: ["dating"], min_age: 25, max_age: 40, city: "Нови-Сад", hide_undiagnosed: false };
  const q = new URLSearchParams(filtersQuery(f));
  assert.equal(q.get("neuro"), "adhd,asd");
  assert.equal(q.get("vibe"), "selfdx");
  assert.equal(q.get("intent"), "dating");
  assert.equal(q.get("min_age"), "25");
  assert.equal(q.get("max_age"), "40");
  assert.equal(q.get("city"), "Нови-Сад");
  assert.equal(q.get("hide_empty"), "0");
});

test("only the non-default bound is sent", () => {
  assert.equal(filtersQuery({ ...defaultFilters(), min_age: 30 }), "min_age=30");
  assert.equal(filtersQuery({ ...defaultFilters(), max_age: 45 }), "max_age=45");
});

test("cities and tags are URL-encoded", () => {
  const q = filtersQuery({ ...defaultFilters(), city: "Санкт-Петербург & область" });
  assert.equal(new URLSearchParams(q).get("city"), "Санкт-Петербург & область");
});

test("active count groups age bounds into one filter", () => {
  const f = { ...defaultFilters(), min_age: 20, max_age: 30, neuro: ["adhd"], city: "Белград" };
  assert.equal(activeFilterCount(f), 3);
  assert.equal(activeFilterCount({ ...defaultFilters(), hide_undiagnosed: false }), 1);
});

test("normalize clamps ages, swaps reversed bounds and drops junk", () => {
  const f = normalizeFilters({ min_age: 5, max_age: 500 });
  assert.equal(f.min_age, 18);
  assert.equal(f.max_age, 99);
  const swapped = normalizeFilters({ min_age: 60, max_age: 30 });
  assert.equal(swapped.min_age, 30);
  assert.equal(swapped.max_age, 60);
  const junk = normalizeFilters({ neuro: ["ok", 3, null], city: 7, min_age: "abc" });
  assert.deepEqual(junk.neuro, ["ok"]);
  assert.equal(junk.city, "");
  assert.equal(junk.min_age, 18);
  assert.equal(normalizeFilters(null).hide_undiagnosed, true);
  assert.equal(normalizeFilters({ hide_undiagnosed: false }).hide_undiagnosed, false);
});
