/** Optional API-Football feed for the two professional Vietnamese divisions.
 * The operator must verify league IDs for the season and permission to display
 * the data/assets before enabling this source on a public deployment.
 */
import { vietnamDate } from "./leagues.ts";
import { VIETNAM_LEAGUES, type VietnamLeagueId } from "./vietnam-leagues.ts";
import type { FootballMatch, FootballTeam, MatchStatus } from "./types.ts";

export interface VietnamFeedConfig {
  apiKey: string;
  ids: Record<VietnamLeagueId, number>;
  cacheSeconds: number;
}

/** Avoid guessing numeric league IDs: these are assigned by the provider. */
export function getVietnamFeedConfig(env: NodeJS.ProcessEnv = process.env): VietnamFeedConfig | null {
  const apiKey = env.API_FOOTBALL_KEY?.trim();
  const first = env.SPORTS247_VLEAGUE1_ID;
  const second = env.SPORTS247_VLEAGUE2_ID;
  const rawCacheSeconds = env.SPORTS247_VIETNAM_CACHE_SECONDS ?? "3600";
  if (!apiKey || !first || !second || !/^\d{1,7}$/.test(first) || !/^\d{1,7}$/.test(second)) return null;
  if (!/^\d{2,4}$/.test(rawCacheSeconds)) return null;
  const id1 = Number(first), id2 = Number(second);
  const cacheSeconds = Number(rawCacheSeconds);
  if (!id1 || !id2 || id1 === id2) return null;
  if (cacheSeconds < 90 || cacheSeconds > 3600) return null;
  return { apiKey, ids: { "vie.1": id1, "vie.2": id2 }, cacheSeconds };
}

interface ApiFixture {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string; long?: string; elapsed?: number | null };
    venue?: { name?: string | null };
  };
  league?: { id?: number; name?: string; country?: string };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  goals?: { home?: number | null; away?: number | null };
}

const FINISHED = new Set(["FT", "AET", "PEN"]);
const ADMINISTRATIVE = new Set(["AWD", "WO"]);
const PLAYING = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE"]);
const INTERRUPTED = new Set(["INT", "SUSP", "ABD"]);
const SCHEDULED = new Set(["NS", "TBD"]);
const POSTPONED = new Set(["PST"]);
const CANCELLED = new Set(["CANC"]);
const KNOWN_STATUSES = new Set([
  ...FINISHED, ...ADMINISTRATIVE, ...PLAYING, ...INTERRUPTED,
  ...SCHEDULED, ...POSTPONED, ...CANCELLED,
]);

function teamFromApiSports(team: NonNullable<NonNullable<ApiFixture["teams"]>["home"]>): FootballTeam {
  const logo = team.logo;
  let safeLogo: string | null = null;
  if (logo) {
    try {
      const url = new URL(logo);
      if (url.protocol === "https:" && url.hostname === "media.api-sports.io" &&
          /^\/football\/teams\/\d+\.png$/.test(url.pathname) && !url.search && !url.hash)
        safeLogo = url.href;
    } catch { /* Invalid media source; show initials. */ }
  }
  return { id: String(team.id), name: team.name!.trim(), shortName: team.name!.trim(), logo: safeLogo };
}

/** Exported for provider-contract tests; malformed and cross-league records are discarded. */
export function mapVietnamFixture(entry: ApiFixture, leagueId: VietnamLeagueId,
  expectedLeagueId: number, date: string): FootballMatch | null {
  const league = VIETNAM_LEAGUES.find((item) => item.id === leagueId)!;
  const fixture = entry.fixture;
  const home = entry.teams?.home, away = entry.teams?.away;
  const expectedName = leagueId === "vie.1" ? "1" : "2";
  if (!Number.isSafeInteger(fixture?.id) || (fixture?.id ?? 0) <= 0 ||
      entry.league?.id !== expectedLeagueId || !/^Vietnam$/i.test(entry.league?.country?.trim() ?? "") ||
      !entry.league?.name || !new RegExp(`^V[.\\s-]*League\\s*${expectedName}$`, "i").test(entry.league.name.trim()) ||
      !fixture?.date || Number.isNaN(Date.parse(fixture.date)) || vietnamDate(fixture.date) !== date ||
      !Number.isSafeInteger(home?.id) || (home?.id ?? 0) <= 0 ||
      !Number.isSafeInteger(away?.id) || (away?.id ?? 0) <= 0 || home?.id === away?.id ||
      !home?.name?.trim() || !away?.name?.trim()) return null;

  const short = fixture.status?.short;
  // Unknown or missing provider states must be reported as partial data,
  // rather than silently presented as a fixture that has not started.
  if (!short || !KNOWN_STATUSES.has(short)) return null;
  const status: MatchStatus = FINISHED.has(short) ? "finished" : ADMINISTRATIVE.has(short) ? "awarded" : PLAYING.has(short) ? "live"
    : POSTPONED.has(short) ? "postponed" : CANCELLED.has(short) ? "cancelled"
    : INTERRUPTED.has(short) ? "interrupted" : "scheduled";
  const goal = (value: number | null | undefined) => typeof value === "number" &&
    Number.isInteger(value) && value >= 0 ? value : null;
  const elapsed = fixture.status?.elapsed;
  return {
    id: `${leagueId}:${fixture.id}`, eventId: String(fixture.id),
    leagueId, leagueName: league.name, leagueCountry: league.country,
    startTime: new Date(fixture.date).toISOString(), status,
    statusDetail: status === "live" ? typeof elapsed === "number" && elapsed >= 0 ? `${elapsed}'` : "LIVE"
      : status === "postponed" ? "Hoãn" : status === "cancelled" ? "Hủy"
      : status === "interrupted" ? "Gián đoạn"
      : status === "awarded" ? short === "WO" ? "Bỏ cuộc" : "Xử thắng"
      : fixture.status?.long?.trim() || (status === "finished" ? "FT" : "Sắp diễn ra"),
    home: teamFromApiSports(home), away: teamFromApiSports(away),
    // Provider-awarded scores are official results, not evidence of goals scored on the pitch.
    homeScore: ["live", "finished", "interrupted", "awarded"].includes(status) ? goal(entry.goals?.home) : null,
    awayScore: ["live", "finished", "interrupted", "awarded"].includes(status) ? goal(entry.goals?.away) : null,
    venue: fixture.venue?.name?.trim() || null,
    broadcasters: [], matchUrl: league.officialUrl,
    source: "API-Football",
  };
}

/** One-hour cache by default protects free API quota; shorter windows require an appropriate plan. */
export async function getVietnamMatches(date: string, config: VietnamFeedConfig): Promise<{
  matches: FootballMatch[]; errors: string[]; failedLeagues: VietnamLeagueId[];
}> {
  const season = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
  const outcomes = await Promise.allSettled(VIETNAM_LEAGUES.map(async (league) => {
    const id = config.ids[league.id];
    const params = new URLSearchParams({ league: String(id), season: String(season), date,
      timezone: "Asia/Ho_Chi_Minh" });
    const response = await fetch(`https://v3.football.api-sports.io/fixtures?${params}`, {
      headers: { "x-apisports-key": config.apiKey, Accept: "application/json" },
      cache: "force-cache", next: { revalidate: config.cacheSeconds }, signal: AbortSignal.timeout(9500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { errors?: unknown; response?: unknown } | null;
    if (!payload || !Array.isArray(payload.response) || (Array.isArray(payload.errors) && payload.errors.length) ||
        (payload.errors && !Array.isArray(payload.errors) && Object.keys(payload.errors).length)) {
      throw new Error("Invalid API-Football response");
    }
    const matches: FootballMatch[] = [];
    const seen = new Set<string>();
    let incomplete = false;
    for (const entry of payload.response) {
      let mapped: FootballMatch | null = null;
      try {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          mapped = mapVietnamFixture(entry as ApiFixture, league.id, id, date);
        }
      } catch { /* A malformed nested provider field must not hide valid fixtures. */ }
      if (!mapped || seen.has(mapped.id)) {
        incomplete = true;
        continue;
      }
      seen.add(mapped.id);
      matches.push(mapped);
    }
    // Retain verified matches, but report any discarded/duplicate record as a
    // partial provider failure so the UI never suggests a complete matchday.
    return { matches, incomplete };
  }));
  return {
    matches: outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? outcome.value.matches : []),
    errors: outcomes.flatMap((outcome, i) => outcome.status === "rejected"
      ? [`${VIETNAM_LEAGUES[i].name}: API-Football không thể tải dữ liệu`]
      : outcome.value.incomplete ? [`${VIETNAM_LEAGUES[i].name}: API-Football trả về dữ liệu chưa đầy đủ`] : []),
    failedLeagues: outcomes.flatMap((outcome, i) => outcome.status === "rejected" || outcome.value.incomplete
      ? [VIETNAM_LEAGUES[i].id] : []),
  };
}
