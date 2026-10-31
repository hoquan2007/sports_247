import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEspnScoreboard } from '../src/lib/football/espn-fixtures.ts';

const league = { id: 'eng.1', name: 'Premier League', country: 'Anh', short: 'EPL', logo: '' };
const event = (id, extra = {}) => ({
  id, date: '2026-10-31T17:00:00Z',
  status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' }, displayClock: '12\'' },
  competitions: [{ competitors: [
    { homeAway: 'home', score: '2', team: { id: '123', displayName: 'Home', logo: 'https://a.espncdn.com/h.png' } },
    { homeAway: 'away', score: '0', team: { id: '456', displayName: 'Away' } },
  ], broadcasts: [{ names: ['Station One'] }], venue: { fullName: 'Ground' } }],
  ...extra,
});

test('ESPN keeps sound matches when siblings are null, duplicated or structurally invalid', () => {
  const result = parseEspnScoreboard({ events: [
    null, event('101'), event('101'), { ...event('202'), competitions: [null] },
    event('303', { status: { type: { name: 'STATUS_FINAL', state: 'post' } } }),
    { ...event('404'), competitions: [{ competitors: [null] }] },
  ] }, league);
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.matches.map((m) => m.id), ['eng.1:101', 'eng.1:303']);
  assert.equal(result.matches[0].status, 'live');
  assert.equal(result.matches[0].homeScore, 2);
  assert.equal(result.matches[0].awayScore, 0);
  assert.deepEqual(result.matches[0].broadcasters, ['Station One']);
  assert.equal(result.matches[1].status, 'finished');
});

test('ESPN retains fixtures with broken optional fields and marks coverage partial', () => {
  const broken = event('505', { status: { type: { name: 4, state: 'in' } },
    competitions: [{
      competitors: [
        { homeAway: 'home', score: { malformed: true }, team: { id: '123', displayName: 'Home', logo: 42 } },
        { homeAway: 'away', score: 3, team: { id: '456', displayName: 'Away' } },
      ],
      broadcasts: [{ names: 'invalid' }, null, { names: ['Official', 'Official', null] }],
      venue: 14,
    }],
  });
  const result = parseEspnScoreboard({ events: [broken] }, league);
  assert.equal(result.incomplete, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].homeScore, null);
  assert.equal(result.matches[0].awayScore, 3);
  assert.equal(result.matches[0].home.logo, null);
  assert.equal(result.matches[0].venue, null);
  assert.deepEqual(result.matches[0].broadcasters, ['Official']);
});

test('a fully valid ESPN batch is complete; malformed top-level payload is rejected', () => {
  const result = parseEspnScoreboard({ events: [event('606')] }, league);
  assert.equal(result.incomplete, false);
  assert.equal(result.matches[0].matchUrl, 'https://www.espn.com/soccer/match/_/gameId/606');
  assert.deepEqual(parseEspnScoreboard({ events: [] }, league), { matches: [], incomplete: false });
  assert.throws(() => parseEspnScoreboard(null, league), /JSON không hợp lệ/);
  assert.throws(() => parseEspnScoreboard({ events: null }, league), /JSON không hợp lệ/);
  assert.equal(parseEspnScoreboard({ events: [event('abc')] }, league).incomplete, true);
});

test('ESPN skips matches with missing or malformed required team identifiers', () => {
  const broken = event('707', { competitions: [{ competitors: [
    { homeAway: 'home', team: { id: null, displayName: 'Home' } },
    { homeAway: 'away', team: { id: '456', displayName: 'Away' } },
  ] }] });
  const result = parseEspnScoreboard({ events: [event('708'), broken] }, league);
  assert.deepEqual(result.matches.map((match) => match.eventId), ['708']);
  assert.equal(result.incomplete, true);
});

test('ESPN rejects ambiguous fixtures with extra or repeated opponents without dropping good siblings', () => {
  const base = event('800');
  const [home, away] = base.competitions[0].competitors;
  const bad = [
    event('801', { competitions: [{ competitors: [home, home, away] }] }),
    event('802', { competitions: [{ competitors: [home, home] }] }),
    event('803', { competitions: [{ competitors: [home, away, { homeAway: 'neutral', team: { id: '999', displayName: 'Third' } }] }] }),
    event('804', { competitions: [{ competitors: [home, { ...away, team: { id: home.team.id, displayName: 'Imposter' } }] }] }),
    event('805', { competitions: [base.competitions[0], base.competitions[0]] }),
  ];
  const result = parseEspnScoreboard({ events: [event('800'), ...bad, event('806')] }, league);
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.matches.map((match) => match.eventId), ['800', '806']);
});
