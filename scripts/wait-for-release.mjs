import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'https://sports247-three.vercel.app';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Verify that the public production alias serves the exact commit before release smoke checks. */
export async function waitForRelease({
  base = DEFAULT_BASE, expectedSha, timeoutMs = 240000, intervalMs = 5000,
  fetchImpl = fetch, sleepImpl = delay, now = Date.now,
} = {}) {
  const origin = new URL(base);
  assert.equal(origin.protocol, 'https:', 'Release check requires an HTTPS origin');
  assert.equal(origin.pathname, '/', 'Release check origin must not include a path');
  assert.equal(origin.search, '', 'Release check origin must not include a query');
  assert.match(expectedSha ?? '', /^[a-f0-9]{40}$/i, 'Expected a 40-character Git SHA');
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0, 'Release timeout must be positive');
  assert.ok(Number.isFinite(intervalMs) && intervalMs > 0, 'Release polling interval must be positive');

  const started = now();
  let lastObserved = 'no response';

  while (true) {
    try {
      const response = await fetchImpl(new URL('/api/release', origin), {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(Math.min(10000, timeoutMs)),
      });
      if (response.ok) {
        const release = await response.json();
        lastObserved = typeof release?.commitSha === 'string' ? release.commitSha : 'unknown';
        if (lastObserved.toLowerCase() === expectedSha.toLowerCase()) {
          return { status: 'READY', commitSha: expectedSha.toLowerCase(), elapsedMs: now() - started };
        }
      } else {
        lastObserved = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastObserved = error instanceof Error ? error.message : String(error);
    }

    const remainingMs = timeoutMs - (now() - started);
    if (remainingMs <= 0) break;
    await sleepImpl(Math.min(intervalMs, remainingMs));
  }

  throw new Error(`Production release ${expectedSha} was not ready after ${timeoutMs}ms (last observed: ${lastObserved})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await waitForRelease({
      base: process.env.SPORTS247_BASE_URL ?? DEFAULT_BASE,
      expectedSha: process.env.SPORTS247_EXPECTED_SHA ?? process.env.GITHUB_SHA,
      timeoutMs: Number(process.env.SPORTS247_RELEASE_WAIT_TIMEOUT_MS ?? 240000),
    });
    console.log(JSON.stringify({ event: 'sports247_release_verified', ...result }));
  } catch (error) {
    console.error('SPORTS247 release verification failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
