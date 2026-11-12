import test from "node:test";
import assert from "node:assert/strict";
import { FOLLOWED_TEAMS_STORAGE_KEY, MAX_FOLLOWED_TEAMS, isFollowedTeamId,
  normalizeFollowedTeams, parseFollowedTeams, readFollowedTeams, writeFollowedTeams,
  followedTeamForMatch, matchContainsTeam } from "../src/lib/football/followed-teams.ts";

const club = { id: "22", name: "Hà Nội FC", shortName: "Hà Nội", logo: null };
const match = { source: "ESPN", leagueId: "eng.1", home: club, away: { ...club, id: "23", name: "Arsenal" } };
const home = { id: "ESPN|eng.1|22", name: "Hà Nội FC" };

test("followed team identity includes the source and league", () => {
  assert.deepEqual(followedTeamForMatch(match, club), home);
  assert.equal(matchContainsTeam(match, home.id), true);
  assert.equal(matchContainsTeam({ ...match, source: "OpenLigaDB" }, home.id), false);
  assert.equal(matchContainsTeam({ ...match, leagueId: "esp.1" }, home.id), false);
  assert.equal(isFollowedTeamId("ESPN|eng.1|a%20b"), true);
  assert.equal(isFollowedTeamId("ESPN|eng.1|a%ZZ"), false);
  assert.equal(isFollowedTeamId("ESPN|unknown|22"), false);
  assert.equal(isFollowedTeamId("provider|eng.1|22"), false);
  assert.equal(isFollowedTeamId("ESPN|eng.1|"), false);
});

test("team presets validate names, deduplicate, and cap storage", () => {
  assert.deepEqual(normalizeFollowedTeams([home, home, { id: home.id, name: "Other" },
    { id: "ESPN|eng.1|23", name: "  Arsenal  " }, null, { id: "bad", name: "Fake" }]),
  [home, { id: "ESPN|eng.1|23", name: "Arsenal" }]);
  assert.equal(normalizeFollowedTeams(Array.from({ length: 100 }, (_, i) =>
    ({ id: `ESPN|eng.1|${i}`, name: `Team ${i}` }))).length, MAX_FOLLOWED_TEAMS);
  assert.deepEqual(parseFollowedTeams("{broken"), []);
  assert.deepEqual(parseFollowedTeams("x".repeat(20_001)), []);
});

test("storage writes are idempotent and blocked storage preserves the in-tab workflow", () => {
  const data = new Map();
  let writes = 0;
  const storage = {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { writes++; data.set(key, value); },
  };
  assert.equal(writeFollowedTeams(storage, [home]), true);
  assert.deepEqual(JSON.parse(data.get(FOLLOWED_TEAMS_STORAGE_KEY)), [home]);
  assert.deepEqual(readFollowedTeams(storage), [home]);
  assert.equal(writeFollowedTeams(storage, [home]), true);
  assert.equal(writes, 1);
  assert.equal(writeFollowedTeams(storage, []), true);
  assert.equal(writes, 2);
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.deepEqual(readFollowedTeams(denied), []);
  assert.equal(writeFollowedTeams(denied, [home]), false);
});
