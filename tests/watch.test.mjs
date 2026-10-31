import test from 'node:test';
import assert from 'node:assert/strict';
import { getMatchWatch, isScorebatFeedRelevant, isScorebatPlaybackLicensed, matchScorebatVideo, normalizeTeam, scorebatEmbedUrl } from '../src/lib/football/watch.ts';

const sample = [{
  date: '2026-10-31T12:30:00Z',
  homeTeam: { name: 'Chelsea FC' }, awayTeam: { name: 'Manchester United' },
  videos: [{ title: 'Official stream', embed: '<iframe src="https://www.scorebat.com/embed/v/123abc/?token=public&amp;autoplay=0"></iframe>' }],
}];

test('Authorized source and exact fixture match produce a video URL', () => {
  assert.equal(normalizeTeam('Atlético FC'), 'atletico');
  assert.deepEqual(matchScorebatVideo(sample, 'Chelsea', 'Manchester United', '2026-10-31T12:30:00Z'), {
    embedUrl: 'https://www.scorebat.com/embed/v/123abc/?token=public&autoplay=0', title: 'Official stream',
  });
});

test('known cross-provider team spelling variants match without accepting unrelated clubs', () => {
  assert.equal(normalizeTeam('Man Utd'), normalizeTeam('Manchester United FC'));
  assert.equal(normalizeTeam('Bayern München'), normalizeTeam('Bayern Munich'));
  assert.equal(normalizeTeam('PSG'), normalizeTeam('Paris Saint-Germain'));
  assert.equal(normalizeTeam('Inter'), 'inter');
  assert.notEqual(normalizeTeam('Inter'), normalizeTeam('Inter Miami'));
  assert.ok(matchScorebatVideo(sample, 'Chelsea FC', 'Man Utd', sample[0].date));
  assert.equal(matchScorebatVideo(sample, 'Chelsea FC', 'Man City', sample[0].date), null);
});

test('Wrong opponents or kickoff never surface unrelated broadcast', () => {
  assert.equal(matchScorebatVideo(sample, 'Arsenal', 'Manchester United', '2026-10-31T12:30:00Z'), null);
  assert.equal(matchScorebatVideo(sample, 'Chelsea', 'Manchester United', '2026-10-31T16:30:00Z'), null);
});

test('Only first-party HTTPS embed links are accepted from external video HTML', () => {
  assert.equal(scorebatEmbedUrl('<iframe src="javascript:alert(1)"></iframe>'), null);
  assert.equal(scorebatEmbedUrl('<iframe src="https://www.scorebat.com.evil.test/embed/v/123abc/"></iframe>'), null);
  assert.equal(scorebatEmbedUrl('<iframe src="https://www.scorebat.com/anything/else"></iframe>'), null);
  assert.equal(scorebatEmbedUrl('<iframe src="http://www.scorebat.com/embed/v/123abc/"></iframe>'), null);
});

test('unconfigured watch returns a clear state without contacting upstream providers', async () => {
  const originalToken = process.env.SCOREBAT_API_TOKEN;
  const originalFetch = globalThis.fetch;
  delete process.env.SCOREBAT_API_TOKEN;
  globalThis.fetch = () => { throw new Error('should not call fetch without API key'); };
  try {
    const result = await getMatchWatch('eng.1', '401879248');
    assert.equal(result.status, 'unconfigured');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SCOREBAT_API_TOKEN;
    else process.env.SCOREBAT_API_TOKEN = originalToken;
  }
});

test('live video requires explicit league and territory permission', () => {
  assert.equal(isScorebatPlaybackLicensed('eng.1', 'VN', 'eng.1:VN,ita.1:TH'), true);
  assert.equal(isScorebatPlaybackLicensed('ita.1', 'TH', 'eng.1:VN,ita.1:TH'), true);
  assert.equal(isScorebatPlaybackLicensed('eng.1', 'TH', 'eng.1:VN,ita.1:TH'), false);
  assert.equal(isScorebatPlaybackLicensed('ita.1', 'VN', 'eng.1:VN,ita.1:TH'), false);
  assert.equal(isScorebatPlaybackLicensed('eng.1', 'US', 'eng.1:VN'), false);
  assert.equal(isScorebatPlaybackLicensed('ger.1', 'VN', 'eng.1:VN'), false);
  assert.equal(isScorebatPlaybackLicensed('eng.1', null, 'eng.1:VN'), false);
  assert.equal(isScorebatPlaybackLicensed('eng.1', 'VN', undefined), false);
  assert.equal(isScorebatPlaybackLicensed('eng.1', 'VNX', 'eng.1:VN'), false);
  assert.equal(isScorebatPlaybackLicensed('eng.1', 'VN', 'eng.1:VN:TH'), false);
});

test('a token without territorial permission never calls ScoreBat or ESPN', async () => {
  const originalToken = process.env.SCOREBAT_API_TOKEN;
  const originalMarkets = process.env.SCOREBAT_LICENSED_MARKETS;
  const originalFetch = globalThis.fetch;
  process.env.SCOREBAT_API_TOKEN = 'test-api-token';
  delete process.env.SCOREBAT_LICENSED_MARKETS;
  globalThis.fetch = () => { throw new Error('unauthorized access must not call upstream'); };
  try {
    assert.equal((await getMatchWatch('eng.1', '401879248', 'VN')).status, 'restricted');
    process.env.SCOREBAT_LICENSED_MARKETS = 'eng.1:VN';
    assert.equal((await getMatchWatch('eng.1', '401879248', 'US')).status, 'restricted');
    assert.equal((await getMatchWatch('eng.1', '401879248', null)).status, 'restricted');
    assert.equal((await getMatchWatch('esp.1', '401879248', 'VN')).status, 'restricted');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SCOREBAT_API_TOKEN;
    else process.env.SCOREBAT_API_TOKEN = originalToken;
    if (originalMarkets === undefined) delete process.env.SCOREBAT_LICENSED_MARKETS;
    else process.env.SCOREBAT_LICENSED_MARKETS = originalMarkets;
  }
});

test('server-only ScoreBat API token is never returned inside an embed URL', async () => {
  const originalToken = process.env.SCOREBAT_API_TOKEN;
  const originalMarkets = process.env.SCOREBAT_LICENSED_MARKETS;
  const originalFetch = globalThis.fetch;
  process.env.SCOREBAT_API_TOKEN = 'very-secret-api-token';
  process.env.SCOREBAT_LICENSED_MARKETS = 'eng.1:VN';
  let clip = { title: 'Live', embed:
    '<iframe src="https://www.scorebat.com/embed/v/123abc/?context=prefix-very-secret-api-token-suffix"></iframe>',
  };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes('/summary?event=')
      ? { header: { competitions: [{ date: '2026-10-31T12:30:00Z', competitors: [
        { homeAway: 'home', team: { displayName: 'Chelsea' } },
        { homeAway: 'away', team: { displayName: 'Manchester United' } },
      ] }] } }
      : { response: [{ ...sample[0], videos: [clip] }] },
  });
  try {
    const forbidden = [
      { title: 'Live', embed: '<iframe src="https://www.scorebat.com/embed/v/123abc/?context=prefix-very-secret-api-token-suffix"></iframe>' },
      { title: 'Live', embed: '<iframe src="https://www.scorebat.com/embed/v/123abc/?very-secret-api-token=1"></iframe>' },
      { title: 'Live', embed: '<iframe src="https://www.scorebat.com/embed/v/123abc/#very-secret-api-token"></iframe>' },
      { title: 'Live', embed: '<iframe src="https://www.scorebat.com/embed/v/123abc/?id=very%2Dsecret%2Dapi%2Dtoken"></iframe>' },
      { title: 'Live very-secret-api-token', embed: '<iframe src="https://www.scorebat.com/embed/v/123abc/"></iframe>' },
    ];
    for (const scenario of forbidden) {
      clip = scenario;
      const result = await getMatchWatch('eng.1', '401879248', 'VN', Date.parse(sample[0].date));
      assert.equal(result.status, 'unavailable', `Expected denied embed: ${scenario.embed}`);
      assert.ok(!JSON.stringify(result).includes('very-secret-api-token'));
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SCOREBAT_API_TOKEN;
    else process.env.SCOREBAT_API_TOKEN = originalToken;
    if (originalMarkets === undefined) delete process.env.SCOREBAT_LICENSED_MARKETS;
    else process.env.SCOREBAT_LICENSED_MARKETS = originalMarkets;
  }
});

test('finished match video is clearly marked as replay, not live', async () => {
  const originalToken = process.env.SCOREBAT_API_TOKEN;
  const originalMarkets = process.env.SCOREBAT_LICENSED_MARKETS;
  const originalFetch = globalThis.fetch;
  process.env.SCOREBAT_API_TOKEN = 'test-api-token';
  process.env.SCOREBAT_LICENSED_MARKETS = 'eng.1:VN';
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes('/summary?event=')
      ? { header: { competitions: [{
        date: sample[0].date, status: { type: { state: 'post' } }, competitors: [
          { homeAway: 'home', team: { displayName: 'Chelsea' } },
          { homeAway: 'away', team: { displayName: 'Manchester United' } },
        ],
      }] } }
      : { response: sample },
  });
  try {
    const result = await getMatchWatch('eng.1', '401879248', 'VN', Date.parse(sample[0].date));
    assert.equal(result.status, 'ready');
    assert.equal(result.broadcastType, 'replay');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SCOREBAT_API_TOKEN;
    else process.env.SCOREBAT_API_TOKEN = originalToken;
    if (originalMarkets === undefined) delete process.env.SCOREBAT_LICENSED_MARKETS;
    else process.env.SCOREBAT_LICENSED_MARKETS = originalMarkets;
  }
});

test('live-feed eligibility prevents paid calls too early or for old events', async () => {
  const kickoff = Date.parse(sample[0].date);
  assert.equal(isScorebatFeedRelevant(sample[0].date, kickoff - 31 * 60_000), false);
  assert.equal(isScorebatFeedRelevant(sample[0].date, kickoff - 6 * 60_000), false);
  assert.equal(isScorebatFeedRelevant(sample[0].date, kickoff - 5 * 60_000), true);
  assert.equal(isScorebatFeedRelevant(sample[0].date, kickoff + 71 * 60 * 60_000), true);
  assert.equal(isScorebatFeedRelevant(sample[0].date, kickoff + 73 * 60 * 60_000), false);
  assert.equal(isScorebatFeedRelevant('invalid', kickoff), false);

  const originalToken = process.env.SCOREBAT_API_TOKEN;
  const originalMarkets = process.env.SCOREBAT_LICENSED_MARKETS;
  const originalFetch = globalThis.fetch;
  process.env.SCOREBAT_API_TOKEN = 'test-api-token';
  process.env.SCOREBAT_LICENSED_MARKETS = 'eng.1:VN';
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes('scorebat.com')) throw new Error('paid feed must not be contacted');
    return { ok: true, json: async () => ({ header: { competitions: [{
      date: sample[0].date, competitors: [
        { homeAway: 'home', team: { displayName: 'Chelsea' } },
        { homeAway: 'away', team: { displayName: 'Manchester United' } },
      ],
    }] } }) };
  };
  try {
    for (const now of [kickoff - 60 * 60_000, kickoff + 10 * 24 * 60 * 60_000]) {
      const result = await getMatchWatch('eng.1', '401879248', 'VN', now);
      assert.equal(result.status, 'unavailable');
    }
    assert.equal(requests.length, 2);
    assert.ok(requests.every((url) => url.includes('site.api.espn.com')));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SCOREBAT_API_TOKEN;
    else process.env.SCOREBAT_API_TOKEN = originalToken;
    if (originalMarkets === undefined) delete process.env.SCOREBAT_LICENSED_MARKETS;
    else process.env.SCOREBAT_LICENSED_MARKETS = originalMarkets;
  }
});
