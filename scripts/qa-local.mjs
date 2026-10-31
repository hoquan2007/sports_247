/** Boot the built Next.js server and verify routes in one reproducible command. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const nextBin = resolve(root, 'node_modules/next/dist/bin/next');
const buildId = resolve(root, '.next/BUILD_ID');
const port = Number(process.env.SPORTS247_QA_PORT ?? 34131);
const runBrowser = process.argv.includes('--browser');
const dataArg = process.argv.indexOf('--data');
const requestedDate = dataArg === -1 ? undefined : process.argv[dataArg + 1];
const dataDate = requestedDate?.startsWith('--') ? undefined : requestedDate;

if (!existsSync(nextBin) || !existsSync(buildId)) {
  console.error('QA requires an installed Next.js package and a successful npm run build.');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('SPORTS247_QA_PORT must be between 1024 and 65535.');
  process.exit(1);
}

const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [nextBin, 'start', '--port', String(port), '--hostname', '127.0.0.1'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let started = false;
let finished = false;
let output = '';
let resolveReady;
let rejectReady;
const ready = new Promise((resolveReadyFn, rejectReadyFn) => {
  resolveReady = resolveReadyFn;
  rejectReady = rejectReadyFn;
});
const timer = setTimeout(() => rejectReady(new Error('Next.js did not become ready within 45 seconds')), 45000);

function capture(chunk) {
  const line = chunk.toString();
  output += line;
  process.stdout.write(line);
  if (!started && /\bReady in\b/i.test(output)) {
    started = true;
    clearTimeout(timer);
    resolveReady();
  }
  if (output.length > 10000) output = output.slice(-2000);
}

server.stdout.on('data', capture);
server.stderr.on('data', capture);
server.on('error', (error) => { clearTimeout(timer); rejectReady(error); });
server.on('exit', (code) => {
  if (!finished && !started) { clearTimeout(timer); rejectReady(new Error(`Next.js exited before ready: ${code}`)); }
});

function run(script, label, args = []) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [resolve(root, script), ...args], {
      cwd: root,
      env: { ...process.env, SPORTS247_BASE_URL: base },
      windowsHide: true,
      stdio: 'inherit',
    });
    child.on('error', rejectResult);
    child.on('exit', (code, signal) => {
      if (code === 0) resolveResult();
      else rejectResult(new Error(`${label} exited with ${signal ?? code}`));
    });
  });
}

try {
  await ready;
  await run('scripts/smoke-http.mjs', 'HTTP smoke');
  if (dataArg !== -1) await run('scripts/audit-data-coverage.mjs', 'Data coverage audit', dataDate ? [dataDate] : []);
  if (runBrowser) await run('scripts/qa-browser.mjs', 'Browser QA');
  console.log(`SPORTS247 local QA passed at ${base}`);
} catch (error) {
  console.error('SPORTS247 local QA failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  finished = true;
  clearTimeout(timer);
  server.kill();
}
