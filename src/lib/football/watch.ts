/** Optional official-video adapters. Never expose an upstream API token to browsers. */
import { findAuthorizedYouTubeStream } from "./official-youtube.ts";

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

interface VideoItem { title?: string; embed?: string }
interface VideoMatch {
  date?: string;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  videos?: VideoItem[];
}

export function normalizeTeam(name: string): string {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(fc|cf|afc|sc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
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
export function matchScorebatVideo(entries: VideoMatch[], home: string, away: string, kickoff: string): {
  embedUrl: string; title: string;
} | null {
  const kickoffMs = Date.parse(kickoff);
  if (!Number.isFinite(kickoffMs)) return null;
  for (const entry of entries) {
    const eventMs = Date.parse(entry.date ?? "");
    if (!Number.isFinite(eventMs) || Math.abs(eventMs - kickoffMs) > 90 * 60_000) continue;
    if (normalizeTeam(entry.homeTeam?.name ?? "") !== normalizeTeam(home) ||
        normalizeTeam(entry.awayTeam?.name ?? "") !== normalizeTeam(away)) continue;
    for (const clip of entry.videos ?? []) {
      const embedUrl = scorebatEmbedUrl(clip.embed ?? "");
      if (embedUrl) return { embedUrl, title: clip.title ?? "Phát trực tiếp chính thức" };
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
  header?: { competitions?: Array<{
    date?: string;
    status?: { type?: { state?: string } };
    competitors?: Array<{ homeAway?: string; team?: { displayName?: string } }>;
  }>;
    status?: { type?: { state?: string } };
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
  const matchHeader = (await espn.json() as EspnWatchHeader).header;
  const header = matchHeader?.competitions?.[0];
  const home = header?.competitors?.find((c) => c.homeAway === "home")?.team?.displayName;
  const away = header?.competitors?.find((c) => c.homeAway === "away")?.team?.displayName;
  if (!home || !away || !header?.date) return {
    status: "unavailable", message: "Không xác định được hai đội để đối chiếu với nguồn video chính thức.",
  };

  if (!isScorebatFeedRelevant(header.date, now)) return {
    status: "unavailable",
    message: "Nguồn video trực tiếp chỉ được kiểm tra gần giờ bóng lăn và trong thời gian phát lại gần đây. Hãy xem lịch và diễn biến trận tại SPORTS247.",
  };

  const response = await fetch(
    `https://www.scorebat.com/video-api/v3/live-streams/?token=${encodeURIComponent(token)}`,
    // Shared feed across fixtures. Cache revalidation reduces paid calls; this is
    // not a global billing cap across serverless regions or cold deployments.
    { cache: "force-cache", next: { revalidate: 300 }, signal: AbortSignal.timeout(9500), headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`ScoreBat HTTP ${response.status}`);
  const payload = (await response.json()) as { response?: VideoMatch[] };
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
  const state = header.status?.type?.state ?? matchHeader?.status?.type?.state;
  const broadcastType = state === "in" ? "live" : state === "post" ? "replay" : state === "pre" ? "upcoming" : "unknown";
  return video ? { status: "ready", provider: "ScoreBat", broadcastType, ...video } : {
    status: "unavailable",
    message: "Chưa có luồng phát chính thức được phép nhúng cho trận này. Có thể do bản quyền khu vực hoặc trận chưa bắt đầu.",
  };
}
