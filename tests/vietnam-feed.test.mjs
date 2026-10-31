import test from 'node:test';
import assert from 'node:assert/strict';
import { getVietnamFeedConfig, getVietnamMatches, mapVietnamFixture } from '../src/lib/football/vietnam.ts';
import { isVietnamLeague, VIETNAM_LEAGUES } from '../src/lib/football/vietnam-leagues.ts';

const DAY = '2026-10-31';
const validConfig = { apiKey: 'test-only-secret', ids: { 'vie.1': 123, 'vie.2': 456 }, cacheSeconds: 3600 };

function fixture(division = 1, overrides = {}) {
  return {
    fixture: { id: 900 + division, date: '2026-10-31T18:00:00+07:00',
      status: { short: '1H', long: 'First Half', elapsed: 34 }, venue: { name: 'Hàng Đẫy' } },
    league: { id: division === 1 ? 123 : 456, name: `V.League ${division}`, country: 'Vietnam' },
    teams: { home: { id: 17, name: 'Hà Nội FC', logo: 'https://media.api-sports.io/football/teams/17.png' },
      away: { id: 22, name: 'Hải Phòng', logo: 'https://evil.invalid/football/teams/22.png' } },
    goals: { home: 2, away: 1 },
    ...overrides,
  };
}

test('VN metadata has exactly two distinct divisions and is safe for client use', () => {
  assert.deepEqual(VIETNAM_LEAGUES.map(({ id }) => id), ['vie.1', 'vie.2']);
  assert.equal(isVietnamLeague('vie.2'), true);
  assert.equal(isVietnamLeague('eng.1'), false);
});

test('server configuration requires a key and two distinct positive integer provider IDs', () => {
  const input = { API_FOOTBALL_KEY: '  test-only-secret  ', SPORTS247_VLEAGUE1_ID: '123', SPORTS247_VLEAGUE2_ID: '456' };
  assert.deepEqual(getVietnamFeedConfig(input), validConfig);
  for (const changes of [
    { API_FOOTBALL_KEY: ' ' }, { SPORTS247_VLEAGUE1_ID: '0' },
    { SPORTS247_VLEAGUE1_ID: '456' }, { SPORTS247_VLEAGUE2_ID: 'unverified' },
    { SPORTS247_VLEAGUE2_ID: '-2' }, { SPORTS247_VLEAGUE1_ID: '123.5' },
    { SPORTS247_VIETNAM_CACHE_SECONDS: '' }, { SPORTS247_VIETNAM_CACHE_SECONDS: '0' },
    { SPORTS247_VIETNAM_CACHE_SECONDS: '89' }, { SPORTS247_VIETNAM_CACHE_SECONDS: '3601' },
    { SPORTS247_VIETNAM_CACHE_SECONDS: '90.5' }, { SPORTS247_VIETNAM_CACHE_SECONDS: 'abc' },
  ]) assert.equal(getVietnamFeedConfig({ ...input, ...changes }), null);
  assert.equal(getVietnamFeedConfig({ ...input, SPORTS247_VIETNAM_CACHE_SECONDS: '90' }).cacheSeconds, 90);
  assert.equal(getVietnamFeedConfig({ ...input, SPORTS247_VIETNAM_CACHE_SECONDS: '300' }).cacheSeconds, 300);
});

test('maps live and finished Vietnamese fixtures, strict league match, safe team images and scores', () => {
  const match = mapVietnamFixture(fixture(), 'vie.1', 123, DAY);
  assert.equal(match.id, 'vie.1:901');
  assert.equal(match.startTime, '2026-10-31T11:00:00.000Z');
  assert.equal(match.status, 'live');
  assert.equal(match.statusDetail, "34'");
  assert.equal(match.source, 'API-Football');
  assert.equal(match.home.logo, 'https://media.api-sports.io/football/teams/17.png');
  assert.equal(match.away.logo, null);
  assert.deepEqual([match.homeScore, match.awayScore], [2, 1]);

  const finished = fixture(2);
  finished.fixture.status = { short: 'FT', long: 'Match Finished', elapsed: 90 };
  finished.goals = { home: -1, away: 0 };
  const mapped = mapVietnamFixture(finished, 'vie.2', 456, DAY);
  assert.equal(mapped.status, 'finished');
  assert.deepEqual([mapped.homeScore, mapped.awayScore], [null, 0]);
  const scheduled = fixture();
  scheduled.fixture.status.short = 'NS';
  assert.equal(mapVietnamFixture(scheduled, 'vie.1', 123, DAY).homeScore, null);
});

test('Vietnam fixture interruptions, postponements and cancellation retain accurate status and scores', () => {
  for (const [short, expectedStatus, expectedLabel, hasScore] of [
    ['PST', 'postponed', 'Hoãn', false], ['CANC', 'cancelled', 'Hủy', false],
    ['INT', 'interrupted', 'Gián đoạn', true], ['SUSP', 'interrupted', 'Gián đoạn', true],
    ['ABD', 'interrupted', 'Gián đoạn', true],
  ]) {
    const input = fixture();
    input.fixture.status = { short, long: 'Provider text', elapsed: null };
    const match = mapVietnamFixture(input, 'vie.1', 123, DAY);
    assert.equal(match.status, expectedStatus, short);
    assert.equal(match.statusDetail, expectedLabel, short);
    assert.deepEqual([match.homeScore, match.awayScore], hasScore ? [2, 1] : [null, null], short);
  }
});

test('Vietnam administrative awards and walkovers never appear as played FT fixtures', () => {
  for (const [short, label] of [['AWD', 'Xử thắng'], ['WO', 'Bỏ cuộc']]) {
    const input = fixture();
    input.fixture.status = { short, long: 'Match Finished', elapsed: 90 };
    const match = mapVietnamFixture(input, 'vie.1', 123, DAY);
    assert.equal(match.status, 'awarded', short);
    assert.equal(match.statusDetail, label, short);
    assert.deepEqual([match.homeScore, match.awayScore], [2, 1], short);
  }
  for (const short of ['FT', 'AET', 'PEN']) {
    const input = fixture();
    input.fixture.status = { short, long: 'Match Finished', elapsed: 90 };
    assert.equal(mapVietnamFixture(input, 'vie.1', 123, DAY).status, 'finished', short);
  }
});

test('rejects wrong league, date, country, duplicated teams and invalid fixtures', () => {
  const valid = fixture();
  const cases = [
    fixture(2), fixture(1, { league: { id: 123, name: 'V.League 2', country: 'Vietnam' } }),
    fixture(1, { league: { id: 123, name: 'V.League 10', country: 'Vietnam' } }),
    fixture(1, { league: { id: 123, name: 'V.League 1', country: 'Thailand' } }),
    fixture(1, { fixture: { ...valid.fixture, date: '2026-11-01T00:30:00+07:00' } }),
    fixture(1, { fixture: { ...valid.fixture, date: 'invalid date' } }),
    fixture(1, { teams: { ...valid.teams, away: { id: 17, name: 'Duplicate' } } }),
    fixture(1, { teams: { ...valid.teams, home: { id: 0, name: 'Unknown' } } }),
    fixture(1, { fixture: { ...valid.fixture, id: -3 } }),
  ];
  for (const invalid of cases) assert.equal(mapVietnamFixture(invalid, 'vie.1', 123, DAY), null);
});

test('fetches both divisions with Vietnamese timezone and validates all entries', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    seen.push({ parsed, options });
    const division = parsed.searchParams.get('league') === '123' ? 1 : 2;
    return new Response(JSON.stringify({ errors: [], response: [fixture(division)] }), { status: 200 });
  };
  try {
    const data = await getVietnamMatches(DAY, { ...validConfig, cacheSeconds: 90 });
    assert.equal(data.errors.length, 0);
    assert.deepEqual(data.failedLeagues, []);
    assert.deepEqual(data.matches.map(({ leagueId }) => leagueId), ['vie.1', 'vie.2']);
    assert.equal(seen.length, 2);
    for (const { parsed, options } of seen) {
      assert.equal(parsed.hostname, 'v3.football.api-sports.io');
      assert.equal(parsed.searchParams.get('season'), '2026');
      assert.equal(parsed.searchParams.get('timezone'), 'Asia/Ho_Chi_Minh');
      assert.equal(parsed.searchParams.get('date'), DAY);
      assert.equal(parsed.href.includes(validConfig.apiKey), false);
      assert.equal(options.headers['x-apisports-key'], validConfig.apiKey);
      assert.equal(options.next.revalidate, 90);
    }
  } finally { globalThis.fetch = original; }
});

test('retains verified fixtures but flags inconsistent records, 401 and quota errors', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const id = new URL(url).searchParams.get('league');
    if (id === '123') return new Response(JSON.stringify({ errors: [], response: [fixture(),
      fixture(1, { league: { id: 123, name: 'V.League 2', country: 'Vietnam' } })] }), { status: 200 });
    return new Response(JSON.stringify({ errors: { requests: 'quota exceeded' }, response: [] }), { status: 200 });
  };
  try {
    const result = await getVietnamMatches(DAY, validConfig);
    assert.deepEqual(result.matches.map(({ id }) => id), ['vie.1:901']);
    assert.equal(result.errors.length, 2);
    assert.deepEqual(result.failedLeagues, ['vie.1', 'vie.2']);
    assert.match(result.errors[0], /V.League 1/);
    assert.match(result.errors[0], /chưa đầy đủ/);
  } finally { globalThis.fetch = original; }

  globalThis.fetch = async () => new Response('', { status: 401 });
  try {
    const result = await getVietnamMatches(DAY, validConfig);
    assert.equal(result.errors.length, 2);
    assert.deepEqual(result.failedLeagues, ['vie.1', 'vie.2']);
  } finally { globalThis.fetch = original; }
});

test('malformed and duplicated provider entries do not erase valid fixtures in either division', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const id = new URL(url).searchParams.get('league');
    if (id === '123') {
      const malformed = fixture(1, { teams: { home: { id: 18, name: 9 }, away: { id: 19, name: 'Visitors' } } });
      return new Response(JSON.stringify({ errors: [], response: [null, false, malformed,
        fixture(1), fixture(1)] }), { status: 200 });
    }
    return new Response(JSON.stringify({ errors: [], response: [fixture(2)] }), { status: 200 });
  };
  try {
    const result = await getVietnamMatches(DAY, validConfig);
    assert.deepEqual(result.matches.map(({ id }) => id), ['vie.1:901', 'vie.2:902']);
    assert.deepEqual(result.failedLeagues, ['vie.1']);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /chưa đầy đủ/);
  } finally { globalThis.fetch = original; }
});

test('a fully mismatched or malformed division never pretends to be complete', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => new URL(url).searchParams.get('league') === '123'
    ? new Response(JSON.stringify({ errors: [], response: [null,
      fixture(1, { league: { id: 456, name: 'V.League 2', country: 'Vietnam' } })] }), { status: 200 })
    : new Response(JSON.stringify({ errors: [], response: [fixture(2)] }), { status: 200 });
  try {
    const result = await getVietnamMatches(DAY, validConfig);
    assert.deepEqual(result.matches.map(({ id }) => id), ['vie.2:902']);
    assert.deepEqual(result.failedLeagues, ['vie.1']);
  } finally { globalThis.fetch = original; }
});

test('keeps valid V.League 1 results when V.League 2 is temporarily unavailable', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => new URL(url).searchParams.get('league') === '123'
    ? new Response(JSON.stringify({ errors: [], response: [fixture(1)] }), { status: 200 })
    : new Response('', { status: 503 });
  try {
    const result = await getVietnamMatches(DAY, validConfig);
    assert.deepEqual(result.matches.map(({ leagueId }) => leagueId), ['vie.1']);
    assert.deepEqual(result.failedLeagues, ['vie.2']);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /V.League 2/);
  } finally { globalThis.fetch = original; }
});
