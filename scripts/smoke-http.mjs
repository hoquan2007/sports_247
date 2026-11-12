import assert from 'node:assert/strict';

// Run against a local or deployed server. Live-video calls are opt-in because they consume credits.
const base = process.env.SPORTS247_BASE_URL ?? 'http://127.0.0.1:3199';
const expectedOrigin = new URL(base).origin;
const checkVideo = process.argv.includes('--watch');
const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function get(path) {
  let response;
  try {
    response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(30000), cache: 'no-store',
    });
  } catch (error) {
    const reason = error?.cause?.code ?? error?.code ?? error?.message ?? 'unknown';
    throw new Error(`${path}: không thể kết nối tới ${new URL(base).origin} (${reason})`);
  }
  const resolvedUrl = new URL(response.url);
  if (resolvedUrl.origin !== expectedOrigin) {
    throw new Error(`${path}: unexpected cross-origin redirect to ${resolvedUrl.origin}${resolvedUrl.pathname}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

async function check(label, path, expected, validate = () => {}) {
  const { response, body } = await get(path);
  assert.equal(response.status, expected, `${label}: HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  validate(body);
  console.log(`PASS ${label} (HTTP ${response.status})`);
}

try {
  await check('Homepage', '/', 200, (body) => {
    assert.match(body, /<html\b[^>]*\blang=["']vi["']/i, 'Homepage did not return the SPORTS247 Vietnamese document');
    assert.match(body, /SPORTS247/i);
  });
  await check('Reject bad date', '/api/matches?date=2026-02-31', 400);
  await check('Reject date before supported range', '/api/matches?date=1899-12-31', 400);
  await check('Reject date after supported range', '/api/matches?date=2101-01-01', 400);
  await check('Reject bad league for video', '/api/watch?league=invalid&event=401879248', 400);
  await check('Reject bad V.League event', '/api/watch?league=vie.1&event=not-an-id', 400);
  await check('V.League licensed-video adapter', '/api/watch?league=vie.1&event=1234567', 200, (body) => {
    assert.ok(['unavailable', 'ready'].includes(body.status));
    if (body.status === 'ready') {
      assert.equal(body.provider, 'YouTube');
      assert.match(body.embedUrl, /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/);
    }
  });
  await check('Reject bad league for standings', '/api/standings?league=invalid', 400);
  await check('Reject invalid match detail league', '/api/match-details?league=invalid&event=401879248', 400);
  await check('Reject invalid match detail event', '/api/match-details?league=eng.1&event=not-an-event', 400);
  await check('Reject invalid match permalink', '/match/invalid/not-an-event', 404);
  await check('Match feed', `/api/matches?date=${date}`, 200, (body) => {
    assert.equal(body.date, date);
    assert.ok(Array.isArray(body.matches));
    assert.equal(typeof body.partial, 'boolean');
    assert.ok(Array.isArray(body.errors));
    assert.ok(Array.isArray(body.failedLeagues), 'Missing per-league upstream failure status');
    assert.ok(Array.isArray(body.pendingLeagues), 'Missing Vietnam configuration status');
    assert.ok(body.pendingLeagues.every((id) => ['vie.1', 'vie.2'].includes(id)),
      'Only the Vietnam divisions may be pending API configuration');
    assert.ok(body.failedLeagues.every((id) => typeof id === 'string' && id.length > 0));
  });
  await check('Standings', '/api/standings?league=eng.1', 200, (body) => {
    assert.equal(body.leagueId, 'eng.1');
    assert.ok(Array.isArray(body.groups));
    assert.ok(body.groups.some((group) => Array.isArray(group.entries) && group.entries.length));
  });
  if (checkVideo) await check('Video adapter', '/api/watch?league=eng.1&event=401879248', 200, (body) => {
    assert.ok(['unconfigured', 'restricted', 'unavailable', 'ready'].includes(body.status));
  });
  console.log('SPORTS247 HTTP smoke: passed. Video source not verified unless --watch used.');
} catch (error) {
  console.error('SPORTS247 HTTP smoke FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
