import { parseEspnScoreboard } from "./espn-fixtures.ts";
import { LEAGUES } from "./leagues.ts";
import { parseEspnMatchDetails, type MatchDetails } from "./match-details.ts";
import { validEspnMatchId } from "./match-link.ts";
import type { FootballMatch } from "./types.ts";

type JsonObject = Record<string, unknown>;
const record = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as JsonObject : null;

export interface MatchPageData {
  match: FootballMatch;
  details: MatchDetails;
}

/** Recover the verified fixture from ESPN's own event summary for bookmarkable URLs. */
export function parseEspnMatchPage(payload: unknown, leagueId: string, eventId: string): MatchPageData | null {
  if (!validEspnMatchId(leagueId, eventId)) return null;
  const league = LEAGUES.find((item) => item.id === leagueId)!;
  const header = record(record(payload)?.header);
  const competitions = header?.competitions;
  if (!Array.isArray(competitions) || competitions.length !== 1) {
    throw new Error("ESPN summary thiếu thông tin trận đấu");
  }
  const competition = record(competitions[0]);
  if (!competition) throw new Error("ESPN summary có cấu trúc trận đấu không hợp lệ");
  // Both upstream identifiers must agree when present. A valid competition ID
  // cannot override a contradictory header identifying another fixture.
  if ((competition.id != null && String(competition.id) !== eventId) ||
      (header?.id != null && String(header.id) !== eventId) ||
      (competition.id == null && header?.id == null)) return null;
  const date = competition.date ?? header?.date;
  const { matches } = parseEspnScoreboard({ events: [{
    id: eventId, date, status: competition.status ?? header?.status, competitions: [competition],
  }] }, league);
  if (matches.length !== 1) throw new Error("ESPN summary thiếu đội bóng hoặc thời gian hợp lệ");
  const details = parseEspnMatchDetails(payload);
  if (details.homeId !== matches[0].home.id || details.awayId !== matches[0].away.id) {
    throw new Error("ESPN summary không khớp đội bóng của trận");
  }
  return { match: matches[0], details };
}

export async function getEspnMatchPage(leagueId: string, eventId: string): Promise<MatchPageData | null> {
  if (!validEspnMatchId(leagueId, eventId)) return null;
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/summary?event=${eventId}`,
    { next: { revalidate: 60 }, signal: AbortSignal.timeout(9500), headers: { Accept: "application/json" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ESPN summary HTTP ${response.status}`);
  return parseEspnMatchPage(await response.json() as unknown, leagueId, eventId);
}
