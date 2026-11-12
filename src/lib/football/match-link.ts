import { LEAGUES } from "./leagues.ts";
import type { FootballMatch } from "./types.ts";

const supportedLeagues = new Set(LEAGUES.map((league) => league.id));

export function validEspnMatchId(leagueId: string, eventId: string): boolean {
  return supportedLeagues.has(leagueId) && /^\d{6,12}$/.test(eventId);
}

export function matchPermalink(match: Pick<FootballMatch, "leagueId" | "eventId" | "source">): string | null {
  return match.source === "ESPN" && validEspnMatchId(match.leagueId, match.eventId)
    ? `/match/${match.leagueId}/${match.eventId}`
    : null;
}
