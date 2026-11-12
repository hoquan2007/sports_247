import assert from 'node:assert/strict';
import test from 'node:test';
import { selectBundesligaBackup } from '../src/lib/football/bundesliga-backup.ts';

const match = (id, startTime, source = 'ESPN') => ({
  id, leagueId: 'ger.1', startTime, source,
});
const day1 = '2026-10-30';
const day2 = '2026-10-31';
const existing = match('ger.1:100', '2026-10-30T19:00:00Z');
const backup1 = match('openligadb:100', '2026-10-30T19:00:00Z', 'OpenLigaDB');
const backup2 = match('openligadb:101', '2026-10-31T12:00:00Z', 'OpenLigaDB');

test('recovers one failed ESPN UTC day while preserving healthy fixtures without duplicates', () => {
  const result = selectBundesligaBackup([
    { day: day1, healthy: true, matches: [existing] },
    { day: day2, healthy: false, matches: [] },
  ], [existing], { matches: [backup1, backup2], incomplete: false });
  assert.deepEqual(result.matches, [backup2]);
  assert.equal(result.recovered, true);
});

test('recovers both failed UTC days from a complete season snapshot', () => {
  const attempts = [day1, day2].map((day) => ({ day, healthy: false, matches: [] }));
  const result = selectBundesligaBackup(attempts, [], { matches: [backup1, backup2], incomplete: false });
  assert.deepEqual(result.matches, [backup1, backup2]);
  assert.equal(result.recovered, true);
});

test('a partially parsed ESPN day with valid fixtures stays degraded to avoid duplicate provider IDs', () => {
  const result = selectBundesligaBackup([
    { day: day1, healthy: false, matches: [existing] },
    { day: day2, healthy: true, matches: [] },
  ], [existing], { matches: [backup1, backup2], incomplete: false });
  assert.deepEqual(result.matches, []);
  assert.equal(result.recovered, false);
});

test('an incomplete OpenLigaDB season cannot clear ESPN failure warnings', () => {
  const result = selectBundesligaBackup([
    { day: day1, healthy: false, matches: [] },
    { day: day2, healthy: true, matches: [] },
  ], [], { matches: [backup1], incomplete: true });
  assert.deepEqual(result.matches, [backup1]);
  assert.equal(result.recovered, false);
});

test('fixtures returned from a healthy adjacent request never receive duplicate fallback rows', () => {
  const result = selectBundesligaBackup([
    { day: day1, healthy: false, matches: [] },
    { day: day2, healthy: true, matches: [existing] },
  ], [existing], { matches: [backup1], incomplete: false });
  assert.deepEqual(result.matches, []);
  assert.equal(result.recovered, false);
});
