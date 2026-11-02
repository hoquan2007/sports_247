import test from 'node:test';
import assert from 'node:assert/strict';
import { mapStandings, STANDINGS_LEAGUES } from '../src/lib/football/standings.ts';

test('ESPN soccer standings preserve groups and read statistics by key, not order', () => {
  const data = mapStandings({
    season: { displayName: '2026-27' },
    children: [{ name: 'Giải chính', standings: { entries: [
      { team: { id: '1', displayName: 'Team One', logos: [{ href: 'https://a.espncdn.com/logo.png' }] }, stats: [
        { name: 'points', value: 21 }, { name: 'losses', value: 1 }, { name: 'gamesPlayed', value: 9 },
        { name: 'pointDifferential', value: 8 }, { name: 'wins', value: 6 }, { name: 'ties', value: 3 },
      ] },
      { team: { id: '2', displayName: 'Team Two', logos: [{ href: 'https://unknown.invalid/logo.png' }] }, stats: [
        { name: 'points', value: 0 },
      ] },
    ] } }],
  }, 'eng.1');

  assert.equal(data.leagueId, 'eng.1');
  assert.equal(data.season, '2026-27');
  assert.equal(data.groups[0].name, 'Giải chính');
  assert.deepEqual(data.groups[0].entries[0], {
    id: '1', name: 'Team One', logo: 'https://a.espncdn.com/logo.png', rank: 1,
    played: 9, wins: 6, draws: 3, losses: 1, goalDifference: 8, points: 21,
  });
  assert.equal(data.groups[0].entries[1].played, null);
  assert.equal(data.groups[0].entries[1].points, 0);
  assert.equal(data.groups[0].entries[1].logo, null);
});

test('ESPN standings handle one root table and omit missing entries', () => {
  const data = mapStandings({ standings: { entries: [{ team: { id: '42', displayName: 'Solo' } }] } }, 'usa.1');
  assert.equal(data.groups.length, 1);
  assert.equal(data.groups[0].entries.length, 1);
  assert.deepEqual(mapStandings({}, 'eng.1').groups, []);
  assert.throws(() => mapStandings(null, 'eng.1'));
  assert.equal(new Set(STANDINGS_LEAGUES).size, STANDINGS_LEAGUES.length);
});
