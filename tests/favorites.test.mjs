import test from "node:test";
import assert from "node:assert/strict";
import { FAVORITES_STORAGE_KEY, normalizeFavoriteIds, parseFavoriteBackup, parseFavoriteIds, readFavoriteIds, serializeFavoriteBackup, writeFavoriteIds } from "../src/lib/football/favorites.ts";

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
  let writes = 0;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes++; values.set(key, value); },
  };
  assert.equal(writeFavoriteIds(storage, ["match-1", "match-2", "match-1"]), true);
  assert.equal(values.has(FAVORITES_STORAGE_KEY), true);
  assert.deepEqual(readFavoriteIds(storage), ["match-1", "match-2"]);
  assert.equal(writes, 1);
  assert.equal(writeFavoriteIds(storage, ["match-1", "match-2"]), true);
  assert.equal(writes, 1, "unchanged cross-tab state should not rewrite localStorage");
  assert.equal(writeFavoriteIds(storage, ["match-2"]), true);
  assert.equal(writes, 2, "an actual favorite change must still persist");
});

test("favorites export and import round-trip without duplicates", () => {
  const backup = serializeFavoriteBackup(["eng.1:42", "ger.1:77", "eng.1:42"], "2026-11-11T01:00:00.000Z");
  const json = JSON.parse(backup);
  assert.equal(json.version, 1);
  assert.equal(json.exportedAt, "2026-11-11T01:00:00.000Z");
  assert.deepEqual(parseFavoriteBackup(backup), ["eng.1:42", "ger.1:77"]);
  assert.deepEqual(normalizeFavoriteIds(["eng.1:42", ...parseFavoriteBackup(backup)]), ["eng.1:42", "ger.1:77"]);
});

test("favorites import rejects malformed, incompatible and oversized backups", () => {
  assert.throws(() => parseFavoriteBackup("bad json"), /JSON/);
  assert.throws(() => parseFavoriteBackup("[]"), /Định dạng/);
  assert.throws(() => parseFavoriteBackup('{"version":2,"favorites":[]}'), /định dạng/);
  assert.throws(() => parseFavoriteBackup('{"version":1,"favorites":[42]}'), /định dạng/);
  assert.throws(() => parseFavoriteBackup(JSON.stringify({ version: 1, favorites: Array(501).fill("id") })), /500/);
  assert.throws(() => parseFavoriteBackup(" ".repeat(100_001)), /quá lớn/);
});
