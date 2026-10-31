import test from 'node:test';
import assert from 'node:assert/strict';
import { findAuthorizedYouTubeStream, parseLicensedYouTubeStreams } from '../src/lib/football/official-youtube.ts';
import { getMatchWatch } from '../src/lib/football/watch.ts';

const entry = {
  league: 'eng.1', event: '401879248', videoId: 'AbCdEFg1234',
  countries: ['VN'], validFrom: '2026-10-31T12:00:00Z',
  validUntil: '2026-10-31T15:00:00Z', title: 'Luồng chính thức',
  rightsReference: 'agreement-2026-123',
};
const config = JSON.stringify([entry]);
const during = Date.parse('2026-10-31T13:00:00Z');

test('licensed YouTube video can only be embedded for exact match, market and validity window', () => {
  assert.deepEqual(findAuthorizedYouTubeStream(config, 'eng.1', '401879248', 'VN', during), {
    provider: 'YouTube', embedUrl: 'https://www.youtube-nocookie.com/embed/AbCdEFg1234',
    title: 'Luồng chính thức', broadcastType: 'live',
  });
  for (const [league, event, country, at] of [
    ['eng.1', '401879249', 'VN', during],
    ['eng.2', '401879248', 'VN', during],
    ['eng.1', '401879248', 'TH', during],
    ['eng.1', '401879248', null, during],
    ['eng.1', '401879248', 'VN', Date.parse('2026-10-31T11:59:59Z')],
    ['eng.1', '401879248', 'VN', Date.parse('2026-10-31T15:00:01Z')],
  ]) {
    assert.equal(findAuthorizedYouTubeStream(config, league, event, country, at), null);
  }
});

test('invalid, long-lived or unaudited configuration cannot grant playback', () => {
  const invalid = [
    '{oops', JSON.stringify([{}]), JSON.stringify([{ ...entry, videoId: 'https://evil.test/a' }]),
    JSON.stringify([{ ...entry, countries: ['VNX'] }]),
    JSON.stringify([{ ...entry, rightsReference: '' }]),
    JSON.stringify([{ ...entry, validUntil: '2026-11-02T15:00:00Z' }]),
    JSON.stringify([{ ...entry, league: 'eng.1;alert(1)' }]),
    JSON.stringify([{ ...entry, validFrom: 'invalid' }]),
    JSON.stringify([{ ...entry, validFrom: '2026-10-31T12:00:00+00:00' }]),
    JSON.stringify([{ ...entry, validFrom: '2026-02-30T12:00:00Z' }]),
    JSON.stringify([{ ...entry, validUntil: '2026-10-31T15:00:00' }]),
    JSON.stringify([{ ...entry, videoId: 'ABC1234567/' }]),
  ];
  for (const input of invalid) {
    assert.deepEqual(parseLicensedYouTubeStreams(input), []);
    assert.equal(findAuthorizedYouTubeStream(input, 'eng.1', '401879248', 'VN', during), null);
  }
  assert.deepEqual(parseLicensedYouTubeStreams('x'.repeat(64001)), []);
});

test('authorized curated YouTube stream is served without any upstream API call', async () => {
  const before = process.env.OFFICIAL_YOUTUBE_STREAMS;
  const originalFetch = globalThis.fetch;
  process.env.OFFICIAL_YOUTUBE_STREAMS = config;
  globalThis.fetch = () => { throw new Error('curated source should not trigger paid API calls'); };
  try {
    const ready = await getMatchWatch('eng.1', '401879248', 'VN', during);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.provider, 'YouTube');
    assert.ok(!JSON.stringify(ready).includes(entry.rightsReference));
  } finally {
    globalThis.fetch = originalFetch;
    if (before === undefined) delete process.env.OFFICIAL_YOUTUBE_STREAMS;
    else process.env.OFFICIAL_YOUTUBE_STREAMS = before;
  }
});
