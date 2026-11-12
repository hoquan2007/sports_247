import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPermalink, validEspnMatchId } from '../src/lib/football/match-link.ts';
import { getEspnMatchPage, parseEspnMatchPage } from '../src/lib/football/match-page.ts';

const eventId = '401234567';
const competitors = [
  { homeAway: 'home', score: '1', team: { id: '100', displayName: 'Home United' } },
  { homeAway: 'away', score: '0', team: { id: '200', displayName: 'Away City' } },
];
const fixture = {
  header: {
    id: eventId,
    competitions: [{
      id: eventId,
      date: '2026-11-08T15:00:00Z',
      status: { type: { name: 'STATUS_FINAL', state: 'post' } },
      competitors,
    }],
  },
};

test('only verified ESPN league and event IDs generate a permanent link', () => {
  assert.equal(validEspnMatchId('eng.1', eventId), true);
  assert.equal(validEspnMatchId('vn.1', eventId), false);
  assert.equal(validEspnMatchId('eng.1', '../401234567'), false);
  assert.equal(validEspnMatchId('eng.1', 'abc'), false);
  assert.equal(matchPermalink({ source: 'ESPN', leagueId: 'eng.1', eventId }), `/match/eng.1/${eventId}`);
  assert.equal(matchPermalink({ source: 'API-Football', leagueId: 'eng.1', eventId }), null);
});

test('verified ESPN summary supports a direct match page with confirmed teams', () => {
  const result = parseEspnMatchPage(fixture, 'eng.1', eventId);
  assert.ok(result);
  assert.equal(result.match.eventId, eventId);
  assert.equal(result.match.home.name, 'Home United');
  assert.equal(result.match.away.name, 'Away City');
  assert.equal(result.match.status, 'finished');
  assert.equal(result.match.homeScore, 1);
  assert.equal(result.match.awayScore, 0);
  assert.equal(result.details.homeId, '100');
  assert.equal(result.details.awayId, '200');
});

test('summary rejects identity mismatches and malformed fixtures', () => {
  assert.equal(parseEspnMatchPage(fixture, 'eng.1', '401234568'), null);
  assert.equal(parseEspnMatchPage(fixture, 'invalid', eventId), null);
  assert.equal(parseEspnMatchPage({ header: { ...fixture.header, id: '401234568' } }, 'eng.1', eventId), null);
  assert.equal(parseEspnMatchPage({ header: { ...fixture.header,
    competitions: [{ ...fixture.header.competitions[0], id: '401234568' }],
  } }, 'eng.1', eventId), null);
  assert.throws(() => parseEspnMatchPage({ header: {} }, 'eng.1', eventId), /thiếu thông tin/);
  assert.throws(() => parseEspnMatchPage({ header: { ...fixture.header,
    competitions: [{ ...fixture.header.competitions[0], competitors: [competitors[0], competitors[0]] }],
  } }, 'eng.1', eventId), /thiếu đội bóng/);
  assert.throws(() => parseEspnMatchPage({ header: { ...fixture.header,
    competitions: [{ ...fixture.header.competitions[0], competitors: competitors.slice(0, 1) }],
  } }, 'eng.1', eventId), /thiếu đội bóng/);
});

test('ESPN detail fetch rejects an unrelated event before exposing its details', async (context) => {
  const wrongEvent = '401234568';
  context.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => fixture,
  }));
  assert.equal(await getEspnMatchPage('eng.1', wrongEvent), null);
  const verified = await getEspnMatchPage('eng.1', eventId);
  assert.equal(verified.details.homeId, '100');
  assert.equal(verified.details.awayId, '200');
});
