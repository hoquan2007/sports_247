/** Browser QA with a locally installed Chrome; no additional package required. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEAGUES } from '../src/lib/football/leagues.ts';
import { VIETNAM_LEAGUES } from '../src/lib/football/vietnam-leagues.ts';

const DISPLAY_LEAGUES = [...LEAGUES, ...VIETNAM_LEAGUES];

const base = process.env.SPORTS247_BASE_URL ?? 'http://127.0.0.1:3199';
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = path.resolve(process.env.SPORTS247_QA_OUTPUT_DIR ?? 'docs/qa');
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
    const vietnam = logos.filter(el => el.dataset.leagueId?.startsWith('vie.'));
    const espn = logos.filter(el => !el.dataset.leagueId?.startsWith('vie.'));
    return {
      viewport: '${viewportName}', title: document.title,
      leagueBadges: logos.length, visibleLogoImages: visible.length,
      loadedLogoImages: visible.filter(el => el.complete && el.naturalWidth > 0).length,
      brokenLogoImages: visible.filter(el => el.complete && el.naturalWidth === 0).length,
      logoFallbacks: logos.filter(el => el.querySelector('.league-badge-fallback')).length,
      vietnamBadges: vietnam.length,
      vietnamFallbacks: vietnam.filter(el => el.querySelector('.league-badge-fallback')).length,
      espnFallbacks: espn.filter(el => el.querySelector('.league-badge-fallback')).length,
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
  const coverageResponse = await fetch(new URL('/api/matches', base), { cache: 'no-store' });
  assert.equal(coverageResponse.status, 200, 'Could not verify pending competition data');
  const coverage = await coverageResponse.json();
  const pendingVietnam = VIETNAM_LEAGUES.filter((league) =>
    (coverage.pendingLeagues ?? []).includes(league.id));
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900, mobile: false },
    { name: 'mobile', width: 390, height: 844, mobile: true },
    { name: 'compact', width: 320, height: 740, mobile: true },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await send('Page.navigate', { url: base });
    await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('.app-shell')`), 30000);
    // Trigger the browser's lazy images in the audit; screenshots still use native lazy loading.
    await evaluate(`document.querySelectorAll('.league-badge img').forEach(img => { img.loading = 'eager'; })`);
    await waitFor(() => evaluate(`(() => {
      const logos = [...document.querySelectorAll('.league-badge')];
      return logos.length >= ${DISPLAY_LEAGUES.length} && logos.every(el => {
        const img = el.querySelector('img');
        return (img && img.complete && img.naturalWidth > 0) || el.querySelector('.league-badge-fallback');
      });
    })()`), 45000);
    const before = await inspect(viewport.name);
    console.log(`${viewport.name} browser diagnostics: ${JSON.stringify(before)}`);
    assert.ok(before.hasSpotlight, `${viewport.name}: no spotlight`);
    assert.ok(before.leagueBadges >= DISPLAY_LEAGUES.length, `${viewport.name}: fewer than ${DISPLAY_LEAGUES.length} competition badges`);
    assert.equal(before.competitionOptions, DISPLAY_LEAGUES.length, `${viewport.name}: missing listed competitions`);
    assert.equal(before.brokenLogoImages, 0, `${viewport.name}: failed logo images`);
    assert.equal(before.espnFallbacks, 0, `${viewport.name}: ESPN competition logo unexpectedly missing`);
    assert.equal(before.vietnamFallbacks, 0, `${viewport.name}: VPF competition logo unexpectedly missing`);
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
    const mascot = await evaluate(`(() => {
      const button = document.querySelector('.mascot-action');
      const dock = document.querySelector('.mascot-dock');
      const rect = button?.getBoundingClientRect();
      return {
        exists: !!button && !!dock && !!button.querySelector('.mascot-face') && !!button.querySelector('.mascot-arm.left'),
        withinViewport: !!rect && rect.width > 40 && rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1,
        fixed: !!dock && getComputedStyle(dock).position === 'fixed',
        reducedMotionStopped: !!dock && getComputedStyle(dock.querySelector('.mascot-figure')).animationName === 'none',
        roamingStopped: !!dock && dock.dataset.walking === 'false',
      };
    })()`);
    assert.equal(mascot.exists, true, `${viewport.name}: football mascot missing body details`);
    assert.equal(mascot.withinViewport, true, `${viewport.name}: mascot button is outside viewport`);
    assert.equal(mascot.fixed, true, `${viewport.name}: mascot must follow viewport when scrolling`);
    assert.equal(mascot.reducedMotionStopped, true, `${viewport.name}: reduced-motion preference ignored`);
    assert.equal(mascot.roamingStopped, true, `${viewport.name}: roaming continues under reduced motion`);
    for (const move of ['wave', 'kick', 'dance']) {
      await evaluate(`document.querySelector('.mascot-action')?.click()`);
      await waitFor(() => evaluate(`document.querySelector('.mascot-dock.is-playing')?.dataset.move === '${move}'`), 8000);
      assert.equal(await evaluate(`!!document.querySelector('.mascot-message[role="status"]')`), true,
        `${viewport.name}: ${move} interaction did not show feedback`);
    }
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const activeMotion = await evaluate(`(async () => {
      const figure = document.querySelector('.mascot-figure');
      const animation = getComputedStyle(figure).animationName;
      const initial = getComputedStyle(figure).transform;
      await new Promise(resolve => setTimeout(resolve, 160));
      return { animation, moves: getComputedStyle(figure).transform !== initial };
    })()`);
    assert.equal(activeMotion.animation, 'mascot-dance', `${viewport.name}: interactive dance animation missing`);
    assert.equal(activeMotion.moves, true, `${viewport.name}: mascot does not move with animation enabled`);
    await waitFor(() => evaluate(`!document.querySelector('.mascot-dock.is-playing')`), 7000);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: viewport.width / 2, y: viewport.height / 2 });
    await waitFor(() => evaluate(`document.querySelector('.mascot-dock')?.dataset.walking === 'true'`), 7000);
    const roaming = await evaluate(`(async () => {
      const button = document.querySelector('.mascot-action');
      const dock = document.querySelector('.mascot-dock');
      const start = button.getBoundingClientRect();
      let withinViewport = true;
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 180));
        const box = button.getBoundingClientRect();
        withinViewport &&= box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
      }
      const end = button.getBoundingClientRect();
      const moved = Math.hypot(start.left - end.left, start.top - end.top) > 8;
      button.focus();
      await new Promise(resolve => setTimeout(resolve, 100));
      const held = button.getBoundingClientRect();
      await new Promise(resolve => setTimeout(resolve, 460));
      const paused = button.getBoundingClientRect();
      const focusPaused = Math.hypot(held.left - paused.left, held.top - paused.top) < 1;
      button.blur();
      const resumeAt = button.getBoundingClientRect();
      let resumed = false;
      for (let i = 0; i < 16 && !resumed; i++) {
        await new Promise(resolve => setTimeout(resolve, 220));
        const now = button.getBoundingClientRect();
        resumed = Math.hypot(resumeAt.left - now.left, resumeAt.top - now.top) > 8;
      }
      return { moved, withinViewport, focusPaused, resumed,
        hovered: dock.matches(':hover'), focused: dock.matches(':focus-within'), visibility: document.visibilityState };
    })()`);
    console.log(`${viewport.name} mascot roaming: ${JSON.stringify(roaming)}`);
    assert.equal(roaming.moved, true, `${viewport.name}: mascot did not travel between screen positions`);
    assert.equal(roaming.withinViewport, true, `${viewport.name}: roaming mascot crossed viewport bounds`);
    assert.equal(roaming.focusPaused, true, `${viewport.name}: mascot did not pause during keyboard focus`);
    assert.equal(roaming.resumed, true, `${viewport.name}: mascot did not resume after focus`);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate(`document.querySelector('.mascot-action')?.click()`);
    await waitFor(() => evaluate(`!!document.querySelector('.mascot-message')`), 3000);
    const mascotCollision = await evaluate(`(() => {
      const button = document.querySelector('.mascot-action');
      const bubble = document.querySelector('.mascot-message');
      const controls = [...document.querySelectorAll('.spotlight-score, .spotlight-open, .spotlight-controls button')];
      const overlaps = (left, right) => left && right && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
      const blocked = [button, bubble].flatMap(element => controls.filter(control =>
        overlaps(element?.getBoundingClientRect(), control.getBoundingClientRect())).map(control => control.className || control.ariaLabel));
      return {
        blocked,
        messageInsideViewport: !!bubble && bubble.getBoundingClientRect().left >= 0 && bubble.getBoundingClientRect().right <= innerWidth + 1,
        dockFixed: getComputedStyle(document.querySelector('.mascot-dock')).position === 'fixed',
      };
    })()`);
    assert.deepEqual(mascotCollision.blocked, [], `${viewport.name}: mascot or message hides a spotlight control`);
    assert.equal(mascotCollision.messageInsideViewport, true, `${viewport.name}: mascot speech bubble leaves viewport`);
    assert.equal(mascotCollision.dockFixed, true, `${viewport.name}: mascot lost fixed position`);
    await capture(`${viewport.name}-mascot.png`);
    screenshots.push(`${viewport.name}-mascot.png`);
    checks.push({ viewport: viewport.name, mascot, activeMotion, roaming, mascotCollision });
    const pendingNotice = await evaluate('(() => { const el = document.querySelector(".results-area .source-notice[role=status]"); return { text: el?.textContent?.trim() ?? "", official: [...(el?.querySelectorAll("a") ?? [])].some(a => a.href.startsWith("https://vpf.vn/")) }; })()');
    assert.equal(Boolean(pendingNotice.text), pendingVietnam.length > 0,
      `${viewport.name}: all-competitions V.League data notice differs from API`);
    if (pendingVietnam.length) {
      assert.equal(pendingNotice.official, true, `${viewport.name}: no official fixture link`);
      for (const division of pendingVietnam) {
        assert.ok(pendingNotice.text.includes(division.name),
          `${viewport.name}: missing data notice for ${division.name}`);
      }
    }
    checks.push({ viewport: viewport.name, pendingVietnam: pendingVietnam.map((item) => item.id), officialLink: pendingNotice.official });
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
    // The expanded standings click proves React hydration is ready. Only now
    // exercise client state changes in the competition filter.
    for (const division of pendingVietnam) {
      await evaluate('([...document.querySelectorAll(".competition-item")].find(el => el.querySelector(".league-badge")?.dataset.leagueId === ' + JSON.stringify(division.id) + '))?.click()');
      try {
        await waitFor(() => evaluate('document.querySelector(".competition-item.active .league-badge")?.dataset.leagueId === ' + JSON.stringify(division.id)), 8000);
      } catch {
        throw new Error(`${viewport.name}: selecting ${division.name} did not update active competition`);
      }
      const individualNotice = await evaluate('([...document.querySelectorAll(".results-area .source-notice")].find(el => [...el.querySelectorAll("a")].some(a => a.href.startsWith("https://vpf.vn/")))?.textContent ?? "")');
      assert.ok(individualNotice.includes(division.name),
        `${viewport.name}: missing selected-competition notice for ${division.name}`);
    }
    if (pendingVietnam.length) {
      await evaluate('document.querySelector(".brand-wordmark")?.click()');
      try {
        await waitFor(() => evaluate('(() => { const active = [...document.querySelectorAll(".competition-item.active")]; return active.length === 1 && active[0].textContent.includes("Toàn bộ giải đấu") && !active[0].querySelector(".league-badge"); })()'), 8000);
      } catch {
        throw new Error(`${viewport.name}: home control did not reset competition filter`);
      }
    }
    await evaluate(`document.querySelector('#competitions .competition-item:last-of-type')?.scrollIntoView({ block: 'center' })`);
    await pause(150);
    await capture(`${viewport.name}-leagues.png`);
    screenshots.push(`${viewport.name}-leagues.png`);
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
    return badges.length >= ${DISPLAY_LEAGUES.length} && badges.every(el => {
      const isVietnam = el.dataset.leagueId?.startsWith('vie.');
      const fallback = el.querySelector('.league-badge-fallback');
      if (isVietnam) {
        const img = el.querySelector('img');
        return !!fallback || (img?.complete && img.naturalWidth > 0);
      }
      return fallback && fallback.textContent.trim().length > 0;
    });
  })()`), 45000);
  const blocked = await inspect('mobile-cdn-blocked');
  assert.equal(blocked.competitionOptions, DISPLAY_LEAGUES.length, 'Blocked CDN: competition options missing');
  assert.equal(blocked.espnFallbacks, blocked.leagueBadges - blocked.vietnamBadges, 'Blocked CDN: ESPN logos not all replaced by readable fallback');
  assert.equal(blocked.vietnamFallbacks, 0, 'Blocked ESPN: VPF competition badges should still load');
  assert.equal(blocked.brokenLogoImages, 0, 'Blocked CDN: broken image remains');
  assert.equal(blocked.loadedLogoImages, blocked.visibleLogoImages, 'Blocked ESPN: independent VPF images not all loaded');
  await capture('mobile-cdn-blocked.png');
  screenshots.push('mobile-cdn-blocked.png');
  checks.push(blocked);
  // The Vietnamese badges have an independent image host. Verify their fallback
  // with ESPN CDN available so a VPF outage cannot hide the competition names.
  await send('Network.setBlockedURLs', { urls: ['*vpf.vn*'] });
  await send('Page.navigate', { url: base });
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('.app-shell')`), 30000);
  await evaluate(`document.querySelectorAll('.league-badge img').forEach(img => { img.loading = 'eager'; })`);
  await waitFor(() => evaluate(`(() => {
    const badges = [...document.querySelectorAll('.league-badge')];
    const vietnam = badges.filter(el => el.dataset.leagueId?.startsWith('vie.'));
    return vietnam.length === ${VIETNAM_LEAGUES.length} && badges.every(el => {
      if (el.dataset.leagueId?.startsWith('vie.')) {
        return !!el.querySelector('.league-badge-fallback')?.textContent.trim();
      }
      const img = el.querySelector('img');
      return img?.complete && img.naturalWidth > 0;
    });
  })()`), 45000);
  const vpfBlocked = await inspect('mobile-vpf-blocked');
  assert.equal(vpfBlocked.competitionOptions, DISPLAY_LEAGUES.length, 'Blocked VPF: competition options missing');
  assert.equal(vpfBlocked.vietnamFallbacks, vpfBlocked.vietnamBadges, 'Blocked VPF: Vietnamese badges need readable text');
  assert.equal(vpfBlocked.espnFallbacks, 0, 'Blocked VPF: unrelated ESPN badges should still load');
  assert.equal(vpfBlocked.brokenLogoImages, 0, 'Blocked VPF: broken image remains');
  assert.equal(vpfBlocked.loadedLogoImages, vpfBlocked.visibleLogoImages, 'Blocked VPF: independent ESPN images not all loaded');
  await capture('mobile-vpf-blocked.png');
  screenshots.push('mobile-vpf-blocked.png');
  checks.push(vpfBlocked);
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
