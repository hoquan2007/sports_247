/** Browser QA with a locally installed Chrome; no additional package required. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEAGUES, shiftDate, vietnamDate } from '../src/lib/football/leagues.ts';
import { VIETNAM_LEAGUES } from '../src/lib/football/vietnam-leagues.ts';

const DISPLAY_LEAGUES = [...LEAGUES, ...VIETNAM_LEAGUES];

const base = process.env.SPORTS247_BASE_URL ?? 'http://127.0.0.1:3199';
const chrome = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/google-chrome');
// Preserve any screenshots curated in docs/qa unless an output directory is explicitly requested.
const outputDir = path.resolve(process.env.SPORTS247_QA_OUTPUT_DIR ?? 'temp/qa-browser');
const loadableManifestPath = path.resolve('.next/react-loadable-manifest.json');
const loadableManifest = existsSync(loadableManifestPath)
  ? JSON.parse(await readFile(loadableManifestPath, 'utf8'))
  : null;
const dialogManifestEntry = loadableManifest && Object.entries(loadableManifest)
  .find(([key]) => key.endsWith(' -> @/components/match-dialog'))?.[1];
if (loadableManifest) {
  assert.ok(dialogManifestEntry?.files?.length, 'Match detail modal must have a separate lazy-loaded chunk');
}
const dialogChunk = dialogManifestEntry?.files.find((file) => file.endsWith('.js'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'sports247-chrome-'));
let browser;
let socket;
let nextId = 0;
const pending = new Map();

async function waitFor(condition, timeoutMs = 20000) {
  const caller = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown call site';
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = await condition().catch(() => null);
    if (found) return found;
    await pause(200);
  }
  throw new Error(`Browser QA timed out after ${timeoutMs} ms (${caller})`);
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
    'about:blank',
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
  // Chrome starts with another about:blank tab. Activate our CDP target so the
  // page is visible and CSS animations are not paused in headless CI.
  await send('Page.bringToFront');
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
    console.log(`Checking ${viewport.name} (${viewport.width}px)`);
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await send('Page.navigate', { url: base });
    await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('.app-shell')`), 30000);
    await waitFor(() => evaluate(`document.visibilityState === 'visible'`), 8000);
    // Trigger the browser's lazy images in the audit; screenshots still use native lazy loading.
    await evaluate(`document.querySelectorAll('.league-badge img').forEach(img => { img.loading = 'eager'; })`);
    await waitFor(() => evaluate(`(() => {
      const logos = [...document.querySelectorAll('.league-badge')];
      return logos.length >= ${DISPLAY_LEAGUES.length} && logos.every(el => {
        const img = el.querySelector('img');
        return (img && img.complete && img.naturalWidth > 0) || el.querySelector('.league-badge-fallback');
      });
    })()`), 45000);
    // Local production builds can hydrate after static logos finish loading.
    try {
      await waitFor(() => evaluate(`!document.querySelector('.matchday-intro')`), 20000);
    } catch (error) {
      const state = await evaluate(`(() => ({
        readyState: document.readyState,
        intro: !!document.querySelector('.matchday-intro'),
        introDisplay: document.querySelector('.matchday-intro') && getComputedStyle(document.querySelector('.matchday-intro')).display,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scripts: [...document.scripts].filter(script => script.src).length,
        title: document.title,
      }))()`);
      throw new Error(`${viewport.name}: intro did not unmount (${JSON.stringify(state)}): ${error.message}`);
    }
    let speedInsights;
    try {
      speedInsights = await waitFor(() => evaluate(`(() => {
        const script = document.querySelector('script[data-sdkn^="@vercel/speed-insights"]');
        return script ? { src: script.getAttribute('src'), sampleRate: script.dataset.sampleRate } : null;
      })()`));
    } catch (error) {
      const diagnostic = await evaluate(`(() => ({
        scripts: [...document.scripts].map(script => ({ src: script.getAttribute('src'), sampleRate: script.dataset.sampleRate })).filter(script => script.src),
        queueInitialized: typeof window.si === 'function',
        hydrationComplete: !document.querySelector('.matchday-intro'),
        url: location.href,
      }))()`);
      throw new Error(`${viewport.name}: Speed Insights script missing after hydration (${JSON.stringify(diagnostic)}): ${error.message}`);
    }
    assert.equal(speedInsights.sampleRate, '0.25', `${viewport.name}: incorrect Speed Insights sample rate`);
    checks.push({ viewport: viewport.name, speedInsights });
    const before = await inspect(viewport.name);
    console.log(`${viewport.name} browser diagnostics: ${JSON.stringify(before)}`);
    const standingsBeforeScroll = await evaluate(`(() => {
      const card = document.querySelector('.standings-card');
      const top = card?.getBoundingClientRect().top ?? 0;
      return {
        distanceBeyondViewport: Math.round(top - innerHeight),
        tableRows: card?.querySelectorAll('.standings-table tbody tr').length ?? 0,
        requests: performance.getEntriesByType('resource').filter(entry =>
          new URL(entry.name).pathname === '/api/standings').length,
      };
    })()`);
    // When the card is outside the observer's 400px prefetch margin, its API
    // request and table must remain deferred until the user approaches it.
    if (standingsBeforeScroll.distanceBeyondViewport > 410) {
      assert.equal(standingsBeforeScroll.tableRows, 0,
        `${viewport.name}: offscreen standings rendered before entering the prefetch margin`);
      assert.equal(standingsBeforeScroll.requests, 0,
        `${viewport.name}: offscreen standings requested data before entering the prefetch margin`);
    }
    checks.push({ viewport: viewport.name, standingsBeforeScroll });
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
    const dateLayout = await evaluate(`(() => {
      const tabs = [...document.querySelectorAll('.date-tab')].filter(tab => getComputedStyle(tab).display !== 'none');
      const selected = tabs.filter(tab => tab.classList.contains('selected'));
      const widths = tabs.map(tab => Math.round(tab.getBoundingClientRect().width));
      return { visible: tabs.length, selectedVisible: selected.length === 1,
        selectedCentered: tabs[Math.floor(tabs.length / 2)] === selected[0],
        minimumWidth: Math.min(...widths), widths };
    })()`);
    assert.equal(dateLayout.visible, viewport.width <= 360 ? 3 : viewport.width <= 480 ? 5 : 7,
      `${viewport.name}: date picker has cramped or missing days`);
    assert.equal(dateLayout.selectedVisible && dateLayout.selectedCentered, true,
      `${viewport.name}: selected day is not centered in the date picker`);
    if (viewport.width <= 480) assert.ok(dateLayout.minimumWidth >= 44,
      `${viewport.name}: date buttons are too narrow to tap (${dateLayout.minimumWidth}px)`);
    checks.push({ viewport: viewport.name, dateLayout });
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
    const compactMascot = await evaluate(`(() => {
      const dock = document.querySelector('.mascot-dock');
      const rect = dock.getBoundingClientRect();
      const selectors = '.date-panel, .stats-strip, .results-heading, .results-toolbar, .spotlight-score, .spotlight-open, .spotlight-controls';
      const nearContent = [...document.querySelectorAll(selectors)].some(element => {
        const area = element.getBoundingClientRect();
        return rect.left < area.right + 6 && rect.right > area.left - 6 &&
          rect.top < area.bottom + 6 && rect.bottom > area.top - 6;
      });
      return { nearContent, compact: dock.dataset.compact === 'true' };
    })()`);
    if (viewport.width <= 690) assert.equal(compactMascot.compact, compactMascot.nearContent,
      `${viewport.name}: mascot does not reduce its footprint over important content`);
    checks.push({ viewport: viewport.name, compactMascot });
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
      const playState = getComputedStyle(figure).animationPlayState;
      const visibility = document.visibilityState;
      const paused = document.querySelector('.mascot-dock').dataset.paused;
      const initial = getComputedStyle(figure).transform;
      let moves = false;
      for (let i = 0; i < 8 && !moves; i++) {
        await new Promise(resolve => setTimeout(resolve, 120));
        moves = getComputedStyle(figure).transform !== initial;
      }
      return { animation, playState, visibility, paused, moves };
    })()`);
    assert.equal(activeMotion.animation, 'mascot-dance', `${viewport.name}: interactive dance animation missing`);
    assert.equal(activeMotion.moves, true, `${viewport.name}: mascot does not move with animation enabled (${JSON.stringify(activeMotion)})`);
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
    const notices = await evaluate('(() => ({ banners: document.querySelectorAll(".results-area .source-notice, .results-area .error-notice").length, official: [...document.querySelectorAll("#competitions .watch-guide")].some(a => a.href.startsWith("https://vpf.vn/")) }))()');
    assert.equal(notices.banners, 0, `${viewport.name}: data diagnostics must not appear as frontend banners`);
    assert.equal(notices.official, true, `${viewport.name}: VPF reference link is unavailable`);
    checks.push({ viewport: viewport.name, pendingVietnam: pendingVietnam.map((item) => item.id), officialLink: notices.official, diagnosticBanners: notices.banners });
    await capture(`${viewport.name}.png`);
    screenshots.push(`${viewport.name}.png`);
    checks.push(before);
    // Deferred standings load when their sidebar card approaches the viewport.
    await evaluate(`document.querySelector('.standings-card')?.scrollIntoView({ block: 'center', behavior: 'instant' })`);
    // Confirm ESPN standings and the accessible full-screen table on desktop and mobile.
    await waitFor(() => evaluate(`document.querySelectorAll('.standings-card .standings-table tbody tr').length >= 6`), 20000);
    const standingsRequests = await evaluate(`performance.getEntriesByType('resource').filter(entry =>
      new URL(entry.name).pathname === '/api/standings').length`);
    assert.ok(standingsRequests >= 1, `${viewport.name}: standings data was not fetched after scrolling into view`);
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
      const individualBanners = await evaluate('document.querySelectorAll(".results-area .source-notice, .results-area .error-notice").length');
      assert.equal(individualBanners, 0,
        `${viewport.name}: selecting ${division.name} must not show data diagnostics`);
      const selectedCoverage = await evaluate(`(() => {
        const empty = document.querySelector('.results-area .empty-results');
        const official = empty?.querySelector('.empty-source-link');
        return {
          rows: document.querySelectorAll('.results-area .match-row').length,
          title: empty?.querySelector('strong')?.textContent ?? '',
          description: empty?.querySelector('p')?.textContent ?? '',
          officialUrl: official?.href ?? '',
          officialOpensSafely: official?.target === '_blank' && official?.relList.contains('noopener') && official?.relList.contains('noreferrer'),
        };
      })()`);
      if (selectedCoverage.rows === 0) {
        assert.equal(selectedCoverage.title, 'Lịch giải này chưa có dữ liệu xác nhận',
          `${viewport.name}: ${division.name} must explain pending data when empty`);
        assert.match(selectedCoverage.description, /chưa nhận được lịch đáng tin cậy/i,
          `${viewport.name}: ${division.name} missing pending data explanation`);
        assert.ok(selectedCoverage.officialUrl.startsWith('https://vpf.vn/'),
          `${viewport.name}: ${division.name} has no official VPF calendar link`);
        assert.equal(selectedCoverage.officialOpensSafely, true,
          `${viewport.name}: ${division.name} official link missing safe external navigation`);
      }
      checks.push({ viewport: viewport.name, division: division.id, selectedCoverage });
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

  // Shared URLs must hydrate with the same filters, remain usable on narrow screens,
  // and restore filters when the user moves through browser history.
  const deepParams = new URLSearchParams({ date: '2026-11-15', league: 'vie.1', status: 'postponed', q: 'Hà Nội FC' });
  const deepUrl = new URL(`/?${deepParams}`, base).toString();
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900, mobile: false },
    { name: 'compact', width: 320, height: 740, mobile: true },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await send('Page.navigate', { url: deepUrl });
    await waitFor(() => evaluate(`(() => {
      const input = document.querySelector('.search-control input');
      return document.readyState === 'complete' && input?.value === 'Hà Nội FC' &&
        !document.querySelector('.clock-label')?.textContent.includes('--:--');
    })()`), 30000);
    const restored = await evaluate(`(() => ({
      date: document.querySelector('.date-tab.selected strong')?.textContent,
      league: document.querySelector('.competition-item.active .league-badge')?.dataset.leagueId,
      status: document.querySelector('.status-tab.chosen')?.textContent.trim(),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    }))()`);
    assert.equal(restored.date, '15/11', `${viewport.name}: shared date was not restored`);
    assert.equal(restored.league, 'vie.1', `${viewport.name}: shared league was not restored`);
    assert.match(restored.status ?? '', /Tạm hoãn/, `${viewport.name}: shared exceptional status lacks an active control`);
    assert.ok(restored.pageWidth <= restored.viewportWidth + 2, `${viewport.name}: shared filters overflow the page`);

    await evaluate(`(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (value) => { window.__sports247CopiedLink = value; },
      } });
      document.querySelector('.share-filters')?.click();
    })()`);
    await waitFor(() => evaluate('!!window.__sports247CopiedLink'), 5000);
    const copied = await evaluate('window.__sports247CopiedLink');
    assert.equal(new URL(copied).search, `?${deepParams}`, `${viewport.name}: copied link lost shared filters`);
    assert.equal(await evaluate('document.querySelector(".share-feedback")?.textContent.includes("Đã sao chép")'), true,
      `${viewport.name}: clipboard success was not announced`);

    await evaluate(`(() => {
      const input = document.querySelector('.search-control input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Bình Dương');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelectorAll('.status-tab').forEach((button) => {
        if (button.textContent.trim() === 'Sắp diễn ra') button.click();
      });
    })()`);
    await waitFor(() => evaluate(`new URLSearchParams(location.search).get('q') === 'Bình Dương' &&
      new URLSearchParams(location.search).get('status') === 'scheduled'`), 10000);
    const modifiedUrl = await evaluate('location.href');
    const nextParams = new URLSearchParams({ date: '2026-11-16', league: 'eng.1', status: 'cancelled', q: 'Arsenal' });
    const nextUrl = new URL(`/?${nextParams}`, base).toString();
    await evaluate(`history.pushState({ qa: true }, '', ${JSON.stringify(nextUrl)}); history.back()`);
    await waitFor(() => evaluate(`location.href === ${JSON.stringify(modifiedUrl)}`), 10000);
    await evaluate('history.forward()');
    await waitFor(() => evaluate(`(() => location.href === ${JSON.stringify(nextUrl)} &&
      document.querySelector('.search-control input')?.value === 'Arsenal' &&
      document.querySelector('.date-tab.selected strong')?.textContent === '16/11' &&
      document.querySelector('.competition-item.active .league-badge')?.dataset.leagueId === 'eng.1' &&
      document.querySelector('.status-tab.chosen')?.textContent.includes('Đã hủy'))()`), 15000);
    await evaluate('history.back()');
    await waitFor(() => evaluate(`location.href === ${JSON.stringify(modifiedUrl)} &&
      document.querySelector('.search-control input')?.value === 'Bình Dương' &&
      document.querySelector('.status-tab.chosen')?.textContent.trim() === 'Sắp diễn ra'`), 15000);
    checks.push({ viewport: viewport.name, sharedFilters: 'deep link, clipboard, edits, Back/Forward PASS' });

    const jumpDate = '2026-11-20';
    const picker = await evaluate(`(() => {
      const input = document.querySelector('.date-jump input[type="date"]');
      return { min: input?.min, max: input?.max, value: input?.value,
        width: input?.getBoundingClientRect().width ?? 0 };
    })()`);
    assert.equal(picker.min, '1900-01-01', `${viewport.name}: calendar picker minimum changed`);
    assert.equal(picker.max, '2100-12-31', `${viewport.name}: calendar picker maximum changed`);
    assert.equal(picker.value, '2026-11-15', `${viewport.name}: calendar picker did not sync with history`);
    assert.ok(picker.width >= 100, `${viewport.name}: calendar picker is not usable`);
    await evaluate(`(() => {
      const input = document.querySelector('.date-jump input[type="date"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(jumpDate)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(() => evaluate(`document.querySelector('.date-tab.selected strong')?.textContent === '20/11' &&
      new URLSearchParams(location.search).get('date') === ${JSON.stringify(jumpDate)}`), 15000);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), true,
      `${viewport.name}: calendar picker causes horizontal overflow`);
    checks.push({ viewport: viewport.name, dateJump: 'input/date, URL sync, no overflow PASS' });
    await evaluate(`document.querySelector('.date-month-nav button[aria-label="Tháng sau"]').click()`);
    await waitFor(() => evaluate(`document.querySelector('#match-date-input')?.value === '2026-12-20' &&
      new URLSearchParams(location.search).get('date') === '2026-12-20'`), 15000);
    await evaluate(`document.querySelector('.date-month-nav button[aria-label="Tháng trước"]').click()`);
    await waitFor(() => evaluate(`document.querySelector('#match-date-input')?.value === '2026-11-20' &&
      new URLSearchParams(location.search).get('date') === '2026-11-20'`), 15000);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), true,
      `${viewport.name}: month navigation causes horizontal overflow`);
    checks.push({ viewport: viewport.name, monthNavigation: 'previous/next month, URL sync, no overflow PASS' });
  }
  for (const [date, edge] of [['1900-01-01', 'first'], ['2100-12-31', 'last']]) {
    await evaluate(`(() => {
      history.pushState({}, '', '/?date=${date}');
      window.dispatchEvent(new PopStateEvent('popstate'));
    })()`);
    const dayMonth = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    await waitFor(() => evaluate(`document.querySelector('.date-tab.selected strong')?.textContent === ${JSON.stringify(dayMonth)}`), 5000);
    const state = await evaluate(`(() => ({
      disabledArrows: [...document.querySelectorAll('.date-arrow')].map((button) => button.disabled),
      disabledMonths: [...document.querySelectorAll('.date-month-nav button')].map((button) => button.disabled),
      disabledTabs: document.querySelectorAll('.date-tab:disabled').length,
      selectedDate: new URLSearchParams(location.search).get('date'),
    }))()`);
    assert.deepEqual(state.disabledArrows, edge === 'first' ? [true, false] : [false, true],
      `${date}: calendar allows navigation beyond the supported date range`);
    assert.deepEqual(state.disabledMonths, edge === 'first' ? [true, false] : [false, true],
      `${date}: month navigation allows movement beyond the supported date range`);
    assert.equal(state.disabledTabs, 3, `${date}: out-of-range calendar tabs must be disabled`);
    assert.equal(state.selectedDate, date, `${date}: boundary date was not preserved`);
    checks.push({ date, calendarBoundary: 'PASS' });
  }
  // A weekday can have zero fixtures. Exercise the match dialog on a nearby
  // weekend with confirmed fixtures instead of assuming today's feed has one.
  let modalDate = coverage.matches?.length ? coverage.date : null;
  if (!modalDate) {
    const weekday = new Date(`${coverage.date}T12:00:00Z`).getUTCDay();
    for (const offset of [-weekday, -(weekday + 1), 6 - weekday, 7 - weekday]) {
      const candidate = shiftDate(coverage.date, offset);
      const response = await fetch(new URL(`/api/matches?date=${candidate}`, base), { cache: 'no-store' });
      if (!response.ok) continue;
      const feed = await response.json();
      if (feed.matches?.length) { modalDate = candidate; break; }
    }
  }
  assert.ok(modalDate, 'No fixtures found around either weekend; unable to verify match detail dialog');
  console.log(`Checking match dialog with fixtures from ${modalDate}`);
  await send('Page.navigate', { url: new URL(`/?date=${modalDate}`, base).toString() });
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('.spotlight-open, .match-open')`), 30000);

  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length > 0`), 10000);
  const sampleTeamName = await evaluate(`document.querySelector('.match-row .match-team > span:last-child')?.textContent?.trim()`);
  assert.ok(sampleTeamName, 'Search QA needs a populated match row');
  const setSearch = async (value) => evaluate(`(() => {
    const input = document.querySelector('.search-control input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await setSearch(sampleTeamName.toUpperCase());
  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length > 0`), 5000);
  await setSearch('__sports247_no_matching_team__');
  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length === 0`), 5000);
  for (const punctuation of ['  @@@  ', '⚽️', '...']) {
    await setSearch(punctuation);
    await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length === 0`), 5000);
  }
  await setSearch('   ');
  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length > 0`), 5000);
  await setSearch('');
  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length > 0`), 5000);
  checks.push({ viewport: 'desktop', search: 'team match, punctuation-only no-results, whitespace and reset PASS' });

  // The browser may deliver a response after its AbortSignal has been cancelled.
  // A late result from an older date must never replace the current fixture list.
  await evaluate(`(async () => {
    const source = await fetch('/api/matches?date=${modalDate}').then(response => response.json());
    const fixture = source.matches[0];
    const match = { ...fixture, id: 'qa-date-race-fast',
      home: { ...fixture.home, name: 'SPORTS247 RACE FAST' },
      startTime: '2026-11-24T12:00:00.000Z',
    };
    window.__dateRaceOriginalFetch = window.fetch;
    window.__dateRaceOldStarted = false;
    window.__releaseOldDateResponse = null;
    const responseFor = (date, matches) => new Response(JSON.stringify({
      ...source, date, matches, partial: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    window.fetch = (input, options) => {
      const url = String(input);
      if (url.includes('/api/matches?date=2026-11-23')) {
        window.__dateRaceOldStarted = true;
        return new Promise(resolve => {
          window.__releaseOldDateResponse = () => resolve(responseFor('2026-11-23', []));
        });
      }
      if (url.includes('/api/matches?date=2026-11-24')) {
        return Promise.resolve(responseFor('2026-11-24', [match]));
      }
      return window.__dateRaceOriginalFetch(input, options);
    };
  })()`);
  await evaluate(`(() => {
    history.pushState({}, '', '/?date=2026-11-23');
    dispatchEvent(new PopStateEvent('popstate'));
  })()`);
  await waitFor(() => evaluate(`window.__dateRaceOldStarted && !!window.__releaseOldDateResponse`), 10000);
  await evaluate(`(() => {
    history.pushState({}, '', '/?date=2026-11-24');
    dispatchEvent(new PopStateEvent('popstate'));
  })()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('date') === '2026-11-24'
    && document.querySelector('.match-row')?.textContent?.includes('SPORTS247 RACE FAST')`), 10000);
  await evaluate(`window.__releaseOldDateResponse()`);
  await pause(250);
  assert.equal(await evaluate(`document.querySelector('.match-row')?.textContent?.includes('SPORTS247 RACE FAST')`), true,
    'A delayed response for the previous date replaced the newer fixture');
  await evaluate(`(() => {
    window.fetch = window.__dateRaceOriginalFetch;
    history.pushState({}, '', '/?date=${modalDate}');
    dispatchEvent(new PopStateEvent('popstate'));
  })()`);
  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length > 0`), 15000);
  checks.push({ viewport: 'desktop', dateRace: 'out-of-order aborted response preserves latest date and fixture PASS' });

  // Live navigation always returns to today's schedule and clears stale filters.
  await setSearch('__sports247_no_matching_team__');
  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length === 0`), 5000);
  await evaluate(`document.querySelectorAll('.header-navigation button')[1]?.click()`);
  await waitFor(() => evaluate(`(() => {
    const params = new URLSearchParams(location.search);
    return params.get('date') === ${JSON.stringify(vietnamDate(new Date()))}
      && params.get('status') === 'live' && !params.has('q')
      && document.querySelectorAll('.header-navigation button')[1]?.classList.contains('selected');
  })()`), 10000);
  checks.push({ viewport: 'desktop', liveNavigation: 'today date, live-only filter and cleared search PASS' });
  await evaluate(`(() => {
    history.pushState({}, '', '/?date=${modalDate}');
    window.dispatchEvent(new PopStateEvent('popstate'));
  })()`);
  await waitFor(() => evaluate(`document.querySelectorAll('.match-row').length > 0 &&
    new URLSearchParams(location.search).get('date') === ${JSON.stringify(modalDate)}`), 15000);

  // A favorite changed in another tab must update this tab without writing
  // the same value back. Session storage events must not affect favorites.
  assert.equal(await evaluate(`document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed')`), 'false',
    'unsaved match needs an accessible unpressed state');
  await evaluate(`(() => {
    window.__sports247FavoriteWrites = 0;
    window.__sports247OriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'sports247:favorites') window.__sports247FavoriteWrites++;
      return window.__sports247OriginalSetItem.call(this, key, value);
    };
    document.querySelector('.match-row .save-button').click();
  })()`);
  await waitFor(() => evaluate(`(() => {
    const raw = localStorage.getItem('sports247:favorites');
    return document.querySelector('.match-row .save-button[aria-pressed="true"].saved') && raw && JSON.parse(raw).length === 1;
  })()`));
  const originalFavorite = await evaluate(`localStorage.getItem('sports247:favorites')`);
  await evaluate(`(() => {
    localStorage.setItem('sports247:favorites', '[]');
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'sports247:favorites', newValue: '[]', storageArea: localStorage,
    }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed') === 'false'`));
  assert.equal(await evaluate(`window.__sports247FavoriteWrites`), 2,
    'remote favorite update must not trigger redundant localStorage writes');
  await evaluate(`window.dispatchEvent(new StorageEvent('storage', {
    key: 'sports247:favorites', newValue: ${JSON.stringify(originalFavorite)}, storageArea: sessionStorage,
  }))`);
  assert.equal(await evaluate(`!!document.querySelector('.match-row .save-button.saved')`), false,
    'unrelated sessionStorage events must not alter local favorites');
  await evaluate(`(() => {
    localStorage.setItem('sports247:favorites', ${JSON.stringify(originalFavorite)});
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'sports247:favorites', newValue: ${JSON.stringify(originalFavorite)}, storageArea: localStorage,
    }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed') === 'true'`));
  assert.equal(await evaluate(`window.__sports247FavoriteWrites`), 3,
    'restoring a remote favorite must not trigger redundant localStorage writes');
  // A delayed event can describe an older write even though shared storage
  // already contains a newer value from another tab.
  await evaluate(`window.dispatchEvent(new StorageEvent('storage', {
    key: 'sports247:favorites', newValue: '[]', storageArea: localStorage,
  }))`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await evaluate(`localStorage.getItem('sports247:favorites')`), originalFavorite,
    'a delayed storage event must not roll back newer favorites');
  assert.equal(await evaluate(`document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed')`), 'true',
    'a delayed storage event must not roll back the saved UI state');
  assert.equal(await evaluate(`window.__sports247FavoriteWrites`), 3,
    'a delayed favorite event must never rewrite shared storage');
  await evaluate(`Storage.prototype.setItem = window.__sports247OriginalSetItem`);
  await evaluate(`document.querySelector('.match-row .save-button').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await waitFor(() => evaluate(`(() => {
    const raw = localStorage.getItem('sports247:favorites');
    return document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed') === 'false'
      && raw && JSON.parse(raw).length === 0;
  })()`));
  checks.push({ viewport: 'desktop', favorites: 'click, keyboard Space, aria-pressed, cross-tab sync and no feedback write PASS' });

  // At the 500-ID storage limit, the star must stay unpressed. Otherwise
  // the UI claims the fixture is saved while persistence silently drops it.
  await evaluate(`(() => {
    const full = JSON.stringify(Array.from({ length: 500 }, (_, i) => 'qa-saved-' + i));
    localStorage.setItem('sports247:favorites', full);
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'sports247:favorites', newValue: full, storageArea: localStorage,
    }));
    document.querySelector('.favorites-link')?.click();
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.favorites-tools button')?.textContent?.includes('(500)')`));
  await evaluate(`document.querySelector('.favorites-link')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('.match-row .save-button')`));
  await evaluate(`document.querySelector('.match-row .save-button')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.share-feedback[role="status"]')?.textContent?.includes('500 trận yêu thích')`));
  assert.equal(await evaluate(`document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed')`), 'false',
    'Favorite appeared saved after the 500-match persistence limit');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:favorites')).length`), 500,
    'Adding after the limit should not change the saved set');
  await evaluate(`(() => {
    localStorage.setItem('sports247:favorites', '[]');
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'sports247:favorites', newValue: '[]', storageArea: localStorage,
    }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.favorites-link')?.getAttribute('aria-pressed') === 'false' &&
    document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed') === 'false'`));
  checks.push({ viewport: 'desktop', favoritesLimit: '500-item cap matches UI and localStorage PASS' });

  // Exercise the actual backup controls with a valid JSON file, an invalid
  // file and a downloadable Blob, while keeping the browser's data local.
  await evaluate(`document.querySelector('.match-row .save-button')?.click()`);
  await waitFor(() => evaluate(`JSON.parse(localStorage.getItem('sports247:favorites') ?? '[]').length === 1`));
  await evaluate(`document.querySelector('.favorites-link')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('.favorites-tools')`));
  await evaluate(`(() => {
    window.__originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      window.__favoriteExportBlob = blob;
      return window.__originalCreateObjectURL.call(URL, blob);
    };
    document.querySelector('.favorites-tools button')?.click();
    URL.createObjectURL = window.__originalCreateObjectURL;
  })()`);
  const exported = await evaluate(`window.__favoriteExportBlob?.text()`);
  assert.ok(exported, 'Favorite export did not produce a JSON Blob');
  const exportedBackup = JSON.parse(exported);
  assert.equal(exportedBackup.version, 1, 'Favorite export lacks its backup version');
  assert.equal(exportedBackup.favorites.length, 1, 'Favorite export omitted the saved match');
  const importedId = 'ger.1:browser-qa-backup';
  const validBackupPath = path.join(profile, 'sports247-favorites-valid.json');
  const invalidBackupPath = path.join(profile, 'sports247-favorites-invalid.json');
  await writeFile(validBackupPath, JSON.stringify({ version: 1, favorites: [importedId, importedId] }));
  await writeFile(invalidBackupPath, '{invalid JSON');
  const { root: documentNode } = await send('DOM.getDocument');
  const { nodeId: importInputId } = await send('DOM.querySelector', {
    nodeId: documentNode.nodeId, selector: '.favorites-tools input[type="file"]',
  });
  assert.ok(importInputId, 'Favorite import file input missing');
  await send('DOM.setFileInputFiles', { nodeId: importInputId, files: [validBackupPath] });
  await waitFor(() => evaluate(`JSON.parse(localStorage.getItem('sports247:favorites') ?? '[]').includes(${JSON.stringify(importedId)})`));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:favorites')).length`), 2,
    'Favorite import did not deduplicate or merge existing saved matches');
  await send('DOM.setFileInputFiles', { nodeId: importInputId, files: [invalidBackupPath] });
  await waitFor(() => evaluate(`document.querySelector('.favorites-tools [role="status"]')?.textContent?.includes('không hợp lệ')`));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:favorites')).length`), 2,
    'Invalid favorite import modified saved data');
  // Reminders must be opt-in, persist the chosen lead and allow explicit opt-out.
  assert.equal(await evaluate(`document.querySelector('.reminder-tools button')?.getAttribute('aria-pressed')`), 'false',
    'Reminder settings should default to disabled');
  await evaluate(`document.querySelector('.reminder-tools button')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.reminder-tools button')?.getAttribute('aria-pressed') === 'true'
    && JSON.parse(localStorage.getItem('sports247:reminder-settings') ?? '{}').enabled === true`));
  await evaluate(`(() => {
    const select = document.querySelector('.reminder-tools select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '60');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`JSON.parse(localStorage.getItem('sports247:reminder-settings') ?? '{}').minutesBefore === 60`));
  await evaluate(`window.dispatchEvent(new StorageEvent('storage', {
    key: 'sports247:reminder-settings',
    newValue: JSON.stringify({ enabled: false, minutesBefore: 30 }), storageArea: localStorage,
  }))`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:reminder-settings')).enabled`), true,
    'a delayed reminder-settings event must not disable newer preferences');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:reminder-settings')).minutesBefore`), 60,
    'a delayed reminder-settings event must not revert the lead time');
  // Older reminder requests must not overwrite a newer postponement response.
  // Keep the first response pending and deliberately resolve it after the second.
  const reminderDate = vietnamDate(new Date());
  await evaluate(`(async () => {
    const saved = JSON.parse(localStorage.getItem('sports247:favorites'))[0];
    const historical = await fetch('/api/matches?date=${modalDate}').then((response) => response.json());
    const fixture = historical.matches.find((match) => match.id === saved);
    if (!fixture) throw new Error('Saved fixture unavailable for reminder QA');
    window.__reminderQaFixture = { ...fixture,
      startTime: new Date(Date.now() + 10 * 60_000).toISOString(),
      status: 'scheduled', statusDetail: 'Chưa bắt đầu',
    };
    window.__reminderOriginalFetch = window.fetch;
    window.__reminderRaceCount = 0;
    window.__releaseStaleReminder = null;
    window.fetch = (input, init) => String(input).startsWith('/api/matches?date=${reminderDate}')
      ? (() => {
          const sequence = ++window.__reminderRaceCount;
          const match = sequence === 1 ? window.__reminderQaFixture :
            { ...window.__reminderQaFixture, status: 'postponed', statusDetail: 'Tạm hoãn' };
          const reply = () => new Response(JSON.stringify({ ...historical, date: '${reminderDate}',
            matches: [match] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          if (sequence === 1) return new Promise((resolve) => {
            window.__releaseStaleReminder = () => resolve(reply());
          });
          return Promise.resolve(reply());
        })()
      : window.__reminderOriginalFetch(input, init);
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await waitFor(() => evaluate(`window.__reminderRaceCount === 1 && !!window.__releaseStaleReminder`));
  await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
  await waitFor(() => evaluate(`window.__reminderRaceCount >= 2`));
  await pause(300);
  await evaluate(`window.__releaseStaleReminder()`);
  await pause(300);
  assert.equal(await evaluate(`!!document.querySelector('.reminder-alert')`), false,
    'A stale scheduled response reactivated a reminder after the fixture was postponed');
  checks.push({ viewport: 'desktop', reminderRace: 'newer postponement wins over delayed scheduled response PASS' });
  // A Web Lock can be granted after opt-out. The queued callback must not
  // consume a reminder that was never displayed to the user.
  await evaluate(`(() => {
    window.__reminderLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    window.__deferredReminderLock = null;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request(_name, callback) {
        return new Promise((resolve) => {
          window.__deferredReminderLock = () => resolve(callback());
        });
      },
    } });
    window.fetch = (input, init) => String(input).startsWith('/api/matches?date=${reminderDate}')
      ? Promise.resolve(new Response(JSON.stringify({
          date: '${reminderDate}', matches: [window.__reminderQaFixture], partial: false,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : window.__reminderOriginalFetch(input, init);
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await waitFor(() => evaluate(`typeof window.__deferredReminderLock === 'function'`));
  await evaluate(`document.querySelector('.reminder-tools button')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.reminder-tools button')?.getAttribute('aria-pressed') === 'false'`));
  await evaluate(`(() => {
    window.__deferredReminderLock();
    if (window.__reminderLocksDescriptor) {
      Object.defineProperty(navigator, 'locks', window.__reminderLocksDescriptor);
    } else {
      delete navigator.locks;
    }
  })()`);
  await pause(250);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:reminders-sent') ?? '[]').length`), 0,
    'A cancelled Web Lock callback consumed a reminder after opt-out');
  assert.equal(await evaluate(`!!document.querySelector('.reminder-alert')`), false,
    'A cancelled Web Lock callback displayed a reminder after opt-out');
  checks.push({ viewport: 'desktop', reminderLock: 'queued lock is cancelled after opt-out PASS' });
  // The regular notification path still announces a due saved fixture once.
  await evaluate(`(() => {
    window.fetch = (input, init) => String(input).startsWith('/api/matches?date=${reminderDate}')
      ? Promise.resolve(new Response(JSON.stringify({
          date: '${reminderDate}', matches: [window.__reminderQaFixture], partial: false,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : window.__reminderOriginalFetch(input, init);
    document.querySelector('.reminder-tools button')?.click();
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.reminder-alert')?.textContent?.includes('Sắp bóng lăn:')`));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:reminders-sent') ?? '[]').length`), 1,
    'A due saved fixture must create one persistent announcement record');
  await evaluate(`(() => {
    document.querySelector('.reminder-alert button')?.click();
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await pause(500);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sports247:reminders-sent') ?? '[]').length`), 1,
    'Refreshing a reminder feed must not announce the same fixture twice');
  await evaluate(`window.fetch = window.__reminderOriginalFetch`);
  await evaluate(`document.querySelector('.reminder-tools button')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.reminder-tools button')?.getAttribute('aria-pressed') === 'false'
    && JSON.parse(localStorage.getItem('sports247:reminder-settings') ?? '{}').enabled === false`));
  checks.push({ viewport: 'desktop', reminders: 'opt-in, lead selection, due toast, dedup and opt-out PASS' });
  await evaluate(`(() => {
    localStorage.setItem('sports247:favorites', '[]');
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'sports247:favorites', newValue: '[]', storageArea: localStorage,
    }));
    document.querySelector('.favorites-link')?.click();
  })()`);
  checks.push({ viewport: 'desktop', favoritesBackup: 'export JSON, import dedup, reject malformed backup PASS' });

  if (dialogChunk) {
    const loadedBeforeOpen = await evaluate(`performance.getEntriesByType('resource').some(
      (entry) => new URL(entry.name).pathname.endsWith(${JSON.stringify(dialogChunk)})
    )`);
    assert.equal(loadedBeforeOpen, false, 'Match detail chunk loaded before a match was opened');
  }
  await evaluate(`(() => { const opener = document.querySelector('.spotlight-open, .match-open'); opener?.focus(); opener?.click(); })()`);
  await waitFor(() => evaluate(`!!document.querySelector('[role="dialog"]')`), 10000);
  if (dialogChunk) {
    await waitFor(() => evaluate(`performance.getEntriesByType('resource').some(
      (entry) => new URL(entry.name).pathname.endsWith(${JSON.stringify(dialogChunk)})
    )`), 10000);
    checks.push({ viewport: 'desktop', matchDetailChunk: 'loaded on modal open PASS' });
  }
  assert.equal(await evaluate(`!!document.querySelector('.dialog-league-label .league-badge')`), true,
    'Match detail dialog has no competition logo');
  await waitFor(() => evaluate(`document.activeElement === document.querySelector('.match-dialog .icon-button')`), 10000);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  const wrappedToLast = await evaluate(`(() => {
    const focusable = [...document.querySelectorAll('.match-dialog button:not(:disabled), .match-dialog a[href], .match-dialog [tabindex]:not([tabindex="-1"])')].filter(el => el.getClientRects().length);
    return focusable.length > 1 && document.activeElement === focusable.at(-1);
  })()`);
  assert.equal(wrappedToLast, true, 'Match dialog Shift+Tab did not wrap to last focusable');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate(`document.activeElement === document.querySelector('.match-dialog .icon-button')`), true,
    'Match dialog Tab did not wrap to close control');
  await evaluate(`document.querySelector('#detail-tab-overview')?.focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await waitFor(() => evaluate(`document.querySelector('#detail-tab-overview')?.getAttribute('aria-selected') === 'false'`), 10000);
  assert.equal(await evaluate(`!!document.activeElement?.matches('[role="tab"][aria-selected="true"]')`), true,
    'ArrowRight did not move focus to selected match detail tab');
  // Exercise the watch tab without contacting optional paid video providers.
  await send('Network.setBlockedURLs', { urls: ['*/api/watch?*'] });
  await evaluate(`document.querySelector('[role="tab"]#detail-tab-watch')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('#detail-tab-watch')?.getAttribute('aria-selected') === 'true'`), 10000);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 10000);
  await send('Network.setBlockedURLs', { urls: [] });
  assert.equal(await evaluate(`document.activeElement === document.querySelector('.spotlight-open, .match-open')`), true,
    'Match detail Escape did not restore focus to opener');
  checks.push({ viewport: 'desktop', keyboardDialog: 'focus trap, ArrowRight tab, Escape focus restoration PASS' });
  // A restored URL must close a detail view from the old navigation state.
  await evaluate(`document.querySelector('.spotlight-open, .match-open')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('[role="dialog"]')`), 10000);
  await evaluate(`(() => {
    const url = new URL(location.href);
    url.searchParams.set('date', ${JSON.stringify(modalDate)});
    url.searchParams.set('status', 'scheduled');
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  })()`);
  await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 10000);
  assert.equal(await evaluate(`document.querySelector('.status-tab.chosen')?.textContent?.includes('Sắp diễn ra')`), true,
    'History restoration did not apply the requested status filter');
  checks.push({ viewport: 'desktop', navigation: 'popstate closes old match detail and restores filters PASS' });
  // A real ESPN fixture must be bookmarkable, render through SSR, and survive
  // reload and Back navigation. Choose it from the confirmed feed at runtime.
  const matchFeedResponse = await fetch(new URL(`/api/matches?date=${modalDate}`, base), { cache: 'no-store' });
  assert.equal(matchFeedResponse.status, 200, 'Could not load fixtures for match permalink QA');
  const matchFeed = await matchFeedResponse.json();
  const espnFixture = matchFeed.matches.find((match) => match.source === 'ESPN' &&
    /^\d{6,12}$/.test(match.eventId) && LEAGUES.some((league) => league.id === match.leagueId));
  assert.ok(espnFixture, 'No verified ESPN fixture available for match permalink QA');
  const matchPath = `/match/${espnFixture.leagueId}/${espnFixture.eventId}`;
  const matchPageResponse = await fetch(new URL(matchPath, base));
  assert.equal(matchPageResponse.status, 200, `Confirmed match permalink failed: ${matchPath}`);
  const matchHtml = await matchPageResponse.text();
  assert.match(matchHtml, /<title>[^<]*SPORTS247<\/title>/, 'Match page has no descriptive SSR title');
  assert.ok(matchHtml.includes(`rel="canonical"`) && matchHtml.includes(matchPath),
    'Match page has no canonical event URL');
  const invalidMatchResponse = await fetch(new URL('/match/invalid/not-an-event', base));
  assert.equal(invalidMatchResponse.status, 404, 'Invalid event URL must return HTTP 404');
  await send('Page.navigate', { url: new URL(matchPath, base).toString() });
  await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(matchPath)} &&
    !!document.querySelector('.match-dialog-page .dialog-scoreline')`), 30000);
  const matchPageState = await evaluate(`(() => ({
    teams: [...document.querySelectorAll('.match-dialog-page .dialog-team strong')].map(el => el.textContent.trim()),
    tabs: document.querySelectorAll('.match-dialog-page [role="tab"]').length,
    modal: document.querySelector('.match-dialog-page')?.getAttribute('aria-modal'),
    overflow: document.body.style.overflow,
    copy: !!document.querySelector('.match-dialog-page .detail-share-controls button'),
    overflowWidth: document.documentElement.scrollWidth > window.innerWidth,
  }))()`);
  assert.deepEqual(matchPageState.teams, [espnFixture.home.name, espnFixture.away.name],
    'Match permalink displays a fixture different from the confirmed feed');
  assert.equal(matchPageState.tabs, 5, 'Match permalink lost its accessible detail tabs');
  assert.equal(matchPageState.modal, null, 'Standalone match page must permit normal navigation');
  assert.notEqual(matchPageState.overflow, 'hidden', 'Standalone match page prevents scrolling');
  assert.equal(matchPageState.copy, true, 'Standalone match page is missing the share action');
  assert.equal(matchPageState.overflowWidth, false, 'Standalone match page overflows the compact viewport');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(matchPath)} &&
    document.querySelectorAll('.match-dialog-page .dialog-team strong').length === 2`), 30000);
  await evaluate(`history.back()`);
  await waitFor(() => evaluate(`location.pathname === '/' && !!document.querySelector('.app-shell')`), 30000);
  // After a full-page history navigation, SSR can paint before React event
  // handlers hydrate. Verify a real interaction before testing offline events.
  await waitFor(async () => {
    if (await evaluate(`document.querySelector('.stat-box--finished')?.getAttribute('aria-pressed') === 'true'`)) return true;
    await evaluate(`document.querySelector('.stat-box--finished')?.click()`);
    return false;
  }, 15000);
  await evaluate(`document.querySelector('.stat-box--all')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.stat-box--all')?.getAttribute('aria-pressed') === 'true'`), 10000);
  checks.push({ viewport: 'compact', matchPermalink: 'real ESPN SSR, canonical, 404, teams, reload, Back, responsive PASS' });
  // Recover from an interrupted in-flight refresh without waiting for the 90s timer.
  await evaluate(`(() => {
    document.querySelector('.header-refresh')?.click();
    window.dispatchEvent(new Event('offline'));
  })()`);
  await waitFor(() => evaluate(`!!document.querySelector('.update-indicator--error .update-retry')`), 10000);
  assert.equal(await evaluate(`document.querySelector('.header-refresh')?.getAttribute('aria-busy')`), 'false',
    'Offline abort must release the refresh control');
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  await waitFor(() => evaluate(`!!document.querySelector('.update-indicator:not(.update-indicator--error)')`), 45000);

  // A failed manual request must show an actionable retry and clear after recovery.
  await send('Network.setBlockedURLs', { urls: ['*/api/matches?*'] });
  await evaluate(`document.querySelector('.header-refresh')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('.update-indicator--error .update-retry')`), 10000);
  await send('Network.setBlockedURLs', { urls: [] });
  await evaluate(`document.querySelector('.update-retry')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('.update-indicator:not(.update-indicator--error)')`), 45000);
  checks.push({ viewport: 'desktop', refreshRecovery: 'offline/online and manual retry PASS' });
  // Pinned league shortcuts must persist, drive filters, and ignore stale storage events.
  await evaluate(`document.querySelector('.competition-pin[data-league-id="eng.1"]')?.click()`);
  await evaluate(`document.querySelector('.competition-pin[data-league-id="ger.1"]')?.click()`);
  await waitFor(() => evaluate(`localStorage.getItem('sports247:pinned-leagues:v1') === '["eng.1","ger.1"]'
    && document.querySelectorAll('.pinned-league-shortcut').length === 2`), 5000);
  await evaluate(`document.querySelector('.pinned-league-shortcut[data-league-id="ger.1"]')?.click()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('league') === 'ger.1'
    && document.querySelector('.pinned-league-shortcut[data-league-id="ger.1"]')?.getAttribute('aria-pressed') === 'true'`), 5000);
  await send('Page.reload', { ignoreCache: false });
  await waitFor(() => evaluate(`document.readyState === 'complete'
    && document.querySelectorAll('.pinned-league-shortcut').length === 2
    && new URLSearchParams(location.search).get('league') === 'ger.1'`), 15000);
  await evaluate(`window.dispatchEvent(new StorageEvent('storage', {
    key: 'sports247:pinned-leagues:v1', newValue: '["eng.1"]', storageArea: localStorage,
  }))`);
  await pause(200);
  assert.equal(await evaluate(`document.querySelectorAll('.pinned-league-shortcut').length`), 2,
    'A delayed pin storage event discarded a newer shortcut');
  await evaluate(`document.querySelector('.competition-pin[data-league-id="eng.1"]')?.click()`);
  await evaluate(`document.querySelector('.competition-pin[data-league-id="ger.1"]')?.click()`);
  await waitFor(() => evaluate(`localStorage.getItem('sports247:pinned-leagues:v1') === '[]'
    && document.querySelectorAll('.pinned-league-shortcut').length === 0`), 5000);
  assert.equal(await evaluate(`document.documentElement.scrollWidth > window.innerWidth`), false,
    'Pinned league controls introduced horizontal overflow');
  checks.push({ viewport: 'compact', pinnedLeagues: 'persist, filter, reload, stale storage event, remove and no overflow PASS' });
  // Saved searches must follow the query, survive reload and ignore delayed storage notifications.
  await evaluate(`(() => {
    const input = document.querySelector('.search-control input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Bình Dương');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('q') === 'Bình Dương' &&
    !!document.querySelector('.saved-search-add')`), 5000);
  await evaluate(`document.querySelector('.saved-search-add')?.click()`);
  await waitFor(() => evaluate(`localStorage.getItem('sports247:saved-searches:v1') === '["Bình Dương"]' &&
    document.querySelectorAll('.saved-search-select').length === 1`), 5000);
  await evaluate(`(() => {
    const input = document.querySelector('.search-control input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Arsenal');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('q') === 'Arsenal'`), 5000);
  await evaluate(`document.querySelector('.saved-search-select')?.click()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('q') === 'Bình Dương'`), 5000);
  await send('Page.reload', { ignoreCache: false });
  await waitFor(() => evaluate(`document.readyState === 'complete' &&
    document.querySelector('.saved-search-select')?.textContent.includes('Bình Dương')`), 15000);
  await evaluate(`window.dispatchEvent(new StorageEvent('storage', {
    key: 'sports247:saved-searches:v1', newValue: '["Arsenal"]', storageArea: localStorage,
  }))`);
  await pause(200);
  assert.equal(await evaluate(`document.querySelector('.saved-search-select')?.textContent.includes('Bình Dương')`), true,
    'An outdated saved-search storage event discarded a newer preset');
  await evaluate(`document.querySelector('.saved-search-remove')?.click()`);
  await waitFor(() => evaluate(`localStorage.getItem('sports247:saved-searches:v1') === '[]' &&
    document.querySelectorAll('.saved-search-select').length === 0`), 5000);
  assert.equal(await evaluate(`document.documentElement.scrollWidth > window.innerWidth`), false,
    'Saved searches introduced horizontal overflow');
  checks.push({ viewport: 'compact', savedSearches: 'persist, restore filter, reload, stale event, remove, no overflow PASS' });
  // Team shortcuts are provider/league-specific and must survive date changes and reload.
  await send('Page.navigate', { url: new URL(`/?date=${modalDate}`, base).toString() });
  await waitFor(() => evaluate(`document.querySelectorAll('#team-follow-select option').length > 1 &&
    document.querySelectorAll('.match-row').length > 0`), 30000);
  await waitFor(async () => {
    if (await evaluate(`document.querySelector('.stat-box--finished')?.getAttribute('aria-pressed') === 'true'`)) return true;
    await evaluate(`document.querySelector('.stat-box--finished')?.click()`);
    return false;
  }, 15000);
  await evaluate(`document.querySelector('.stat-box--all')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.stat-box--all')?.getAttribute('aria-pressed') === 'true'`), 5000);
  const followedId = await evaluate(`document.querySelector('#team-follow-select option:nth-child(2)')?.value`);
  assert.ok(followedId, 'A fixture team is required for followed-team QA');
  await evaluate(`(() => {
    const select = document.querySelector('#team-follow-select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(followedId)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.team-follow-add')?.disabled === false`), 5000);
  await evaluate(`document.querySelector('.team-follow-add')?.click()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('team') === ${JSON.stringify(followedId)} &&
    document.querySelector('.followed-team-select')?.getAttribute('aria-pressed') === 'true' &&
    JSON.parse(localStorage.getItem('sports247:followed-teams:v1') ?? '[]').length === 1`), 5000);
  await evaluate(`document.querySelector('.date-arrow[aria-label="Ngày tiếp theo"]')?.click()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('team') === ${JSON.stringify(followedId)} &&
    new URLSearchParams(location.search).get('date') !== ${JSON.stringify(modalDate)}`), 5000);
  await send('Page.reload', { ignoreCache: false });
  await waitFor(() => evaluate(`document.readyState === 'complete' &&
    new URLSearchParams(location.search).get('team') === ${JSON.stringify(followedId)} &&
    document.querySelector('.followed-team-select')?.getAttribute('aria-pressed') === 'true'`), 15000);
  await evaluate(`window.dispatchEvent(new StorageEvent('storage', {
    key: 'sports247:followed-teams:v1', newValue: '[]', storageArea: localStorage,
  }))`);
  await pause(200);
  assert.equal(await evaluate(`document.querySelectorAll('.followed-team-select').length`), 1,
    'An outdated followed-teams storage event discarded a newer shortcut');
  await evaluate(`document.querySelector('.followed-team-select')?.click()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).has('team') === false &&
    document.querySelector('.followed-team-select')?.getAttribute('aria-pressed') === 'false'`), 5000);
  await evaluate(`document.querySelector('.followed-team-remove')?.click()`);
  await waitFor(() => evaluate(`localStorage.getItem('sports247:followed-teams:v1') === '[]' &&
    document.querySelectorAll('.followed-team-select').length === 0`), 5000);
  assert.equal(await evaluate(`document.documentElement.scrollWidth > window.innerWidth`), false,
    'Followed team controls introduced horizontal overflow');
  checks.push({ viewport: 'compact', followedTeams: 'follow, URL, date, reload, stale event, remove and no overflow PASS' });
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
  // Some browser privacy modes throw when accessing the localStorage property
  // itself. Saving a favorite should still work for the current page session.
  await send('Network.setBlockedURLs', { urls: [] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__sports247PrivacyErrors = [];
    window.addEventListener('error', (event) => {
      window.__sports247PrivacyErrors.push(event.message || String(event.error));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__sports247PrivacyErrors.push(String(event.reason));
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage disabled', 'SecurityError'); },
    });
  ` });
  await send('Page.navigate', { url: new URL(`/?date=${modalDate}`, base).toString() });
  await waitFor(() => evaluate(`!document.querySelector('.matchday-intro') && !!document.querySelector('.match-row .save-button')`), 30000);
  assert.equal(await evaluate(`(() => {
    try { void localStorage; return false; }
    catch (error) { return error?.name === 'SecurityError'; }
  })()`), true, 'Privacy-mode storage getter did not throw');
  assert.deepEqual(await evaluate(`window.__sports247PrivacyErrors`), [],
    'Storage denied mode must not throw while hydrating favorites or reminders');
  await evaluate(`document.querySelector('.match-row .save-button')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.match-row .save-button')?.getAttribute('aria-pressed') === 'true'`), 5000);
  await evaluate(`document.querySelector('.favorites-link')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('.reminder-tools button')`), 5000);
  await evaluate(`document.querySelector('.reminder-tools button')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.reminder-tools button')?.getAttribute('aria-pressed') === 'true'`), 5000);
  await evaluate(`document.querySelector('.competition-pin[data-league-id="eng.1"]')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('.pinned-league-shortcut[data-league-id="eng.1"]')`), 5000);
  await evaluate(`(() => {
    const input = document.querySelector('.search-control input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Arsenal');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`!!document.querySelector('.saved-search-add')`), 5000);
  await evaluate(`document.querySelector('.saved-search-add')?.click()`);
  await waitFor(() => evaluate(`!!document.querySelector('.saved-search-select')`), 5000);
  const privacyTeam = await evaluate(`document.querySelector('#team-follow-select option:nth-child(2)')?.value`);
  assert.ok(privacyTeam, 'Privacy-mode fixture must offer a team preset');
  await evaluate(`(() => {
    const select = document.querySelector('#team-follow-select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(privacyTeam)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate(`document.querySelector('.team-follow-add')?.disabled === false`), 5000);
  await evaluate(`document.querySelector('.team-follow-add')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('.followed-team-select')?.getAttribute('aria-pressed') === 'true'`), 5000);
  await evaluate(`(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'sports247:favorites' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'sports247:reminder-settings' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'sports247:pinned-leagues:v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'sports247:saved-searches:v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'sports247:followed-teams:v1' }));
  })()`);
  await pause(200);
  assert.deepEqual(await evaluate(`window.__sports247PrivacyErrors`), [],
    'Storage denied mode must not cause uncaught browser errors');
  checks.push({ viewport: 'compact', blockedStorage: 'favorites, reminders, league pins, saved searches and team shortcuts survive denied localStorage and storage events PASS' });
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
