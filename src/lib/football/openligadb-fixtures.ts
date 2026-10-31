import { vietnamDate } from "./leagues.ts";
import type { FootballMatch, FootballTeam } from "./types.ts";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function name(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function team(value: unknown): FootballTeam | null {
  const entry = object(value);
  if (!entry || !Number.isSafeInteger(entry.teamId) || Number(entry.teamId) <= 0 || !name(entry.teamName)) return null;
  const logo = name(entry.teamIconUrl);
  return {
    id: String(entry.teamId), name: name(entry.teamName)!,
    shortName: name(entry.shortName) ?? name(entry.teamName)!,
    logo: logo?.startsWith("https://") ? logo : null,
  };
}

function goal(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** OpenLigaDB returns a whole season. Only malformed records on the requested
 * Vietnam calendar date should make that day's fixtures incomplete. */
export function parseOpenLigaSeason(payload: unknown, date: string): {
  matches: FootballMatch[]; incomplete: boolean;
} {
  if (!Array.isArray(payload)) throw new Error("OpenLigaDB JSON không hợp lệ");
  const matches: FootballMatch[] = [];
  const seen = new Set<number>();
  let incomplete = false;
  for (const value of payload) {
    const entry = object(value);
    if (!entry || !name(entry.matchDateTimeUTC)) { incomplete = true; continue; }
    const rawTime = name(entry.matchDateTimeUTC)!;
    const time = /(?:Z|[+-]\d{2}:\d{2})$/i.test(rawTime) ? rawTime : `${rawTime}Z`;
    if (Number.isNaN(Date.parse(time))) { incomplete = true; continue; }
    if (vietnamDate(time) !== date) continue;

    const home = team(entry.team1), away = team(entry.team2);
    const id = entry.matchID;
    if (!Number.isSafeInteger(id) || Number(id) <= 0 || !home || !away || home.id === away.id ||
        typeof entry.matchIsFinished !== "boolean" || seen.has(id as number)) {
      incomplete = true;
      continue;
    }
    seen.add(id as number);
    const results = Array.isArray(entry.matchResults) ? entry.matchResults : [];
    if (entry.matchResults !== undefined && !Array.isArray(entry.matchResults)) incomplete = true;
    const validResults = results.map(object).filter((row): row is Record<string, unknown> => row !== null);
    if (validResults.length !== results.length) incomplete = true;
    const final = validResults.find((r) => r.resultOrderID === 2) ?? validResults.at(-1);
    const homeScore = goal(final?.pointsTeam1), awayScore = goal(final?.pointsTeam2);
    if (entry.matchIsFinished && (homeScore === null || awayScore === null)) incomplete = true;
    if (entry.location !== undefined && !object(entry.location)) incomplete = true;
    const location = object(entry.location);
    matches.push({
      id: `openligadb:${id}`, eventId: String(id), leagueId: "ger.1",
      leagueName: "Bundesliga", leagueCountry: "Đức", startTime: time,
      status: entry.matchIsFinished ? "finished" : "scheduled",
      statusDetail: entry.matchIsFinished ? "FT" : "Sắp diễn ra",
      home, away,
      homeScore: entry.matchIsFinished ? homeScore : null,
      awayScore: entry.matchIsFinished ? awayScore : null,
      venue: name(location?.locationStadium), broadcasters: [],
      matchUrl: null, source: "OpenLigaDB",
    });
  }
  return { matches, incomplete };
}
