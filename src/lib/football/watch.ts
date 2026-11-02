/** Optional official-video adapters. Never expose an upstream API token to browsers. */
import { findAuthorizedYouTubeStream } from "./official-youtube.ts";
import { isVietnamLeague } from "./vietnam-leagues.ts";
import { reserveScorebatCredits } from "./scorebat-budget.ts";
import { normalizeEspnStatus } from "./espn-status.ts";

export type WatchResult =
  | { status: "ready"; provider: "ScoreBat" | "YouTube"; embedUrl: string; title: string; broadcastType: "live" | "replay" | "upcoming" | "unknown" }
  | { status: "unavailable" | "unconfigured" | "restricted"; message: string };

/** Playback permission must be explicitly configured for each league and country. */
export function isScorebatPlaybackLicensed(
  league: string,
  viewerCountry: string | null,
  licensedMarkets: string | undefined,
): boolean {
  const country = viewerCountry?.trim().toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) return false;
  return (licensedMarkets ?? "").split(",").some((market) => {
    const parts = market.trim().split(":");
    return parts.length === 2 && parts[0].trim() === league && parts[1].trim().toUpperCase() === country;
  });
}

interface VideoItem { title?: unknown; embed?: unknown }
interface VideoMatch {
  date?: unknown;
  homeTeam?: { name?: unknown };
  awayTeam?: { name?: unknown };
  videos?: unknown;
}

export function normalizeTeam(name: string): string {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    // "SC" distinguishes clubs such as Barcelona SC from FC Barcelona.
    .replace(/\b(fc|cf|afc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  // Narrow, explicit equivalents used by football feeds. Keep ambiguous names
  // distinct (e.g. "Inter" may mean Milan or Miami) to avoid wrong broadcasts.
  const aliases: Record<string, string> = {
    "man utd": "manchester united",
    "man united": "manchester united",
    "man city": "manchester city",
    "psg": "paris saint germain",
    "bayern munchen": "bayern munich",
    "atletico de madrid": "atletico madrid",
  };
  return aliases[normalized] ?? normalized;
}

/** Only permit ScoreBat's own public embed URLs: never render upstream HTML as-is. */
export function scorebatEmbedUrl(embed: string): string | null {
  if (typeof embed !== "string" || embed.length > 10_000) return null;
  const src = embed.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!src) return null;
  try {
    const parsed = new URL(src.replaceAll("&amp;", "&"));
    if (parsed.protocol !== "https:" || parsed.hostname !== "www.scorebat.com" ||
        !/^\/embed\/v\/[a-zA-Z0-9]+\/?$/.test(parsed.pathname) || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch { return null; }
}

/** Require both opponents and kickoff proximity; a wrong live video is worse than no video. */
export function matchScorebatVideo(entries: unknown, home: string, away: string, kickoff: string): {
  embedUrl: string; title: string;
} | null {
  const kickoffMs = Date.parse(kickoff);
  if (!Number.isFinite(kickoffMs) || !Array.isArray(entries)) return null;
  for (const item of entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as VideoMatch;
    const eventMs = Date.parse(typeof entry.date === "string" ? entry.date : "");
    if (!Number.isFinite(eventMs) || Math.abs(eventMs - kickoffMs) > 90 * 60_000) continue;
    const homeName = entry.homeTeam?.name;
    const awayName = entry.awayTeam?.name;
    if (typeof homeName !== "string" || typeof awayName !== "string" ||
        normalizeTeam(homeName) !== normalizeTeam(home) ||
        normalizeTeam(awayName) !== normalizeTeam(away) || !Array.isArray(entry.videos)) continue;
    for (const clip of entry.videos) {
      if (!clip || typeof clip !== "object" || Array.isArray(clip)) continue;
      const item = clip as VideoItem;
      if (typeof item.embed !== "string") continue;
      const embedUrl = scorebatEmbedUrl(item.embed);
      if (embedUrl) return { embedUrl,
        title: typeof item.title === "string" && item.title.trim() ? item.title : "Phát trực tiếp chính thức" };
    }
  }
  return null;
}

/** The provider publishes streams about five minutes before kickoff.
 * Skip paid calls before that window and after the recent replay window.
 */
export function isScorebatFeedRelevant(kickoff: string, now = Date.now()): boolean {
  const matchTime = Date.parse(kickoff);
  return Number.isFinite(matchTime) && Number.isFinite(now) &&
    now >= matchTime - 5 * 60_000 && now <= matchTime + 72 * 60 * 60_000;
}

interface EspnWatchHeader {
  header?: { id?: unknown; competitions?: Array<{
    id?: unknown;
    date?: string;
    status?: { displayClock?: string; type?: { name?: string; state?: string; shortDetail?: string } };
    competitors?: Array<{ homeAway?: string; team?: { id?: unknown; displayName?: string } }>;
  }>;
    status?: { displayClock?: string; type?: { name?: string; state?: string; shortDetail?: string } };
  };
}

export async function getMatchWatch(league: string, event: string, viewerCountry: string | null = null,
  now = Date.now()): Promise<WatchResult> {
  // A curated, explicitly licensed YouTube stream can work without a paid ScoreBat token.
  // The event ID, viewing country, broadcast window and rights reference are required.
  const officialYouTube = findAuthorizedYouTubeStream(
    process.env.OFFICIAL_YOUTUBE_STREAMS, league, event, viewerCountry, now,
  );
  if (officialYouTube) return { status: "ready", ...officialYouTube };

  // API-Football fixture IDs are separate from ESPN event IDs. V.League can use
  // an individually authorized YouTube stream, but must never be looked up as an
  // ESPN match or charged against a ScoreBat feed by accident.
  if (isVietnamLeague(league)) return {
    status: "unavailable",
    message: "Chưa có nguồn phát chính thức được cấp quyền nhúng cho trận V.League này. Xem kênh phát và lịch từ VPF hoặc thử lại gần giờ thi đấu.",
  };

  const token = process.env.SCOREBAT_API_TOKEN?.trim();
  if (!token) return {
    status: "unconfigured",
    message: "Chưa kết nối nhà cung cấp video có bản quyền. SPORTS247 hiện hỗ trợ theo dõi tỷ số và diễn biến trận đấu.",
  };

  if (!isScorebatPlaybackLicensed(league, viewerCountry, process.env.SCOREBAT_LICENSED_MARKETS)) {
    return {
      status: "restricted",
      message: "Chưa xác minh quyền nhúng video cho giải đấu hoặc quốc gia truy cập này. Bạn vẫn có thể theo dõi tỷ số và diễn biến trận đấu.",
    };
  }

  const espn = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(league)}/summary?event=${encodeURIComponent(event)}`,
    { next: { revalidate: 90 }, signal: AbortSignal.timeout(9500) },
  );
  if (!espn.ok) throw new Error("ESPN watch lookup failed");
  const summary: unknown = await espn.json();
  const matchHeader = summary && typeof summary === "object" && !Array.isArray(summary)
    ? (summary as EspnWatchHeader).header : undefined;
  // A single event must resolve to exactly one contest. Choosing the first
  // item in a malformed multi-competition summary could serve another match.
  const header = Array.isArray(matchHeader?.competitions) && matchHeader.competitions.length === 1
    ? matchHeader.competitions[0] : undefined;
  const competitors = Array.isArray(header?.competitors) ? header.competitors : [];
  // The summary is an external payload. Reject partial or inconsistent fixtures
  // before using team names to select a paid live broadcast.
  const homeTeams = competitors.filter((c) => c && c.homeAway === "home");
  const awayTeams = competitors.filter((c) => c && c.homeAway === "away");
  const home = homeTeams[0]?.team?.displayName;
  const away = awayTeams[0]?.team?.displayName;
  const homeId = homeTeams[0]?.team?.id;
  const awayId = awayTeams[0]?.team?.id;
  if (competitors.length !== 2 || homeTeams.length !== 1 || awayTeams.length !== 1 ||
      typeof home !== "string" || !home.trim() ||
      typeof away !== "string" || !away.trim() ||
      home.trim().toLowerCase() === away.trim().toLowerCase() ||
      (homeId != null && awayId != null && String(homeId).trim() === String(awayId).trim()) ||
      typeof header?.date !== "string" || !Number.isFinite(Date.parse(header.date)) ||
      (matchHeader?.id != null && String(matchHeader.id) !== event) ||
      (header.id != null && String(header.id) !== event)) return {
    status: "unavailable", message: "Không xác định được hai đội để đối chiếu với nguồn video chính thức.",
  };

  const espnStatus = header.status ?? matchHeader?.status;
  const matchStatus = normalizeEspnStatus(espnStatus).status;
  if (matchStatus === "postponed" || matchStatus === "cancelled" || matchStatus === "interrupted") return {
    status: "unavailable",
    message: matchStatus === "postponed" ? "Trận đấu đã bị hoãn; chưa có nguồn phát trực tiếp cho lịch cũ."
      : matchStatus === "cancelled" ? "Trận đấu đã bị hủy; không có nguồn phát trực tiếp."
        : "Trận đấu đang gián đoạn; nguồn phát sẽ được kiểm tra lại khi trận tiếp tục.",
  };

  if (!isScorebatFeedRelevant(header.date, now)) return {
    status: "unavailable",
    message: "Nguồn video trực tiếp chỉ được kiểm tra gần giờ bóng lăn và trong thời gian phát lại gần đây. Hãy xem lịch và diễn biến trận tại SPORTS247.",
  };

  const feedCredits = await reserveScorebatCredits(5, now);
  if (feedCredits.status === "exhausted" || feedCredits.status === "unavailable") return {
    status: "unavailable",
    message: feedCredits.status === "exhausted"
      ? "Ngân sách truy vấn nguồn video tháng này đã hết. Bạn vẫn có thể xem tỷ số và diễn biến."
      : "Chưa thể kiểm tra ngân sách nguồn video. Vui lòng thử lại sau.",
  };

  const response = await fetch(
    `https://www.scorebat.com/video-api/v3/live-streams/?token=${encodeURIComponent(token)}`,
    // Shared feed across fixtures. Cache revalidation reduces paid calls; this is
    // not a global billing cap across serverless regions or cold deployments.
    { cache: "force-cache", next: { revalidate: 300 }, signal: AbortSignal.timeout(9500), headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`ScoreBat HTTP ${response.status}`);
  const payload = (await response.json()) as { response?: unknown };
  if (!Array.isArray(payload.response)) throw new Error("Invalid ScoreBat response");

  const video = matchScorebatVideo(payload.response, home, away, header.date);
  // Provider embeds are public by design, but the server API credential must remain private.
  // Inspect the entire public URL and title, including percent-encoded text and fragments.
  // Checking only query values misses a credential in a parameter name or hash fragment.
  const leaksCredential = (text: string): boolean => {
    let value = text;
    for (let pass = 0; pass < 2; pass++) {
      if (value.includes(token)) return true;
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch { break; }
    }
    return value.includes(token);
  };
  if (video && (leaksCredential(video.embedUrl) || leaksCredential(video.title))) {
    return {
      status: "unavailable",
      message: "Nguồn video chưa có đường dẫn nhúng an toàn. Vui lòng liên hệ đơn vị cung cấp phát sóng.",
    };
  }
  // Reserve the provider's per-view credit before handing an iframe to the
  // browser. Actual viewing/billing is external and must be reconciled.
  if (video) {
    const viewCredits = await reserveScorebatCredits(1, now);
    if (viewCredits.status === "exhausted" || viewCredits.status === "unavailable") return {
      status: "unavailable",
      message: viewCredits.status === "exhausted"
        ? "Ngân sách xem video tháng này đã hết. Bạn vẫn có thể theo dõi diễn biến trận."
        : "Chưa thể kiểm tra ngân sách xem video. Vui lòng thử lại sau.",
    };
  }
  const broadcastType = !espnStatus?.type?.state && !espnStatus?.type?.name ? "unknown"
    : matchStatus === "live" ? "live" : matchStatus === "finished" ? "replay" : "upcoming";
  return video ? { status: "ready", provider: "ScoreBat", broadcastType, ...video } : {
    status: "unavailable",
    message: "Chưa có luồng phát chính thức được phép nhúng cho trận này. Có thể do bản quyền khu vực hoặc trận chưa bắt đầu.",
  };
}
