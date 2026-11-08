import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeLighthouse } from '../scripts/summarize-lighthouse.mjs';

function fixture(profile, score, lcpMs, tbtMs, cls = 0) {
  return {
    profile,
    report: {
      requestedUrl: 'https://sports247-three.vercel.app/',
      finalDisplayedUrl: 'https://sports247-three.vercel.app/?date=2026-11-08',
      configSettings: { formFactor: profile },
      categories: { performance: { score } },
      audits: {
        'largest-contentful-paint': { numericValue: lcpMs },
        'total-blocking-time': { numericValue: tbtMs },
        'cumulative-layout-shift': { numericValue: cls },
      },
    },
  };
}

test('summarizes mobile medians and desktop separately', () => {
  const summary = summarizeLighthouse([
    fixture('mobile', 0.68, 3700, 700),
    fixture('mobile', 0.82, 2800, 380),
    fixture('mobile', 0.71, 3500, 650),
    fixture('desktop', 0.97, 750, 40),
  ]);
  assert.deepEqual([summary.mobile.score, summary.mobile.lcpMs, summary.mobile.tbtMs, summary.mobile.runs], [71, 3500, 650, 3]);
  assert.deepEqual([summary.desktop.score, summary.desktop.lcpMs, summary.desktop.runs], [97, 750, 1]);
});

test('rejects incomplete or cross-origin Lighthouse evidence', () => {
  const records = [fixture('mobile', 0.8, 2900, 320), fixture('mobile', 0.8, 2900, 320), fixture('mobile', 0.8, 2900, 320), fixture('desktop', 0.9, 800, 40)];
  assert.throws(() => summarizeLighthouse(records.slice(1)), /Expected 3 mobile/);
  records[0].report.finalDisplayedUrl = 'https://example.org/login';
  assert.throws(() => summarizeLighthouse(records), /Unexpected Lighthouse final origin/);
  records[0].report.finalDisplayedUrl = 'https://sports247-three.vercel.app/';
  records[0].report.audits['total-blocking-time'].numericValue = NaN;
  assert.throws(() => summarizeLighthouse(records), /Missing or invalid mobile tbtMs/);
});
