import test from "node:test";
import assert from "node:assert/strict";
import { PINNED_LEAGUES_STORAGE_KEY, normalizePinnedLeagueIds, parsePinnedLeagueIds,
  readPinnedLeagueIds, writePinnedLeagueIds } from "../src/lib/football/league-preferences.ts";

test("pinned league preferences admit only supported IDs and keep first-seen order", () => {
  assert.deepEqual(normalizePinnedLeagueIds(["eng.1", "vie.1", "eng.1", "unknown", null, 4]), ["eng.1", "vie.1"]);
  assert.deepEqual(parsePinnedLeagueIds("{invalid"), []);
  assert.deepEqual(parsePinnedLeagueIds(JSON.stringify({ leagues: ["eng.1"] })), []);
  assert.deepEqual(parsePinnedLeagueIds("x".repeat(10_001)), []);
});

test("pinned league preferences persist without redundant cross-tab writes", () => {
  const values = new Map();
  let writes = 0;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes++; values.set(key, value); },
  };
  assert.equal(writePinnedLeagueIds(storage, ["eng.1", "ger.1"]), true);
  assert.deepEqual(JSON.parse(values.get(PINNED_LEAGUES_STORAGE_KEY)), ["eng.1", "ger.1"]);
  assert.deepEqual(readPinnedLeagueIds(storage), ["eng.1", "ger.1"]);
  assert.equal(writePinnedLeagueIds(storage, ["eng.1", "ger.1"]), true);
  assert.equal(writes, 1);
  assert.equal(writePinnedLeagueIds(storage, []), true);
  assert.equal(writes, 2);
});

test("blocked browser storage cannot break pinned league shortcuts", () => {
  const blocked = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.deepEqual(readPinnedLeagueIds(blocked), []);
  assert.equal(writePinnedLeagueIds(blocked, ["eng.1"]), false);
});
