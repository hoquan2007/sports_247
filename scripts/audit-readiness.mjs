/** Offline deployment preflight. Never calls paid APIs or prints environment secrets. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUES } from '../src/lib/football/leagues.ts';
import { VIETNAM_LEAGUES } from '../src/lib/football/vietnam-leagues.ts';
import { getVietnamFeedConfig } from '../src/lib/football/vietnam.ts';
import { parseLicensedYouTubeStreams } from '../src/lib/football/official-youtube.ts';

const ids = new Set([...LEAGUES, ...VIETNAM_LEAGUES].map((league) => league.id));
const has = (value) => typeof value === 'string' && value.trim().length > 0;
const section = (state, ...actions) => ({ state, actions });

/** A passing preflight proves only configuration shape, never actual broadcast rights. */
export function auditReadiness(env = process.env) {
  const vietnamFields = ['API_FOOTBALL_KEY', 'SPORTS247_VLEAGUE1_ID', 'SPORTS247_VLEAGUE2_ID'];
  const vietnamCount = vietnamFields.filter((name) => has(env[name])).length;
  const vietnam = !vietnamCount
    ? section('disabled', 'Cần API-Football key, ID V.League 1/2 mùa hiện tại và quyền dữ liệu.')
    : getVietnamFeedConfig(env)
      ? section('configured_unverified', 'Đối chiếu ID, điều khoản và ít nhất một vòng đấu thật với VPF.')
      : section('invalid', 'Bộ 3 biến V.League phải đầy đủ, ID khác nhau và cache 90–3600 giây.');

  const budgetFields = ['SCOREBAT_MONTHLY_CREDIT_LIMIT', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const budgetCount = budgetFields.filter((name) => has(env[name])).length;
  let budget = section('disabled', 'Chưa bật giới hạn credits chung.');
  if (budgetCount) {
    let validUrl = false;
    try {
      const url = new URL(env.UPSTASH_REDIS_REST_URL || '');
      validUrl = url.protocol === 'https:' && url.hostname.endsWith('.upstash.io') &&
        url.hostname !== '.upstash.io' && !url.port && !url.username && !url.password &&
        url.pathname === '/' && !url.search && !url.hash;
    } catch { /* Invalid URL. */ }
    budget = budgetCount !== 3 || !/^[1-9]\d{0,7}$/.test(env.SCOREBAT_MONTHLY_CREDIT_LIMIT || '') || !validUrl
      ? section('invalid', 'Cần đủ 3 biến credits/Upstash, hạn mức số nguyên dương và HTTPS Upstash REST URL.')
      : section('configured_unverified', 'Kiểm thử Redis, hạn mức và đối soát billing thực tế của ScoreBat.');
  }

  const scoreToken = has(env.SCOREBAT_API_TOKEN);
  const marketText = env.SCOREBAT_LICENSED_MARKETS || '';
  const marketEntries = marketText.split(',').map((entry) => entry.trim()).filter(Boolean);
  const validMarkets = marketEntries.length > 0 &&
    marketEntries.every((entry) => {
      const parts = entry.split(':');
      return parts.length === 2 && ids.has(parts[0]) && !parts[0].startsWith('vie.') &&
        /^[A-Z]{2}$/.test(parts[1]);
    }) && new Set(marketEntries).size === marketEntries.length;
  let scorebat = !scoreToken && !has(marketText)
    ? section('disabled', 'Cần gói live và chứng cứ cấp quyền theo giải/quốc gia trước khi đặt token.')
    : !scoreToken || !validMarkets
      ? section('invalid', 'Token và danh sách league:COUNTRY phải cùng hợp lệ; không dùng ID V.League cho ScoreBat.')
      : section('configured_unverified', 'Cần xác minh quyền nhúng, khu vực và stream thật tại Việt Nam.');
  if (scoreToken && validMarkets && budget.state === 'disabled') {
    scorebat = section('unmetered', 'ScoreBat đã khai báo nhưng thiếu ngân sách Redis dùng chung; có nguy cơ vượt quota.');
  }
  if (scoreToken && budget.state === 'invalid') {
    scorebat = section('invalid', 'Bộ giới hạn credits sai nên các request trả phí sẽ bị chặn.');
  }

  const rawYouTube = env.OFFICIAL_YOUTUBE_STREAMS?.trim() || '[]';
  let youtube;
  if (rawYouTube === '[]') youtube = section('disabled', 'Chưa có luồng YouTube được ủy quyền theo trận.');
  else {
    try {
      const entries = JSON.parse(rawYouTube);
      const accepted = parseLicensedYouTubeStreams(rawYouTube);
      youtube = Array.isArray(entries) && entries.length > 0 &&
        accepted.length === entries.length && accepted.every((entry) => ids.has(entry.league))
        ? section('configured_unverified', `Đã khai báo ${entries.length} mục; cần xác minh hợp đồng, GeoIP và playback thật.`)
        : section('invalid', 'JSON YouTube chứa mục sai league/event/ID video/quốc gia/giờ hoặc thiếu rightsReference.');
    } catch {
      youtube = section('invalid', 'OFFICIAL_YOUTUBE_STREAMS phải là mảng JSON hợp lệ.');
    }
  }
  return { vietnam, scorebat, budget, youtube };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(['--json', '--require-video', '--require-vietnam']);
  if ([...args].some((arg) => !allowed.has(arg))) {
    console.error('Usage: npm run audit:readiness -- [--json] [--require-video] [--require-vietnam]');
    process.exitCode = 1;
  } else {
    const report = auditReadiness();
    if (args.has('--json')) console.log(JSON.stringify({ event: 'sports247_deployment_readiness', ...report }, null, 2));
    else for (const [name, item] of Object.entries(report)) {
      console.log(`${name}: ${item.state} — ${item.actions.join(' ')}`);
    }
    const invalid = Object.values(report).some((item) => item.state === 'invalid');
    const videoReady = ['scorebat', 'youtube'].some((name) => report[name].state === 'configured_unverified');
    const missingRequired = (args.has('--require-vietnam') && report.vietnam.state !== 'configured_unverified') ||
      (args.has('--require-video') && !videoReady);
    if (invalid) process.exitCode = 1;
    else if (missingRequired) process.exitCode = 2;
  }
}
