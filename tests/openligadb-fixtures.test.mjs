import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenLigaSeason } from '../src/lib/football/openligadb-fixtures.ts';

const match = (matchID, overrides = {}) => ({
  matchID, matchDateTimeUTC: '2026-10-31T12:00:00', matchIsFinished: true,
  team1: { teamId: 1, teamName: 'Home', shortName: 'H', teamIconUrl: 'https://example.com/logo.png' },
  team2: { teamId: 2, teamName: 'Away', shortName: 'A' },
  matchResults: [{ pointsTeam1: 2, pointsTeam2: 1, resultOrderID: 2 }],
  location: { locationStadium: 'Stadium' },
  ...overrides,
});

test('OpenLigaDB ignores valid fixtures outside the selected Vietnam date', () => {
  const result = parseOpenLigaSeason([
    match(1, { matchDateTimeUTC: '2026-10-29T12:00:00' }),
    match(2, { matchDateTimeUTC: '2026-10-31T12:00:00' }),
    match(3, { matchDateTimeUTC: '2026-10-31T16:30:00+00:00' }),
  ], '2026-10-31');
  assert.equal(result.incomplete, false);
  assert.deepEqual(result.matches.map((m) => m.id), ['openligadb:2', 'openligadb:3']);
  assert.equal(result.matches[0].homeScore, 2);
  assert.equal(result.matches[0].awayScore, 1);
  assert.equal(result.matches[0].venue, 'Stadium');
});

test('OpenLigaDB retains valid fixtures when date records are null, corrupt or duplicated', () => {
  const result = parseOpenLigaSeason([
    null, match(7), match(7), match(8, { team1: [] }),
    match(9, { team1: { teamId: 1, teamName: 13 } }),
    match(10, { matchDateTimeUTC: null }),
    match(11, { matchDateTimeUTC: 'nonsense' }),
  ], '2026-10-31');
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.matches.map((m) => m.id), ['openligadb:7']);
});

test('OpenLigaDB preserves fixture and signals degraded score and stadium', () => {
  const result = parseOpenLigaSeason([match(12, {
    matchResults: [{ pointsTeam1: 'abc', pointsTeam2: 3, resultOrderID: 2 }],
    location: 'broken',
  })], '2026-10-31');
  assert.equal(result.incomplete, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].homeScore, null);
  assert.equal(result.matches[0].awayScore, 3);
  assert.equal(result.matches[0].venue, null);
  assert.throws(() => parseOpenLigaSeason({}, '2026-10-31'), /JSON không hợp lệ/);
});
