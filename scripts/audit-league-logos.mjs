import { LEAGUES } from '../src/lib/football/leagues.ts';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function checkLogo(league) {
  try {
    const response = await fetch(league.logo, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.toLowerCase().includes('image/png')) {
      throw new Error('Content-Type không phải PNG');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
      throw new Error('Đầu tệp PNG không hợp lệ');
    }
    return { league: league.name, ok: true, bytes: bytes.length };
  } catch (error) {
    return { league: league.name, ok: false, error: error.message };
  }
}

const results = await Promise.all(LEAGUES.map(checkLogo));
for (const result of results) {
  console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.league}: ${result.ok ? `${result.bytes} bytes` : result.error}`);
}
const valid = results.filter((result) => result.ok).length;
console.log(`Logo CDN hợp lệ: ${valid}/${results.length}`);
if (valid !== results.length) process.exitCode = 1;
