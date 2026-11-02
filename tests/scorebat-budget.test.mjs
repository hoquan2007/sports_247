import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveScorebatCredits } from '../src/lib/football/scorebat-budget.ts';
import { getMatchWatch } from '../src/lib/football/watch.ts';

const settings = {
  SCOREBAT_MONTHLY_CREDIT_LIMIT: '12',
  UPSTASH_REDIS_REST_URL: 'https://budget.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token-only-on-server',
};

test('shared atomic reservations stop at the budget and roll to a new UTC month', async () => {
  const originalFetch = globalThis.fetch;
  const usage = new Map();
  const commands = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), settings.UPSTASH_REDIS_REST_URL);
    assert.equal(options.headers.Authorization, `Bearer ${settings.UPSTASH_REDIS_REST_TOKEN}`);
    assert.equal(options.cache, 'no-store');
    const [command, script, keys, key, cost, limit, expiry] = JSON.parse(options.body);
    assert.equal(command, 'EVAL');
    assert.match(script, /INCRBY/);
    assert.equal(keys, 1);
    assert.equal(expiry, key.endsWith('2026-10') ? 1793491200 : 1796083200);
    commands.push({ key, cost });
    const current = usage.get(key) || 0;
    if (current + cost > limit) return Response.json({ result: [0, current] });
    usage.set(key, current + cost);
    return Response.json({ result: [1, current + cost] });
  };
  try {
    const october = Date.parse('2026-10-31T12:00:00Z');
    assert.equal((await reserveScorebatCredits(5, october, settings)).status, 'allowed');
    assert.equal((await reserveScorebatCredits(5, october, settings)).used, 10);
    assert.equal((await reserveScorebatCredits(1, october, settings)).used, 11);
    assert.equal((await reserveScorebatCredits(5, october, settings)).status, 'exhausted');
    assert.equal((await reserveScorebatCredits(5, Date.parse('2026-11-01T00:00:00Z'), settings)).used, 5);
    assert.deepEqual([...usage.keys()], ['sports247:scorebat:credits:2026-10', 'sports247:scorebat:credits:2026-11']);
    assert.deepEqual(commands.map((command) => command.cost), [5, 5, 1, 5, 5]);
  } finally { globalThis.fetch = originalFetch; }
});

test('partial settings, unsafe Redis URL, HTTP errors and malformed responses all fail closed', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (line) => { warnings.push(JSON.parse(String(line))); };
  try {
  assert.deepEqual(await reserveScorebatCredits(5, Date.now(), {}), { status: 'unlimited' });
  assert.deepEqual(await reserveScorebatCredits(5, Date.now(), { SCOREBAT_MONTHLY_CREDIT_LIMIT: '20' }), { status: 'unavailable' });
  for (const url of ['http://budget.upstash.io', 'https://localhost',
    'https://budget.upstash.io/path', 'https://budget.upstash.io@evil.test']) {
    assert.equal((await reserveScorebatCredits(5, Date.now(), { ...settings, UPSTASH_REDIS_REST_URL: url })).status, 'unavailable');
  }
    globalThis.fetch = async () => new Response('{}', { status: 500 });
    assert.equal((await reserveScorebatCredits(5, Date.now(), settings)).status, 'unavailable');
    globalThis.fetch = async () => new Response('{bad-json', { status: 200 });
    assert.equal((await reserveScorebatCredits(5, Date.now(), settings)).status, 'unavailable');
    globalThis.fetch = async () => Response.json({ error: 'script disabled' });
    assert.equal((await reserveScorebatCredits(5, Date.now(), settings)).status, 'unavailable');
    globalThis.fetch = async () => { throw new Error('database not reachable'); };
    assert.equal((await reserveScorebatCredits(5, Date.now(), settings)).status, 'unavailable');
    assert.deepEqual(new Set(warnings.map(({ reason }) => reason)), new Set([
      'invalid_settings', 'invalid_redis_url', 'redis_http_error',
      'redis_invalid_json', 'redis_invalid_result', 'redis_connection_error',
    ]));
    for (const warning of warnings) {
      assert.equal(warning.status, 'unavailable');
      assert.equal(warning.reservedCredits, 0);
    }
    const output = JSON.stringify(warnings);
    for (const secret of [settings.UPSTASH_REDIS_REST_TOKEN, 'database not reachable',
      settings.UPSTASH_REDIS_REST_URL]) assert.equal(output.includes(secret), false);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});

test('live watch only calls ScoreBat after reserving API credits, and reserves a view credit before returning an iframe', async () => {
  const names = ['SCOREBAT_API_TOKEN', 'SCOREBAT_LICENSED_MARKETS',
    'SCOREBAT_MONTHLY_CREDIT_LIMIT', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const prior = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    ...settings, SCOREBAT_API_TOKEN: 'private-scorebat-key', SCOREBAT_LICENSED_MARKETS: 'eng.1:VN',
  });
  const calls = [];
  let usage = 0;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    calls.push(target);
    if (target.includes('upstash.io')) {
      const [, , , , cost, limit] = JSON.parse(options.body);
      if (usage + cost > limit) return Response.json({ result: [0, usage] });
      usage += cost;
      return Response.json({ result: [1, usage] });
    }
    if (target.includes('site.api.espn.com')) return Response.json({
      header: { competitions: [{
        date: '2026-10-31T12:30:00Z', status: { type: { state: 'in' } },
        competitors: [
          { homeAway: 'home', team: { displayName: 'Chelsea' } },
          { homeAway: 'away', team: { displayName: 'Manchester United' } },
        ],
      }] },
    });
    if (target.includes('scorebat.com')) return Response.json({ response: [{
      date: '2026-10-31T12:30:00Z', homeTeam: { name: 'Chelsea' },
      awayTeam: { name: 'Manchester United' },
      videos: [{ title: 'Official video', embed: '<iframe src="https://www.scorebat.com/embed/v/test123/"></iframe>' }],
    }] });
    throw new Error('Unexpected external request');
  };
  try {
    const now = Date.parse('2026-10-31T12:30:00Z');
    const first = await getMatchWatch('eng.1', '401879248', 'VN', now);
    assert.equal(first.status, 'ready');
    assert.equal(first.provider, 'ScoreBat');
    assert.equal(usage, 6);
    assert.equal(calls.filter((url) => url.includes('scorebat.com')).length, 1);
    const second = await getMatchWatch('eng.1', '401879248', 'VN', now);
    assert.equal(second.status, 'ready');
    assert.equal(usage, 12);
    const third = await getMatchWatch('eng.1', '401879248', 'VN', now);
    assert.equal(third.status, 'unavailable');
    assert.match(third.message, /ngân sách/i);
    assert.equal(calls.filter((url) => url.includes('scorebat.com')).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of names) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});
