import assert from 'node:assert/strict';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'https://sports247-three.vercel.app';

function vietnamToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Read-only probes: deliberately never call /api/watch or any paid video provider. */
export async function monitorProduction({
  base = DEFAULT_BASE, date = vietnamToday(), fetchImpl = fetch,
  timeoutMs = 15000, maxDurationMs = 15000, failOnPartial = false,
} = {}) {
  const origin = new URL(base);
  assert.equal(origin.protocol, 'https:', 'Monitoring requires an HTTPS origin');
  assert.equal(origin.pathname, '/', 'Monitoring origin must not include a path');
  assert.equal(origin.search, '', 'Monitoring origin must not include query parameters');
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0, 'Monitoring timeout must be positive');
  assert.ok(Number.isFinite(maxDurationMs) && maxDurationMs > 0,
    'Monitoring maximum duration must be positive');
  const checks = [];
  const errors = [];
  const warnings = [];

  async function probe(name, path, validate) {
    const started = performance.now();
    try {
      const response = await fetchImpl(new URL(path, origin), {
        signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
        headers: { Accept: path === '/' ? 'text/html' : 'application/json' },
      });
      if (response.url) {
        const resolvedUrl = new URL(response.url);
        if (resolvedUrl.origin !== origin.origin) {
          throw new Error(`${name} unexpectedly redirected to ${resolvedUrl.origin}${resolvedUrl.pathname}`);
        }
      }
      assert.equal(response.status, 200, `${name} returned HTTP ${response.status}`);
      const type = response.headers.get('content-type') ?? '';
      const body = path === '/' ? (assert.match(type, /text\/html/i), await response.text())
        : (assert.match(type, /application\/json/i), await response.json());
      validate(body);
      const durationMs = Math.round(performance.now() - started);
      checks.push({ name, status: 'ok', durationMs });
      if (durationMs > maxDurationMs) warnings.push(`${name}: slow (${durationMs}ms)`);
    } catch (error) {
      checks.push({ name, status: 'error', durationMs: Math.round(performance.now() - started) });
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await probe('homepage', '/', (html) => {
    assert.match(html, /<html\b[^>]*\blang=["']vi["']/i,
      'Homepage returned an unexpected document');
    assert.match(html, /SPORTS247/i, 'Missing product name');
  });
  await probe('matches', `/api/matches?date=${encodeURIComponent(date)}`, (feed) => {
    assert.equal(feed.date, date);
    assert.ok(Array.isArray(feed.matches), 'matches is not an array');
    assert.equal(typeof feed.partial, 'boolean');
    assert.ok(Array.isArray(feed.errors), 'errors is not an array');
    assert.ok(Array.isArray(feed.failedLeagues), 'failedLeagues is not an array');
    assert.ok(Array.isArray(feed.pendingLeagues), 'pendingLeagues is not an array');
    assert.ok(feed.pendingLeagues.every((id) => ['vie.1', 'vie.2'].includes(id)),
      'Unexpected pending league');
    if (feed.partial || feed.failedLeagues.length || feed.errors.length) {
      warnings.push(`matches: upstream partial=${feed.partial}, errors=${feed.errors.length}, failedLeagues=${feed.failedLeagues.join(',')}`);
      if (failOnPartial) errors.push('matches: upstream degraded');
    }
    if (feed.pendingLeagues.length) {
      checks.push({ name: 'vietnam-feed', status: 'pending', leagues: feed.pendingLeagues });
    }
  });
  await probe('standings', '/api/standings?league=eng.1', (feed) => {
    assert.equal(feed.leagueId, 'eng.1');
    assert.ok(Array.isArray(feed.groups), 'standings groups is not an array');
    assert.ok(feed.groups.some((group) => Array.isArray(group.entries) && group.entries.length > 0),
      'No standings rows');
  });

  return { status: errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS', date, checks, warnings, errors };
}

export function monitorSummaryMarkdown(result) {
  const rows = result.checks.map((check) =>
    `| ${check.name.replaceAll('|', '\\|')} | ${check.status} | ${check.durationMs ?? '—'} |`);
  return [
    `## SPORTS247 production monitor: ${result.status}`,
    '',
    `Date (Vietnam): ${result.date}`,
    '',
    '| Probe | Result | Duration (ms) |',
    '| --- | --- | ---: |',
    ...rows,
    '',
    ...result.errors.map((message) => `- ❌ ${message}`),
    ...result.warnings.map((message) => `- ⚠️ ${message}`),
    '',
    'Only public homepage, matches and standings are checked. No paid video endpoints are called.',
    '',
  ].join('\n');
}

async function publishReport(result) {
  if (process.env.SPORTS247_MONITOR_REPORT) {
    const filename = path.resolve(process.env.SPORTS247_MONITOR_REPORT);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2) + '\n');
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, monitorSummaryMarkdown(result));
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const message of result.errors) {
      // GitHub command data must not contain newlines or command delimiters.
      const safeMessage = message.replace(/[\r\n]/g, ' ').replaceAll('%', '%25');
      console.log(`::error::${safeMessage}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    result = await monitorProduction({
      base: process.env.SPORTS247_BASE_URL ?? DEFAULT_BASE,
      maxDurationMs: Number(process.env.SPORTS247_MONITOR_MAX_MS ?? 15000),
      failOnPartial: process.env.SPORTS247_MONITOR_FAIL_ON_PARTIAL === '1',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('SPORTS247 synthetic monitor failed:', message);
    result = {
      status: 'FAIL', date: vietnamToday(), checks: [], warnings: [],
      errors: [`monitor setup: ${message}`],
    };
  }
  console.log(JSON.stringify({ event: 'sports247_synthetic_monitor', at: new Date().toISOString(), ...result }));
  try {
    await publishReport(result);
  } catch (error) {
    console.error('SPORTS247 monitor report publication failed:',
      error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
  if (result.errors.length) process.exitCode = 1;
}
