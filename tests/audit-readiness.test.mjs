import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { auditReadiness } from '../scripts/audit-readiness.mjs';

test('preflight starts disabled and never infers rights from missing configuration', () => {
  const result = auditReadiness({});
  assert.deepEqual(Object.fromEntries(Object.entries(result).map(([k, value]) => [k, value.state])), {
    vietnam: 'disabled', scorebat: 'disabled', budget: 'disabled', youtube: 'disabled',
  });
});

test('preflight accepts shape only and never prints API keys, IDs or rights-reference values', () => {
  const result = auditReadiness({
    API_FOOTBALL_KEY: 'private-vietnam-key', SPORTS247_VLEAGUE1_ID: '1001',
    SPORTS247_VLEAGUE2_ID: '1002', SPORTS247_VIETNAM_CACHE_SECONDS: '300',
    SCOREBAT_API_TOKEN: 'private-scorebat-token', SCOREBAT_LICENSED_MARKETS: 'eng.1:VN',
    SCOREBAT_MONTHLY_CREDIT_LIMIT: '4000', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'private-redis-token',
    OFFICIAL_YOUTUBE_STREAMS: JSON.stringify([{
      league: 'vie.1', event: '123456', videoId: 'AbCdEFg1234', countries: ['VN'],
      validFrom: '2026-10-31T12:00:00Z', validUntil: '2026-10-31T14:00:00Z',
      rightsReference: 'private-legal-reference',
    }]),
  });
  for (const value of Object.values(result)) assert.equal(value.state, 'configured_unverified');
  const output = JSON.stringify(result);
  for (const secret of ['private-vietnam-key', 'private-scorebat-token',
    'private-redis-token', 'private-legal-reference', 'AbCdEFg1234']) {
    assert.equal(output.includes(secret), false);
  }
});

test('preflight rejects incomplete providers, invalid markets/Redis URLs and invalid YouTube', () => {
  const result = auditReadiness({
    API_FOOTBALL_KEY: 'private', SPORTS247_VLEAGUE1_ID: '101',
    SCOREBAT_API_TOKEN: 'private', SCOREBAT_LICENSED_MARKETS: 'eng.1:VN:',
    SCOREBAT_MONTHLY_CREDIT_LIMIT: '4000', UPSTASH_REDIS_REST_URL: 'https://localhost',
    UPSTASH_REDIS_REST_TOKEN: 'private', OFFICIAL_YOUTUBE_STREAMS: '[{"league":"eng.1"}]',
  });
  for (const value of Object.values(result)) assert.equal(value.state, 'invalid');
  assert.equal(auditReadiness({ SCOREBAT_API_TOKEN: 'private', SCOREBAT_LICENSED_MARKETS: 'eng.1:VN' }).scorebat.state, 'unmetered');
  assert.equal(auditReadiness({ OFFICIAL_YOUTUBE_STREAMS: '{broken' }).youtube.state, 'invalid');
});

test('preflight CLI returns 2 when required integrations are absent without contacting a provider', () => {
  const child = spawnSync(process.execPath, ['scripts/audit-readiness.mjs', '--json', '--require-video', '--require-vietnam'], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: 'utf8',
  });
  assert.equal(child.status, 2, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.scorebat.state, 'disabled');
  assert.equal(result.vietnam.state, 'disabled');
});
