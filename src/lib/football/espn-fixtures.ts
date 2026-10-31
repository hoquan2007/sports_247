import { parseRecentForm } from "./recent-form.ts";
import { normalizeEspnStatus } from "./espn-status.ts";
import type { League } from "./leagues.ts";
import type { FootballMatch, FootballTeam, MatchStatus } from "./types.ts";

/** Treat external ESPN JSON as unknown until each field is validated. */
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function teamFromEspn(competitor: Record<string, unknown>): FootballTeam {
  const team = record(competitor.team) ?? {};
  const name = text(team.displayName) ?? "Chưa xác định";
  const form = parseRecentForm(typeof competitor.form === "string" ? competitor.form : undefined);
  const logo = text(team.logo);
  return {
    id: text(team.id) ?? text(competitor.id) ?? "unknown",
    name,
    shortName: text(team.shortDisplayName) ?? text(team.displayName) ?? "TBD",
    logo: logo?.startsWith("https://a.espncdn.com/") ? logo : null,
    ...(form.length ? { form } : {}),
  };
}

function score(value: unknown, status: MatchStatus): number | null {
  if (["scheduled", "postponed", "cancelled"].includes(status) || value == null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function mapEvent(value: unknown, league: League): { match: FootballMatch; incomplete: boolean } | null {
  const event = record(value);
  if (!event || !text(event.id) || !/^\d+$/.test(text(event.id)!) ||
      !text(event.date) || Number.isNaN(Date.parse(text(event.date)!))) return null;
  // Each ESPN soccer fixture is one competition with exactly two opposing
  // teams. Selecting the first home/away entry could silently display a wrong
  // score if the upstream payload contains duplicated or extra competitors.
  if (!Array.isArray(event.competitions) || event.competitions.length !== 1) return null;
  const competition = record(event.competitions[0]);
  if (!competition || !Array.isArray(competition.competitors) || competition.competitors.length !== 2) return null;
  const competitors = competition.competitors.map(record);
  if (competitors.some((c) => !c)) return null;
  const home = competitors.find((c) => c?.homeAway === "home");
  const away = competitors.find((c) => c?.homeAway === "away");
  if (!home || !away || home === away) return null;
  // A fixture without recognizable teams cannot safely be matched with
  // watch providers, league results or another day's snapshot.
  const validTeam = (c: Record<string, unknown>) => {
    const team = record(c.team);
    return team && text(team.id) && text(team.displayName);
  };
  if (!validTeam(home) || !validTeam(away) ||
      text(record(home.team)?.id) === text(record(away.team)?.id)) return null;

  const rawStatus = record(event.status);
  const rawType = record(rawStatus?.type);
  const { status, detail } = normalizeEspnStatus({
    displayClock: text(rawStatus?.displayClock) ?? undefined,
    type: {
      name: text(rawType?.name) ?? undefined,
      state: text(rawType?.state) ?? undefined,
      shortDetail: text(rawType?.shortDetail) ?? undefined,
    },
  });

  let incomplete = (event.status !== undefined && !rawStatus) ||
    (rawStatus?.type !== undefined && !rawType);
  const broadcasters: string[] = [];
  if (competition.broadcasts !== undefined) {
    if (!Array.isArray(competition.broadcasts)) incomplete = true;
    else for (const broadcast of competition.broadcasts) {
      const item = record(broadcast);
      if (!item || !Array.isArray(item.names)) { incomplete = true; continue; }
      for (const name of item.names) {
        if (text(name)) broadcasters.push(text(name)!);
        else incomplete = true;
      }
    }
  }
  const hasBadScore = (value: unknown) => value != null && value !== "" &&
    (typeof value !== "string" && typeof value !== "number" ||
      !Number.isSafeInteger(Number(value)) || Number(value) < 0);
  if (hasBadScore(home.score) || hasBadScore(away.score)) incomplete = true;
  if (competition.venue !== undefined && !record(competition.venue)) incomplete = true;
  const venue = record(competition.venue);
  const eventId = text(event.id)!;
  return {
    match: {
      id: `${league.id}:${eventId}`, eventId, leagueId: league.id,
      leagueName: league.name, leagueCountry: league.country,
      startTime: text(event.date)!, status, statusDetail: detail,
      home: teamFromEspn(home), away: teamFromEspn(away),
      homeScore: score(home.score, status), awayScore: score(away.score, status),
      venue: text(venue?.fullName), broadcasters: [...new Set(broadcasters)],
      matchUrl: `https://www.espn.com/soccer/match/_/gameId/${eventId}`,
      source: "ESPN",
    },
    incomplete,
  };
}

/** Retain valid fixtures while reporting corruption and duplicates as partial coverage. */
export function parseEspnScoreboard(payload: unknown, league: League): {
  matches: FootballMatch[]; incomplete: boolean;
} {
  const data = record(payload);
  if (!data || !Array.isArray(data.events)) throw new Error(`ESPN ${league.id}: JSON không hợp lệ`);
  const matches: FootballMatch[] = [];
  const seen = new Set<string>();
  let incomplete = false;
  for (const entry of data.events) {
    let mapped: ReturnType<typeof mapEvent> = null;
    try { mapped = mapEvent(entry, league); }
    catch { /* One malformed event must not discard its valid siblings. */ }
    if (!mapped || seen.has(mapped.match.id)) { incomplete = true; continue; }
    seen.add(mapped.match.id);
    matches.push(mapped.match);
    if (mapped.incomplete) incomplete = true;
  }
  return { matches, incomplete };
}
