import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { monitorProduction, monitorSummaryMarkdown } from '../scripts/monitor-production.mjs';

const date = '2026-10-31';
const feed = { date, matches: [], partial: false, errors: [], failedLeagues: [], pendingLeagues: ['vie.1'] };
const table = { leagueId: 'eng.1', groups: [{ entries: [{ name: 'Team' }] }] };

function fakeFetch({ homepage = 200, homepageBody = '<html lang="vi">SPORTS247</html>', matches = feed, standings = table } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(new URL(url).pathname);
      const path = new URL(url).pathname;
      if (path === '/') return new Response(homepageBody, { status: homepage, headers: { 'content-type': 'text/html' } });
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

test('detects Vercel login pages that happen to mention SPORTS247', async () => {
  const loginPage = '<html lang="en-US"><body>Sign in to view sports247-hnquan.vercel.app</body></html>';
  const result = await monitorProduction({ date, ...fakeFetch({ homepageBody: loginPage }) });
  assert.equal(result.status, 'FAIL');
  assert.match(result.errors.join(' '), /Homepage returned an unexpected document/);
});

test('detects cross-origin redirects even when the response resembles the app', async () => {
  const fake = fakeFetch();
  const result = await monitorProduction({
    date,
    fetchImpl: async (url) => {
      const response = await fake.fetchImpl(url);
      if (new URL(url).pathname === '/') {
        Object.defineProperty(response, 'url', { value: 'https://vercel.com/login?next=private' });
      }
      return response;
    },
  });
  assert.equal(result.status, 'FAIL');
  assert.match(result.errors.join(' '), /unexpectedly redirected to https:\/\/vercel\.com\/login/);
  assert.doesNotMatch(result.errors.join(' '), /next=private/);
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

test('GitHub summary includes probe state and failure details', async () => {
  const partialFeed = { ...feed, partial: true, errors: ['timeout'], failedLeagues: ['eng.1'] };
  const result = await monitorProduction({ date, ...fakeFetch({ matches: partialFeed }), failOnPartial: true });
  const summary = monitorSummaryMarkdown(result);
  assert.match(summary, /production monitor: FAIL/);
  assert.match(summary, /\| matches \| ok \|/);
  assert.match(summary, /matches: upstream degraded/);
  assert.match(summary, /No paid video endpoints are called/);
});

test('CLI writes failure JSON, GitHub summary and error annotation on invalid configuration', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'sports247-monitor-test-'));
  const reportPath = path.join(temp, 'monitor.json');
  const summaryPath = path.join(temp, 'summary.md');
  const scriptPath = fileURLToPath(new URL('../scripts/monitor-production.mjs', import.meta.url));
  try {
    const child = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SPORTS247_BASE_URL: 'http://example.test',
        SPORTS247_MONITOR_REPORT: reportPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_ACTIONS: 'true',
      },
    });
    assert.equal(child.status, 1, child.stderr);
    const result = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(result.status, 'FAIL');
    assert.deepEqual(result.checks, []);
    assert.match(result.errors[0], /Monitoring requires an HTTPS origin/);
    assert.match(await readFile(summaryPath, 'utf8'), /production monitor: FAIL/);
    assert.match(child.stdout, /::error::monitor setup:/);
    assert.match(child.stdout, /"event":"sports247_synthetic_monitor"/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('rejects invalid response-time thresholds before making external requests', async () => {
  await assert.rejects(monitorProduction({ date, ...fakeFetch(), maxDurationMs: NaN }),
    /Monitoring maximum duration must be positive/);
});
