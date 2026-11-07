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
  assert.notEqual(normalizeTeam('FC Barcelona'), normalizeTeam('Barcelona SC'));
  assert.ok(matchScorebatVideo(sample, 'Chelsea FC', 'Man Utd', sample[0].date));
  assert.equal(matchScorebatVideo(sample, 'Chelsea FC', 'Man City', sample[0].date), null);
  const ecuadorianClub = [{ ...sample[0], homeTeam: { name: 'Barcelona SC' } }];
  assert.equal(matchScorebatVideo(ecuadorianClub, 'FC Barcelona', 'Manchester United', sample[0].date), null);
});

test('Wrong opponents or kickoff never surface unrelated broadcast', () => {
  assert.equal(matchScorebatVideo(sample, 'Arsenal', 'Manchester United', '2026-10-31T12:30:00Z'), null);
  assert.equal(matchScorebatVideo(sample, 'Chelsea', 'Manchester United', '2026-10-31T16:30:00Z'), null);
});

test('malformed ScoreBat items are skipped without hiding a later legitimate video', () => {
  const bad = [null, 42, 'wrong', {},
    { date: sample[0].date, homeTeam: { name: 13 }, awayTeam: { name: 'Manchester United' }, videos: sample[0].videos },
    { ...sample[0], videos: null },
    { ...sample[0], videos: [null, 1, { embed: 99 }, { embed: '<iframe src="https://other.example/embed/v/abcd"></iframe>' }] },
    { ...sample[0], videos: [{ embed: sample[0].videos[0].embed, title: { suspicious: true } }] },
  ];
  assert.deepEqual(matchScorebatVideo(bad, 'Chelsea', 'Manchester United', sample[0].date), {
    embedUrl: 'https://www.scorebat.com/embed/v/123abc/?token=public&autoplay=0',
    title: 'Phát trực tiếp chính thức',
  });
  assert.equal(matchScorebatVideo([null, { ...sample[0], videos: [null] }], 'Chelsea', 'Manchester United', sample[0].date), null);
  assert.equal(matchScorebatVideo(null, 'Chelsea', 'Manchester United', sample[0].date), null);
  assert.equal(scorebatEmbedUrl('<iframe src="https://www.scorebat.com/embed/v/abc/"></iframe>'.repeat(400)), null);
});

test('watch API adapter still resolves a licensed match when the feed contains broken records', async () => {
  const previousToken = process.env.SCOREBAT_API_TOKEN;
  const previousMarkets = process.env.SCOREBAT_LICENSED_MARKETS;
  const originalFetch = globalThis.fetch;
  process.env.SCOREBAT_API_TOKEN = 'test-api-token';
  process.env.SCOREBAT_LICENSED_MARKETS = 'eng.1:VN';
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes('/summary?event=')
      ? { header: { competitions: [{
        date: sample[0].date, competitors: [
          { homeAway: 'home', team: { displayName: 'Chelsea' } },
          { homeAway: 'away', team: { displayName: 'Manchester United' } },
        ],
      }] } }
      : { response: [null, { ...sample[0], videos: [undefined, { embed: false }] }, sample[0]] },
  });
  try {
    const result = await getMatchWatch('eng.1', '401879248', 'VN', Date.parse(sample[0].date));
    assert.equal(result.status, 'ready');
    assert.equal(result.provider, 'ScoreBat');
    assert.equal(result.embedUrl, 'https://www.scorebat.com/embed/v/123abc/?token=public&autoplay=0');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.SCOREBAT_API_TOKEN;
    else process.env.SCOREBAT_API_TOKEN = previousToken;
    if (previousMarkets === undefined) delete process.env.SCOREBAT_LICENSED_MARKETS;
    else process.env.SCOREBAT_LICENSED_MARKETS = previousMarkets;
  }
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

test('invalid or mismatched ESPN fixtures fail closed before any paid video request', async () => {
  const previousToken = process.env.SCOREBAT_API_TOKEN;
  const previousMarkets = process.env.SCOREBAT_LICENSED_MARKETS;
  const originalFetch = globalThis.fetch;
  process.env.SCOREBAT_API_TOKEN = 'test-api-token';
  process.env.SCOREBAT_LICENSED_MARKETS = 'eng.1:VN';
  const fixture = {
    date: sample[0].date,
    competitors: [
      { homeAway: 'home', team: { displayName: 'Chelsea' } },
      { homeAway: 'away', team: { displayName: 'Manchester United' } },
    ],
  };
  const invalidHeaders = [
    null,
    { competitions: 'invalid' },
    { competitions: [] },
    { competitions: [fixture, fixture] },
    { competitions: [fixture, { ...fixture, id: '401879249' }] },
    { competitions: [{ ...fixture, competitors: [
      { homeAway: 'home', team: { id: '100', displayName: 'Chelsea' } },
      { homeAway: 'away', team: { id: '100', displayName: 'Manchester United' } },
    ] }] },
    { competitions: [{ ...fixture, competitors: { homeAway: 'home' } }] },
    { competitions: [{ ...fixture, competitors: [null, ...fixture.competitors, fixture.competitors[0]] }] },
    { competitions: [{ ...fixture, competitors: [...fixture.competitors, { homeAway: 'neutral', team: { displayName: 'Third Club' } }] }] },
    { competitions: [{ ...fixture, competitors: [
      { homeAway: 'home', team: { displayName: 42 } }, fixture.competitors[1],
    ] }] },
    { competitions: [{ ...fixture, date: 12345 }] },
    { competitions: [{ ...fixture, date: 'not-a-date' }] },
    { id: '401879249', competitions: [fixture] },
    { competitions: [{ ...fixture, id: '401879249' }] },
  ];
  let current = null;
  let rawSummary;
  let paidRequests = 0;
  globalThis.fetch = async (url) => {
    if (!String(url).includes('site.api.espn.com')) {
      paidRequests++;
      throw new Error('Malformed ESPN data must not spend video credits');
    }
    return Response.json(rawSummary === undefined ? { header: current } : rawSummary);
  };
  try {
    for (const payload of [null, [], 'invalid', 404]) {
      rawSummary = payload;
      const result = await getMatchWatch('eng.1', '401879248', 'VN', Date.parse(sample[0].date));
      assert.equal(result.status, 'unavailable', JSON.stringify(payload));
    }
    rawSummary = undefined;
    for (const candidate of invalidHeaders) {
      current = candidate;
      const result = await getMatchWatch('eng.1', '401879248', 'VN', Date.parse(sample[0].date));
      assert.equal(result.status, 'unavailable', JSON.stringify(candidate));
      assert.match(result.message, /hai đội/);
    }
    assert.equal(paidRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.SCOREBAT_API_TOKEN;
    else process.env.SCOREBAT_API_TOKEN = previousToken;
    if (previousMarkets === undefined) delete process.env.SCOREBAT_LICENSED_MARKETS;
    else process.env.SCOREBAT_LICENSED_MARKETS = previousMarkets;
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

test('postponed, cancelled or interrupted fixtures do not spend video credits or serve stale ScoreBat clips', async () => {
  const originalToken = process.env.SCOREBAT_API_TOKEN;
  const originalMarkets = process.env.SCOREBAT_LICENSED_MARKETS;
  const originalFetch = globalThis.fetch;
  process.env.SCOREBAT_API_TOKEN = 'test-api-token';
  process.env.SCOREBAT_LICENSED_MARKETS = 'eng.1:VN';
  const calls = [];
  let name = 'STATUS_POSTPONED';
  let level = 'competition';
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (!String(url).includes('site.api.espn.com')) throw new Error('do not contact paid video or budget provider');
    const status = { type: { name, state: name === 'STATUS_SUSPENDED' ? 'in' : 'post' } };
    const game = { date: sample[0].date, competitors: [
      { homeAway: 'home', team: { displayName: 'Chelsea' } },
      { homeAway: 'away', team: { displayName: 'Manchester United' } },
    ] };
    return { ok: true, json: async () => ({ header: {
      ...(level === 'header' ? { status } : {}),
      competitions: [{ ...game, ...(level === 'competition' ? { status } : {}) }],
    } }) };
  };
  try {
    for (const scenario of [
      ['STATUS_POSTPONED', 'competition', 'hoãn'],
      ['STATUS_CANCELED', 'header', 'hủy'],
      ['STATUS_SUSPENDED', 'competition', 'gián đoạn'],
    ]) {
      [name, level] = scenario;
      const result = await getMatchWatch('eng.1', '401879248', 'VN', Date.parse(sample[0].date));
      assert.equal(result.status, 'unavailable', name);
      assert.match(result.message, new RegExp(scenario[2]));
    }
    assert.equal(calls.length, 3);
    assert.ok(calls.every((url) => url.includes('site.api.espn.com')));
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
