import { LEAGUES } from '../src/lib/football/leagues.ts';
import { VIETNAM_LEAGUES } from '../src/lib/football/vietnam-leagues.ts';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const JPEG_SIGNATURE = [255, 216, 255];
const COMPETITIONS = [...LEAGUES, ...VIETNAM_LEAGUES];

async function checkLogo(league) {
  try {
    const response = await fetch(league.logo, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const mime = response.headers.get('content-type')?.toLowerCase() ?? '';
    const jpeg = new URL(league.logo).pathname.toLowerCase().endsWith('.jpg');
    if (!mime.includes(jpeg ? 'image/jpeg' : 'image/png')) throw new Error(`Sai Content-Type: ${mime}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = jpeg ? JPEG_SIGNATURE : PNG_SIGNATURE;
    if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error('Chữ ký ảnh không hợp lệ');
    return { league: league.name, ok: true, bytes: bytes.length };
  } catch (error) {
    return { league: league.name, ok: false, error: error.message };
  }
}

const results = await Promise.all(COMPETITIONS.map(checkLogo));
for (const result of results) {
  console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.league}: ${result.ok ? `${result.bytes} bytes` : result.error}`);
}
const valid = results.filter((result) => result.ok).length;
console.log(`Logo CDN hợp lệ: ${valid}/${results.length} (bao gồm 2 logo VPF)`);
if (valid !== results.length) process.exitCode = 1;
