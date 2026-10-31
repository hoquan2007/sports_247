import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDataCoverage } from '../scripts/audit-data-coverage.mjs';
import { LEAGUES } from '../src/lib/football/leagues.ts';

test('coverage audit counts missing club crests and avoids misclassifying off-day leagues', () => {
  const report = summarizeDataCoverage({
    date: '2026-10-31', partial: true, errors: ['provider unavailable'],
    matches: [{
      leagueId: 'eng.1', home: { logo: 'https://a.espncdn.com/club1.png' },
      away: { logo: null }, venue: null, broadcasters: [],
    }],
  });
  assert.equal(report.fixtures, 1);
  assert.equal(report.providerFailures, 1);
  assert.deepEqual(report.providerFailureMessages, ['provider unavailable']);
  assert.equal(report.duplicateMatchIds, 0);
  assert.equal(report.updatedAt, null);
  assert.equal(report.clubCrestsMissing, 1);
  assert.equal(report.stadiumsMissing, 1);
  assert.equal(report.broadcasterFieldsMissing, 1);
  assert.equal(report.leagueCrestsMissing.length, 0);
  assert.equal(report.leaguesWithNoFixturesToday.length, LEAGUES.length - 1);
  assert.equal(report.fixturesWithUnknownLeague, 0);
  assert.throws(() => summarizeDataCoverage({ matches: [] }), /Unexpected matches API response/);
});

test('coverage audit detects duplicate fixture identifiers and unknown competition IDs', () => {
  const fixture = { id: 'eng.1:401879248', leagueId: 'eng.1', home: { logo: null }, away: { logo: null } };
  const report = summarizeDataCoverage({
    date: '2026-10-31', updatedAt: '2026-10-31T08:00:00Z',
    partial: false, matches: [fixture, fixture, { ...fixture, id: 'unknown:123', leagueId: 'unknown' }],
  });
  assert.equal(report.fixtures, 3);
  assert.equal(report.fixturesInKnownLeagues, 2);
  assert.equal(report.fixturesWithUnknownLeague, 1);
  assert.equal(report.duplicateMatchIds, 1);
  assert.equal(report.updatedAt, '2026-10-31T08:00:00Z');
  assert.equal(report.clubCrestsMissing, 4);
});
