import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PRODUCTION_ORIGIN = 'https://sports247-three.vercel.app';

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function summarizeLighthouse(reports, origin = PRODUCTION_ORIGIN) {
  const summaries = {};

  for (const [profile, expectedCount] of [['mobile', 3], ['desktop', 1]]) {
    const matches = reports.filter(({ profile: itemProfile }) => itemProfile === profile);
    assert.equal(matches.length, expectedCount, `Expected ${expectedCount} ${profile} Lighthouse reports`);

    const samples = matches.map(({ report }) => {
      assert.equal(report.configSettings?.formFactor, profile, `Unexpected Lighthouse profile for ${profile}`);
      assert.equal(new URL(report.requestedUrl).origin, origin, 'Unexpected Lighthouse requested origin');
      assert.equal(new URL(report.finalDisplayedUrl).origin, origin, 'Unexpected Lighthouse final origin');

      const values = {
        score: report.categories?.performance?.score,
        lcpMs: report.audits?.['largest-contentful-paint']?.numericValue,
        tbtMs: report.audits?.['total-blocking-time']?.numericValue,
        cls: report.audits?.['cumulative-layout-shift']?.numericValue,
      };

      for (const [name, value] of Object.entries(values)) {
        assert.ok(Number.isFinite(value) && value >= 0, `Missing or invalid ${profile} ${name}`);
      }
      assert.ok(values.score <= 1, 'Performance score must be between 0 and 1');
      return values;
    });

    summaries[profile] = {
      runs: samples.length,
      score: Math.round(median(samples.map((sample) => sample.score)) * 100),
      lcpMs: Math.round(median(samples.map((sample) => sample.lcpMs))),
      tbtMs: Math.round(median(samples.map((sample) => sample.tbtMs))),
      cls: Number(median(samples.map((sample) => sample.cls)).toFixed(3)),
      samples,
    };
  }

  return summaries;
}

export function lighthouseDiagnostics(report) {
  const audits = report.audits ?? {};
  const lcpItems = audits['lcp-breakdown-insight']?.details?.items ?? [];
  const lcpElement = lcpItems.find((item) => item.type === 'node')?.selector ?? null;
  const scriptEvaluationMs = audits['mainthread-work-breakdown']?.details?.items
    ?.find((item) => item.group === 'scriptEvaluation')?.duration;
  const longTasks = audits['long-tasks']?.details?.items ?? [];
  const largestTask = [...longTasks].sort((a, b) => b.duration - a.duration)[0];
  const wastedScripts = audits['unused-javascript']?.details?.items ?? [];
  const wastedJavaScriptBytes = wastedScripts.reduce((total, item) => total + (item.wastedBytes ?? 0), 0);

  return {
    lcpElement,
    scriptEvaluationMs: Number.isFinite(scriptEvaluationMs) ? Math.round(scriptEvaluationMs) : null,
    largestLongTask: largestTask ? {
      durationMs: Math.round(largestTask.duration),
      resource: largestTask.url?.split('/').pop()?.split('?')[0] || '(document)',
    } : null,
    unusedJavaScriptKiB: Math.round(wastedJavaScriptBytes / 1024),
  };
}

async function main() {
  const directory = path.resolve(process.env.SPORTS247_LIGHTHOUSE_REPORT_DIR ?? 'temp/lighthouse-production');
  const reports = [];

  for (const [profile, count] of [['mobile', 3], ['desktop', 1]]) {
    for (let attempt = 1; attempt <= count; attempt += 1) {
      const report = JSON.parse(await readFile(path.join(directory, `${profile}-${attempt}.json`), 'utf8'));
      reports.push({ profile, report });
    }
  }

  const summary = summarizeLighthouse(reports);
  const medianMobileReport = reports.filter((item) => item.profile === 'mobile')
    .sort((a, b) => a.report.audits['largest-contentful-paint'].numericValue -
      b.report.audits['largest-contentful-paint'].numericValue)[1].report;
  const diagnostics = lighthouseDiagnostics(medianMobileReport);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify({
    commitSha: process.env.SPORTS247_EXPECTED_SHA ?? null,
    origin: PRODUCTION_ORIGIN,
    lighthouseVersion: reports[0].report.lighthouseVersion,
    summary,
    medianMobileDiagnostics: diagnostics,
  }, null, 2));

  const lines = [
    '## SPORTS247 production Lighthouse',
    `Commit ${process.env.SPORTS247_EXPECTED_SHA ?? 'unknown'}`,
    '',
    '| Profile | Runs | Performance (median) | LCP (median) | TBT (median) | CLS (median) |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...['mobile', 'desktop'].map((profile) => {
      const item = summary[profile];
      return `| ${profile} | ${item.runs} | ${item.score} | ${item.lcpMs} ms | ${item.tbtMs} ms | ${item.cls} |`;
    }),
    '',
    'Synthetic Lighthouse measurements on GitHub-hosted Chrome. Field Web Vitals require real-user data.',
    '',
    '### Mobile median-LCP sample diagnostics',
    `- LCP element: ${diagnostics.lcpElement ?? 'unavailable'}`,
    `- JavaScript evaluation: ${diagnostics.scriptEvaluationMs ?? 'unavailable'} ms`,
    `- Largest long task: ${diagnostics.largestLongTask ? `${diagnostics.largestLongTask.durationMs} ms (${diagnostics.largestLongTask.resource})` : 'unavailable'}`,
    `- Estimated unused JavaScript: ${diagnostics.unusedJavaScriptKiB} KiB`,
    '',
    'These diagnostics identify investigation targets, not proven causes of LCP or TBT.',
  ];
  console.log(lines.join('\n'));

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  if (summary.mobile.score < 90 || summary.mobile.lcpMs > 2500 || summary.mobile.tbtMs > 200) {
    console.log('::warning::Mobile Lighthouse performance budget is not met. Inspect the uploaded trace and samples.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Lighthouse summary failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
