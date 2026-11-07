/** Repeatable Chrome lab audit. Reports raw timings; this is not a Lighthouse score or field CWV. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = process.env.SPORTS247_BASE_URL ?? 'http://127.0.0.1:3199';
const chrome = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/google-chrome');
const reportPath = path.resolve(process.env.SPORTS247_AUDIT_OUTPUT ?? 'temp/sports247-browser-audit.json');
const axePath = path.resolve('node_modules/axe-core/axe.min.js');
const sampleCount = Number(process.env.SPORTS247_AUDIT_RUNS ?? 3);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
};
const contrastSummary = (review) => ({
  checked: review.nodes.filter((node) => node.status === 'pass' || node.status === 'needs-review').length,
  pass: review.nodes.filter((node) => node.status === 'pass').length,
  needsReview: review.nodes.filter((node) => node.status === 'needs-review').length,
  notMeasured: review.nodes.filter((node) => node.status === 'not-measured').length,
  excluded: review.nodes.filter((node) => node.status === 'excluded').length,
});
const profile = await mkdtemp(path.join(tmpdir(), 'sports247-audit-'));
const pending = new Map();
let browser;
let socket;
let nextId = 0;

async function waitFor(condition, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = await condition().catch(() => null);
    if (value) return value;
    await pause(200);
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chrome protocol timed out: ${method}`));
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Browser evaluation failed');
  return result.result?.value;
}

const installObservers = `(() => {
  window.__sports247Lab = { lcp: null, lcpElement: null, cls: 0, layoutShifts: 0 };
  if (PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) {
    new PerformanceObserver(list => {
      for (const item of list.getEntries()) {
        window.__sports247Lab.lcp = Math.round(item.startTime);
        const element = item.element;
        window.__sports247Lab.lcpElement = element ? {
          tag: element.tagName.toLowerCase(),
          className: String(element.className).slice(0, 100),
          text: element.textContent?.trim().slice(0, 100) ?? '',
          imageUrl: item.url?.slice(0, 160) ?? '',
        } : null;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  }
  if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
    new PerformanceObserver(list => {
      for (const item of list.getEntries()) {
        if (!item.hadRecentInput) {
          window.__sports247Lab.cls += item.value;
          window.__sports247Lab.layoutShifts += 1;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }
})()`;

const inspectPage = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
  const visible = node => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const unnamedControls = [...document.querySelectorAll('button, a[href], input, select')]
    .filter(visible)
    .filter(el => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') &&
      !el.getAttribute('title') && !el.textContent?.trim() &&
      !el.getAttribute('placeholder') && !el.querySelector('img[alt]'))
    .slice(0, 12).map(el => el.outerHTML.slice(0, 150));
  const imagesWithoutAlt = [...document.querySelectorAll('img:not([alt])')]
    .filter(visible).slice(0, 12).map(el => el.currentSrc?.slice(0, 160));
  return {
    url: location.href,
    title: document.title,
    language: document.documentElement.lang,
    mainCount: document.querySelectorAll('main').length,
    headingCount: document.querySelectorAll('h1').length,
    viewportWidth: innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    fcpMs: fcp ? Math.round(fcp.startTime) : null,
    lcpMs: window.__sports247Lab?.lcp ?? null,
    lcpElement: window.__sports247Lab?.lcpElement ?? null,
    cls: window.__sports247Lab ? Number(window.__sports247Lab.cls.toFixed(4)) : null,
    layoutShifts: window.__sports247Lab?.layoutShifts ?? null,
    ttfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    unnamedControls,
    imagesWithoutAlt,
    matchRows: document.querySelectorAll('.match-row').length,
  };
})()`;

/** Advisory pixel evidence for axe's unresolved gradient text, not a WCAG certification. */
async function reviewGradientContrast(incomplete) {
  const selectors = incomplete.flatMap((item) => item.review ?? []).map((node) => node.target[0]);
  if (!selectors.length) return { method: 'none needed', nodes: [], summary: {} };
  const targets = await evaluate(`(() => {
    const selectors = ${JSON.stringify(selectors)};
    const nodes = selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, rectangles: [], reason: 'selector missing' };
      // SlidingNumber renders offscreen decorative digits inside aria-hidden rollers.
      // Their text ranges are not visible text and must not enter pixel contrast checks.
      if (element.closest('[aria-hidden="true"]')) return {
        selector, rectangles: [], reason: 'aria-hidden decorative text', excluded: true,
      };
      const style = getComputedStyle(element);
      const rectangles = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (!text.textContent?.trim()) continue;
        if (text.parentElement?.closest('[aria-hidden="true"]')) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) rectangles.push({
            x: rect.left + scrollX, y: rect.top + scrollY,
            width: rect.width, height: rect.height,
          });
        }
      }
      return {
        selector, rectangles, foreground: style.color,
        excluded: rectangles.length === 0, reason: rectangles.length ? undefined : 'only aria-hidden decorative text',
        fontSize: Number.parseFloat(style.fontSize), fontWeight: Number.parseInt(style.fontWeight, 10),
      };
    });
    const mute = document.createElement('style');
    mute.id = 'sports247-contrast-background-only';
    // Fixed mascot can be composited over unrelated page content in a full-page
    // screenshot. The footer's decorative status dot also occupies a text-node
    // rectangle; its green pixels are not the background behind the letters.
    // Temporarily hide these non-text decorations without changing their layout.
    mute.textContent = [
      ...selectors.map(selector => selector + ' { color: transparent !important; text-shadow: none !important; }'),
      '.mascot-dock { visibility: hidden !important; }',
      '.footer-live { visibility: hidden !important; }',
    ].join('\\n');
    document.head.append(mute);
    return nodes;
  })()`);
  try {
    // Capture after replacing text ink with transparency, retaining element backgrounds and layout.
    await pause(100);
    const metrics = await send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const width = Math.ceil(content.width);
    const height = Math.ceil(content.height);
    const shot = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, fromSurface: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const nodes = await evaluate(`(async () => {
      const targets = ${JSON.stringify(targets)};
      const png = ${JSON.stringify(`data:image/png;base64,${shot.data}`)};
      const img = new Image();
      img.src = png;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gamma = n => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const luminance = (r, g, b) => 0.2126 * gamma(r) + 0.7152 * gamma(g) + 0.0722 * gamma(b);
      const parseColor = value => (value?.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
      return targets.map(node => {
        if (node.excluded) return { selector: node.selector, status: 'excluded', reason: node.reason };
        const rgb = parseColor(node.foreground);
        if (rgb.length !== 3 || !node.rectangles?.length) return { selector: node.selector, status: 'not-measured', reason: node.reason ?? 'no text rectangles or RGB color' };
        const foreground = luminance(...rgb);
        const large = node.fontSize >= 24 || (node.fontSize >= 18.667 && node.fontWeight >= 700);
        const required = large ? 3 : 4.5;
        let minimum = Infinity;
        let count = 0;
        let worstPixel = null;
        for (const rect of node.rectangles) {
          const minX = Math.max(0, Math.floor(rect.x) + 1);
          const maxX = Math.min(canvas.width, Math.ceil(rect.x + rect.width) - 1);
          const minY = Math.max(0, Math.floor(rect.y) + 1);
          const maxY = Math.min(canvas.height, Math.ceil(rect.y + rect.height) - 1);
          for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
              const i = (y * canvas.width + x) * 4;
              const background = luminance(image.data[i], image.data[i+1], image.data[i+2]);
              const ratio = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
              if (ratio < minimum) {
                minimum = ratio;
                worstPixel = { x, y, rgb: [image.data[i], image.data[i+1], image.data[i+2]] };
              }
              count++;
            }
          }
        }
        if (!count) return { selector: node.selector, status: 'not-measured', reason: 'text outside screenshot' };
        const minRatio = Number(minimum.toFixed(2));
        return { selector: node.selector, foreground: node.foreground, fontSize: node.fontSize,
          fontWeight: node.fontWeight, minRatio, required, sampledPixels: count, worstPixel,
          status: minimum >= required ? 'pass' : 'needs-review' };
      });
    })()`);
    return {
      method: 'Full-page Chrome screenshot with foreground text muted, floating mascot and decorative footer status dot hidden; minimum pixel ratio across text-node rectangles',
      limitation: 'One local rendering only; mascot and footer dot are excluded from background sampling. Mascot can still obscure content in actual use. Image loading, hover, different data and text antialiasing can affect results.',
      image: { width, height }, nodes, summary: contrastSummary({ nodes }),
    };
  } finally {
    await evaluate(`document.getElementById('sports247-contrast-background-only')?.remove()`).catch(() => {});
  }
}

try {
  assert.ok(Number.isInteger(sampleCount) && sampleCount >= 1 && sampleCount <= 5,
    'SPORTS247_AUDIT_RUNS must be an integer between 1 and 5');
  assert.ok(existsSync(chrome), `Chrome executable is unavailable: ${chrome}`);
  assert.ok(existsSync(axePath), 'Accessibility audit requires axe-core (run npm ci)');
  const target = new URL(base);
  assert.ok(['http:', 'https:'].includes(target.protocol), 'Expected an HTTP(S) URL');
  browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--force-prefers-reduced-motion', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  const port = await waitFor(async () => {
    const data = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');
    return Number(data.split(/\r?\n/)[0]);
  });
  const tabResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  assert.equal(tabResponse.status, 200);
  const tab = await tabResponse.json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message.result ?? {});
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Performance.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: installObservers });
  const runs = [];
  const accessibility = {};
  const contrastReview = {};
  const axeSource = await readFile(axePath, 'utf8');

  for (const preset of [
    { name: 'desktop', width: 1440, height: 900, mobile: false, cpuRate: 1, latency: 0, download: -1, upload: -1 },
    { name: 'mobile', width: 390, height: 844, mobile: true, cpuRate: 4, latency: 100, download: 200000, upload: 94000 },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: preset.width, height: preset.height, deviceScaleFactor: 1, mobile: preset.mobile,
    });
    await send('Emulation.setCPUThrottlingRate', { rate: preset.cpuRate });
    await send('Network.emulateNetworkConditions', {
      offline: false, latency: preset.latency,
      downloadThroughput: preset.download, uploadThroughput: preset.upload,
    });
    for (let sample = 1; sample <= sampleCount; sample += 1) {
      await send('Page.navigate', { url: target.href });
      try {
        await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('.app-shell')`), 75000);
      } catch (error) {
        const diagnostics = await evaluate(`({ url: location.href, readyState: document.readyState, title: document.title, text: document.body?.innerText?.slice(0, 160) })`).catch(() => null);
        throw new Error(`${preset.name} did not render: ${error.message}; diagnostics=${JSON.stringify(diagnostics)}`);
      }
      await pause(3200);
      const page = await evaluate(inspectPage);
      const raw = await send('Performance.getMetrics');
      const metrics = Object.fromEntries((raw.metrics ?? []).map((entry) => [entry.name, entry.value]));
      const result = {
        preset: preset.name,
        sample,
        network: preset.name === 'mobile' ? 'simulated 100ms latency, 1.6Mbps down' : 'unthrottled',
        cpu: `${preset.cpuRate}x throttling`,
        ...page,
        jsHeapMb: Number(((metrics.JSHeapUsedSize ?? 0) / 1048576).toFixed(1)),
      };
      runs.push(result);
      console.log(`${preset.name} sample ${sample}/${sampleCount}: ${JSON.stringify(result)}`);
      if (sample === sampleCount) {
        // Load axe only after collecting the final performance sample; never skew paint metrics.
        await send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await send('Network.emulateNetworkConditions', {
          offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
        });
        await send('Runtime.evaluate', { expression: axeSource });
        accessibility[preset.name] = await evaluate(`(async () => {
          const audit = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
            iframes: false,
          });
          return {
            passes: audit.passes.length,
            incomplete: audit.incomplete.map(item => ({
              id: item.id,
              nodes: item.nodes.length,
              // Keep every unresolved selector so the full gradient-contrast review is actionable.
              review: item.nodes.map(node => {
                const element = document.querySelector(node.target[0]);
                const style = element ? getComputedStyle(element) : null;
                const backgroundLayers = [];
                for (let ancestor = element; ancestor && backgroundLayers.length < 4; ancestor = ancestor.parentElement) {
                  const layer = getComputedStyle(ancestor);
                  if (layer.backgroundImage !== 'none' ||
                    (layer.backgroundColor !== 'rgba(0, 0, 0, 0)' && layer.backgroundColor !== 'transparent')) {
                    backgroundLayers.push({
                      element: ancestor.tagName.toLowerCase() + (ancestor.classList.length ? '.' + [...ancestor.classList].slice(0, 2).join('.') : ''),
                      color: layer.backgroundColor,
                      image: layer.backgroundImage.slice(0, 240),
                    });
                  }
                }
                return {
                  target: node.target,
                  summary: node.any.concat(node.all, node.none).map(check => check.message).filter(Boolean).slice(0, 2),
                  foreground: style?.color ?? null,
                  fontSize: style?.fontSize ?? null,
                  fontWeight: style?.fontWeight ?? null,
                  backgroundLayers,
                };
              }),
            })),
            violations: audit.violations.map(item => ({
              id: item.id, impact: item.impact, description: item.description,
              nodes: item.nodes.slice(0, 12).map(node => ({
                target: node.target, summary: node.failureSummary?.slice(0, 400) ?? '',
              })),
              totalNodes: item.nodes.length,
            })),
          };
        })()`);
        console.log(`${preset.name} axe audit: ${JSON.stringify(accessibility[preset.name])}`);
        try {
          contrastReview[preset.name] = await reviewGradientContrast(accessibility[preset.name].incomplete);
          console.log(`${preset.name} gradient contrast review: ${JSON.stringify(contrastReview[preset.name].summary)}`);
        } catch (error) {
          contrastReview[preset.name] = { error: String(error), status: 'not-measured' };
          console.warn(`${preset.name} gradient contrast review is incomplete: ${String(error)}`);
        }
      }
    }
  }

  const errors = runs.flatMap((run) => [
    ...(!run.language ? [`${run.preset}: document language missing`] : []),
    ...(!run.mainCount || !run.headingCount ? [`${run.preset}: main/h1 missing`] : []),
    ...(run.pageWidth > run.viewportWidth + 1 ? [`${run.preset}: horizontal overflow ${run.pageWidth}px`] : []),
    ...(run.unnamedControls.length ? [`${run.preset}: ${run.unnamedControls.length} unnamed controls`] : []),
    ...(run.imagesWithoutAlt.length ? [`${run.preset}: ${run.imagesWithoutAlt.length} images without alt`] : []),
  ]);
  for (const [preset, audit] of Object.entries(accessibility)) {
    for (const violation of audit.violations) {
      errors.push(`${preset}: axe ${violation.impact} ${violation.id} (${violation.totalNodes} nodes)`);
    }
  }
  const summary = Object.fromEntries(['desktop', 'mobile'].map((preset) => {
    const selection = runs.filter((run) => run.preset === preset);
    return [preset, {
      samples: selection.length,
      fcpMs: median(selection.map((run) => run.fcpMs)),
      lcpMs: median(selection.map((run) => run.lcpMs)),
      cls: median(selection.map((run) => run.cls)),
      ttfbMs: median(selection.map((run) => run.ttfbMs)),
      domContentLoadedMs: median(selection.map((run) => run.domContentLoadedMs)),
      jsHeapMb: median(selection.map((run) => run.jsHeapMb)),
      matchRows: selection.map((run) => run.matchRows),
    }];
  }));
  const report = {
    kind: 'Chrome lab metrics (not Lighthouse or field Core Web Vitals)',
    at: new Date().toISOString(), base: target.origin, errors, summary, runs, accessibility, contrastReview,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Browser lab report: ${reportPath}`);
  console.log(`Median summary (${sampleCount} runs/preset): ${JSON.stringify(summary)}`);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
} catch (error) {
  const details = error instanceof Error ? error.stack : String(error);
  console.error('Browser lab audit failed:', details);
  await mkdir(path.dirname(reportPath), { recursive: true }).then(() =>
    writeFile(reportPath, JSON.stringify({ kind: 'Chrome lab audit failed', at: new Date().toISOString(), base, error: details }, null, 2) + '\n')
  ).catch(() => {});
  process.exitCode = 1;
} finally {
  socket?.close();
  browser?.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
