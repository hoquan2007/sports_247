import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monitorProduction } from '../scripts/monitor-production.mjs';

const date = '2026-10-31';
const feed = { date, matches: [], partial: false, errors: [], failedLeagues: [], pendingLeagues: ['vie.1'] };
const table = { leagueId: 'eng.1', groups: [{ entries: [{ name: 'Team' }] }] };

function fakeFetch({ homepage = 200, matches = feed, standings = table } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(new URL(url).pathname);
      const path = new URL(url).pathname;
      if (path === '/') return new Response('<html>SPORTS247</html>', { status: homepage, headers: { 'content-type': 'text/html' } });
      if (path === '/api/matches') return Response.json(matches);
      if (path === '/api/standings') return Response.json(standings);
      throw new Error('Unexpected endpoint');
    },
  };
}

test('probes only free endpoints and keeps V.League pending informational', async () => {
  const fake = fakeFetch();
  const result = await monitorProduction({ date, ...fake, failOnPartial: true });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(fake.calls, ['/', '/api/matches', '/api/standings']);
  assert.deepEqual(result.checks.find((check) => check.name === 'vietnam-feed')?.leagues, ['vie.1']);
});

test('fails on malformed response, unavailable homepage, and degraded upstream with strict mode', async () => {
  const malformed = await monitorProduction({ date, ...fakeFetch({ homepage: 503, standings: { groups: [] } }) });
  assert.equal(malformed.status, 'FAIL');
  assert.equal(malformed.errors.length, 2);
  const partialFeed = { ...feed, partial: true, errors: ['timeout'], failedLeagues: ['eng.1'] };
  const warn = await monitorProduction({ date, ...fakeFetch({ matches: partialFeed }) });
  const fail = await monitorProduction({ date, ...fakeFetch({ matches: partialFeed }), failOnPartial: true });
  assert.equal(warn.status, 'WARN');
  assert.equal(fail.status, 'FAIL');
});
