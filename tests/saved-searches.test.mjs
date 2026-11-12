import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SAVED_SEARCHES, SAVED_SEARCHES_STORAGE_KEY, normalizeSavedSearches,
  parseSavedSearches, readSavedSearches, writeSavedSearches } from "../src/lib/football/saved-searches.ts";

test("saved searches sanitize whitespace, deduplicate and limit to six", () => {
  assert.deepEqual(normalizeSavedSearches([
    "  Manchester   City  ", "manchester city", "Bình Dương", "", null,
    "Liverpool", "Arsenal", "Barcelona", "Real Madrid", "Chelsea",
  ]), ["Manchester City", "Bình Dương", "Liverpool", "Arsenal", "Barcelona", "Real Madrid"]);
  assert.equal(MAX_SAVED_SEARCHES, 6);
  assert.deepEqual(normalizeSavedSearches(["x".repeat(101)]), []);
  assert.deepEqual(parseSavedSearches("{invalid"), []);
  assert.deepEqual(parseSavedSearches("x".repeat(10_001)), []);
  assert.deepEqual(parseSavedSearches(JSON.stringify({ query: "Arsenal" })), []);
});

test("saved searches persist and avoid redundant cross-tab writes", () => {
  const values = new Map();
  let writes = 0;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes++; values.set(key, value); },
  };
  assert.equal(writeSavedSearches(storage, ["Bình Dương", "Arsenal"]), true);
  assert.deepEqual(JSON.parse(values.get(SAVED_SEARCHES_STORAGE_KEY)), ["Bình Dương", "Arsenal"]);
  assert.deepEqual(readSavedSearches(storage), ["Bình Dương", "Arsenal"]);
  assert.equal(writeSavedSearches(storage, ["Bình Dương", "Arsenal"]), true);
  assert.equal(writes, 1);
  assert.equal(writeSavedSearches(storage, ["Arsenal"]), true);
  assert.equal(writes, 2);
});

test("blocked browser storage cannot break saved searches", () => {
  const blocked = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.deepEqual(readSavedSearches(blocked), []);
  assert.equal(writeSavedSearches(blocked, ["Arsenal"]), false);
});
