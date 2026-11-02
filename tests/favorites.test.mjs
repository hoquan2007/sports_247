import test from "node:test";
import assert from "node:assert/strict";
import { FAVORITES_STORAGE_KEY, normalizeFavoriteIds, parseFavoriteIds, readFavoriteIds, writeFavoriteIds } from "../src/lib/football/favorites.ts";

test("favorites reject corrupt storage, duplicates and invalid entries without crashing", () => {
  assert.deepEqual(parseFavoriteIds("bad json"), []);
  assert.deepEqual(parseFavoriteIds('{"id": 1}'), []);
  assert.deepEqual(parseFavoriteIds(JSON.stringify(["eng.1:42", "eng.1:42", 7, "", "a".repeat(161)])), ["eng.1:42"]);
  assert.equal(normalizeFavoriteIds(Array.from({ length: 501 }, (_, index) => `match-${index}`)).length, 500);
  assert.deepEqual(parseFavoriteIds("a".repeat(100_001)), []);
});

test("favorite storage failures are isolated from match interactions", () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
  assert.deepEqual(readFavoriteIds(blocked), []);
  assert.equal(writeFavoriteIds(blocked, ["eng.1:42"]), false);
});

test("favorite ids are persisted and can be restored in a fresh tab", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  assert.equal(writeFavoriteIds(storage, ["match-1", "match-2", "match-1"]), true);
  assert.equal(values.has(FAVORITES_STORAGE_KEY), true);
  assert.deepEqual(readFavoriteIds(storage), ["match-1", "match-2"]);
});
