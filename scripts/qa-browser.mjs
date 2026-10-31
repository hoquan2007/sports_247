/** Browser QA with a locally installed Chrome; no additional package required. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = process.env.SPORTS247_BASE_URL ?? 'http://127.0.0.1:3199';
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = path.resolve('docs/qa');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'sports247-chrome-'));
let browser;
let socket;
let nextId = 0;
const pending = new Map();

async function waitFor(condition, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = await condition().catch(() => null);
    if (found) return found;
    await pause(200);
  }
  throw new Error(`Browser QA timed out after ${timeoutMs} ms`);
}

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'JS evaluation failed');
  return response.result?.value;
}

async function capture(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  assert.ok(data, `Missing screenshot: ${name}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, name), Buffer.from(data, 'base64'));
}

async function inspect(viewportName) {
  return evaluate(`(() => {
    const logos = [...document.querySelectorAll('.league-badge')];
    const images = logos.map(el => el.querySelector('img')).filter(Boolean);
    const visible = images.filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    return {
      viewport: '${viewportName}', title: document.title,
      leagueBadges: logos.length, visibleLogoImages: visible.length,
      loadedLogoImages: visible.filter(el => el.complete && el.naturalWidth > 0).length,
      brokenLogoImages: visible.filter(el => el.complete && el.naturalWidth === 0).length,
      logoFallbacks: logos.filter(el => el.querySelector('.league-badge-fallback')).length,
      competitionOptions: document.querySelectorAll('.competition-item .league-badge').length,
      introVisible: !!document.querySelector('.matchday-intro') && getComputedStyle(document.querySelector('.matchday-intro')).display !== 'none',
      viewportWidth: window.innerWidth, pageWidth: document.documentElement.scrollWidth,
      matchRows: document.querySelectorAll('.match-row').length,
      hasSpotlight: !!document.querySelector('.spotlight'),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      introDisplay: document.querySelector('.matchday-intro') ? getComputedStyle(document.querySelector('.matchday-intro')).display : 'not-mounted',
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      sheets: [...document.styleSheets].map(s => s.href).filter(Boolean).length,
    };
  })()`);
}

try {
  assert.ok(existsSync(chrome), `Chrome executable not found: ${chrome}`);
  browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--force-prefers-reduced-motion', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  const port = await waitFor(async () => {
    const data = await readFile(portFile, 'utf8');
    return Number(data.split(/\r?\n/)[0]);
  }, 25000);
  const tabResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' });
  assert.equal(tabResponse.status, 200, 'Chrome did not create a page');
  const tab = await tabResponse.json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message.result ?? {});
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const screenshots = [];
  const checks = [];
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900, mobile: false },
    { name: 'mobile', width: 390, height: 844, mobile: true },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await send('Page.navigate', { url: base });
    await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('.app-shell')`), 30000);
    // Trigger the browser's lazy images in the audit; screenshots still use native lazy loading.
    await evaluate(`document.querySelectorAll('.league-badge img').forEach(img => { img.loading = 'eager'; })`);
    await waitFor(() => evaluate(`(() => {
      const logos = [...document.querySelectorAll('.league-badge')];
      return logos.length >= 17 && logos.every(el => {
        const img = el.querySelector('img');
        return (img && img.complete && img.naturalWidth > 0) || el.querySelector('.league-badge-fallback');
      });
    })()`), 45000);
    const before = await inspect(viewport.name);
    console.log(`${viewport.name} browser diagnostics: ${JSON.stringify(before)}`);
    assert.ok(before.hasSpotlight, `${viewport.name}: no spotlight`);
    assert.ok(before.leagueBadges >= 17, `${viewport.name}: fewer than 17 competition badges`);
    assert.equal(before.competitionOptions, 17, `${viewport.name}: missing supported competitions`);
    assert.equal(before.brokenLogoImages, 0, `${viewport.name}: failed logo images`);
    assert.equal(before.logoFallbacks, 0, `${viewport.name}: logo unexpectedly missing`);
    assert.equal(before.loadedLogoImages, before.visibleLogoImages, `${viewport.name}: not all logos loaded`);
    if (before.matchRows > 0) {
      const placements = await evaluate(`(() => ({
        ticker: document.querySelectorAll('.ticker-competition .league-badge').length,
        spotlight: document.querySelectorAll('.spotlight-competition .league-badge').length,
        schedule: document.querySelectorAll('.league-row-head .league-badge').length,
      }))()`);
      assert.ok(placements.ticker > 0, `${viewport.name}: ticker has no competition logos`);
      assert.ok(placements.spotlight > 0, `${viewport.name}: featured match has no competition logo`);
      assert.ok(placements.schedule > 0, `${viewport.name}: fixture groups have no competition logos`);
      checks.push({ viewport: viewport.name, logoPlacements: placements });
    }
    assert.ok(before.pageWidth <= before.viewportWidth + 2, `${viewport.name}: horizontal overflow ${before.pageWidth}px`);
    assert.equal(before.introVisible, false, `${viewport.name}: intro overlay did not disappear`);
    await capture(`${viewport.name}.png`);
    screenshots.push(`${viewport.name}.png`);
    checks.push(before);
    // Confirm ESPN standings and the accessible full-screen table on desktop and mobile.
    await waitFor(() => evaluate(`document.querySelectorAll('.standings-card .standings-table tbody tr').length >= 6`), 20000);
    const standings = await evaluate(`(() => {
      const button = document.querySelector('.standings-expand');
      return { rows: document.querySelectorAll('.standings-card > .standings-table-wrap tbody tr').length, canExpand: !!button };
    })()`);
    assert.ok(standings.canExpand, `${viewport.name}: standings expand button missing`);
    assert.equal(standings.rows, 6, `${viewport.name}: summary must show exactly six teams`);
    await evaluate(`(() => { const button = document.querySelector('.standings-expand'); button.focus(); button.click(); })()`);
    await waitFor(() => evaluate(`document.querySelector('.standings-dialog')?.open === true`), 10000);
    const fullStandings = await evaluate(`(() => {
      const dialog = document.querySelector('.standings-dialog');
      const table = dialog?.querySelector('.standings-table-full');
      const rect = dialog?.getBoundingClientRect();
      const name = table?.querySelector('.standings-team > span:last-child');
      return {
        rows: table?.querySelectorAll('tbody tr').length ?? 0,
        columns: table?.querySelectorAll('thead th').length ?? 0,
        insideViewport: !!rect && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
        teamNamesWrap: !!name && getComputedStyle(name).whiteSpace === 'normal',
        expanded: document.querySelector('.standings-expand')?.getAttribute('aria-expanded'),
      };
    })()`);
    assert.equal(fullStandings.rows, 20, `${viewport.name}: Premier League full standings should contain 20 teams`);
    assert.equal(fullStandings.columns, 8, `${viewport.name}: full standings missing wins/draws/losses`);
    assert.equal(fullStandings.insideViewport, true, `${viewport.name}: standings dialog overflows viewport`);
    assert.equal(fullStandings.teamNamesWrap, true, `${viewport.name}: team names are still truncated`);
    assert.equal(fullStandings.expanded, 'true', `${viewport.name}: expanded state not exposed`);
    await pause(250);
    await capture(`${viewport.name}-standings.png`);
    screenshots.push(`${viewport.name}-standings.png`);
    checks.push({ viewport: viewport.name, standingsRows: standings.rows, fullStandings });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(() => evaluate(`document.querySelector('.standings-dialog')?.open === false`), 10000);
    await waitFor(() => evaluate(`document.querySelector('.standings-expand')?.getAttribute('aria-expanded') === 'false'`), 10000);
    const focusRestored = await evaluate(`document.activeElement === document.querySelector('.standings-expand')`);
    assert.equal(focusRestored, true, `${viewport.name}: closing standings did not restore keyboard focus`);
  }

  await evaluate(`document.querySelector('.spotlight-open, .match-open')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('[role="dialog"]')`), 10000);
  assert.equal(await evaluate(`!!document.querySelector('.dialog-league-label .league-badge')`), true,
    'Match detail dialog has no competition logo');
  await evaluate(`document.querySelector('[role="tab"]#detail-tab-watch')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('#detail-tab-watch')?.getAttribute('aria-selected') === 'true'`), 10000);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 10000);
  // Simulate an unavailable CDN on a clean page load. Every badge must become readable text.
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.setBlockedURLs', { urls: ['*a.espncdn.com*'] });
  await send('Page.navigate', { url: base });
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('.app-shell')`), 30000);
  await evaluate(`document.querySelectorAll('.league-badge img').forEach(img => { img.loading = 'eager'; })`);
  await waitFor(() => evaluate(`(() => {
    const badges = [...document.querySelectorAll('.league-badge')];
    return badges.length >= 17 && badges.every(el => {
      const fallback = el.querySelector('.league-badge-fallback');
      return fallback && fallback.textContent.trim().length > 0;
    });
  })()`), 45000);
  const blocked = await inspect('mobile-cdn-blocked');
  assert.equal(blocked.competitionOptions, 17, 'Blocked CDN: competition options missing');
  assert.equal(blocked.logoFallbacks, blocked.leagueBadges, 'Blocked CDN: not every logo fell back');
  assert.equal(blocked.brokenLogoImages, 0, 'Blocked CDN: broken image remains');
  await capture('mobile-cdn-blocked.png');
  screenshots.push('mobile-cdn-blocked.png');
  checks.push(blocked);
  console.log(JSON.stringify({ status: 'PASS', checks, interactive: 'modal/watch tab/Escape', screenshots }, null, 2));
} catch (error) {
  console.error('Browser QA FAILED:', error.message);
  process.exitCode = 1;
} finally {
  for (const task of pending.values()) { clearTimeout(task.timeout); task.reject(new Error('Browser closing')); }
  pending.clear();
  socket?.close();
  browser?.kill();
  // Give Chrome time to exit before removing its temporary profile.
  await pause(400);
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }).catch(() => {});
}
