import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from '../src/app/api/release/route.ts';
import { waitForRelease } from '../scripts/wait-for-release.mjs';

const current = 'a'.repeat(40);
const previous = 'b'.repeat(40);

test('release endpoint reports a valid deployment SHA without caching', async () => {
  const original = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    process.env.VERCEL_GIT_COMMIT_SHA = current;
    const response = GET();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { commitSha: current });
    process.env.VERCEL_GIT_COMMIT_SHA = 'invalid';
    assert.deepEqual(await GET().json(), { commitSha: null });
  } finally {
    if (original === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = original;
  }
});

test('waits for production to serve the intended commit', async () => {
  let clock = 0;
  const seen = [];
  const result = await waitForRelease({
    expectedSha: current, timeoutMs: 10000, intervalMs: 500,
    now: () => clock,
    sleepImpl: async (ms) => { clock += ms; },
    fetchImpl: async (url, options) => {
      seen.push({ url: String(url), cache: options.cache });
      return Response.json({ commitSha: seen.length === 1 ? previous : current });
    },
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.elapsedMs, 500);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((request) => request.url === 'https://sports247-three.vercel.app/api/release'));
  assert.ok(seen.every((request) => request.cache === 'no-store'));
});

test('rejects an unavailable or stale deployment after a bounded wait', async () => {
  let clock = 0;
  await assert.rejects(waitForRelease({
    expectedSha: current, timeoutMs: 1000, intervalMs: 200,
    now: () => clock,
    sleepImpl: async (ms) => { clock += ms; },
    fetchImpl: async () => Response.json({ commitSha: previous }),
  }), /last observed: b{40}/);
  assert.equal(clock, 1000);
});

test('rejects invalid configuration before contacting production', async () => {
  await assert.rejects(waitForRelease({ expectedSha: 'invalid' }), /40-character Git SHA/);
  await assert.rejects(waitForRelease({ base: 'http://example.com', expectedSha: current }), /HTTPS origin/);
});
