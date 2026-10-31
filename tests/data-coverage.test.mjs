import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDataCoverage } from '../scripts/audit-data-coverage.mjs';
import { LEAGUES } from '../src/lib/football/leagues.ts';
import { VIETNAM_LEAGUES } from '../src/lib/football/vietnam-leagues.ts';

test('coverage audit counts missing club crests and avoids misclassifying off-day leagues', () => {
  const report = summarizeDataCoverage({
    date: '2026-10-31', partial: true, errors: ['provider unavailable'], pendingLeagues: ['vie.1', 'vie.2'],
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
  assert.equal(report.listedLeagues, LEAGUES.length + VIETNAM_LEAGUES.length);
  assert.equal(report.supportedLeagues, LEAGUES.length);
  assert.deepEqual(report.pendingDataLeagues, ['vie.1', 'vie.2']);
  assert.deepEqual(report.pendingLeagueCrests, []);
  assert.deepEqual(report.leagueCrestsNotVerifiedLocally, ['vie.1', 'vie.2']);
  assert.deepEqual(report.failedDataLeagues, []);
  assert.equal(report.leaguesWithNoFixturesToday.length, LEAGUES.length - 1);
  assert.equal(report.fixturesWithUnknownLeague, 0);
  assert.throws(() => summarizeDataCoverage({ matches: [] }), /Unexpected matches API response/);
});

test('coverage audit detects duplicate fixture identifiers and unknown competition IDs', () => {
  const fixture = { id: 'eng.1:401879248', leagueId: 'eng.1', home: { logo: null }, away: { logo: null } };
  const report = summarizeDataCoverage({
    date: '2026-10-31', updatedAt: '2026-10-31T08:00:00Z',
    partial: false, pendingLeagues: ['vie.1', 'vie.2'],
    matches: [fixture, fixture, { ...fixture, id: 'unknown:123', leagueId: 'unknown' }],
  });
  assert.equal(report.fixtures, 3);
  assert.equal(report.fixturesInKnownLeagues, 2);
  assert.equal(report.fixturesWithUnknownLeague, 1);
  assert.equal(report.duplicateMatchIds, 1);
  assert.equal(report.updatedAt, '2026-10-31T08:00:00Z');
  assert.equal(report.clubCrestsMissing, 4);
});

test('coverage audit counts configured Vietnam fixtures and flags official league images needing browser verification', () => {
  const report = summarizeDataCoverage({ date: '2026-10-31', partial: false, pendingLeagues: [],
    matches: [
      { id: 'vie.1:123', leagueId: 'vie.1', home: { logo: 'https://media.api-sports.io/football/teams/3.png' },
        away: { logo: null }, venue: 'Hàng Đẫy', broadcasters: [] },
    ],
  });
  assert.equal(report.fixturesWithUnknownLeague, 0);
  assert.equal(report.supportedLeagues, 20);
  assert.deepEqual(report.pendingDataLeagues, []);
  assert.deepEqual(report.leagueCrestsMissing, []);
  assert.deepEqual(report.leagueCrestsNotVerifiedLocally, ['vie.1', 'vie.2']);
  assert.equal(report.clubCrestsMissing, 1);
  assert.ok(report.leaguesWithNoFixturesToday.includes('vie.2'));
});

test('coverage audit distinguishes a failed configured Vietnam provider from no API credentials', () => {
  const report = summarizeDataCoverage({ date: '2026-10-31', partial: true,
    pendingLeagues: ['vie.2'], failedLeagues: ['vie.2'], errors: ['V.League 2: upstream error'],
    matches: [],
  });
  assert.deepEqual(report.failedDataLeagues, ['vie.2']);
  assert.deepEqual(report.pendingDataLeagues, ['vie.2']);
  assert.equal(report.competitions.find(({ id }) => id === 'vie.2')?.providerFailed, true);
});

test('failed ESPN league is reported as a provider failure without marking it unconfigured', () => {
  const report = summarizeDataCoverage({
    date: '2026-10-31', partial: true, pendingLeagues: ['vie.1', 'vie.2'],
    failedLeagues: ['eng.1'], errors: ['Premier League: không thể tải dữ liệu'], matches: [],
  });
  assert.deepEqual(report.failedDataLeagues, ['eng.1']);
  assert.deepEqual(report.pendingDataLeagues, ['vie.1', 'vie.2']);
  assert.equal(report.competitions.find(({ id }) => id === 'eng.1')?.dataPending, false);
});
