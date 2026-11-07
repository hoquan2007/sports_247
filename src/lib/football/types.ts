import type { FormOutcome } from "./recent-form";

export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "interrupted" | "awarded";

export interface FootballTeam {
  id: string;
  name: string;
  shortName: string;
  logo: string | null;
  form?: FormOutcome[];
}

export interface FootballMatch {
  id: string;
  eventId: string;
  leagueId: string;
  leagueName: string;
  leagueCountry: string;
  startTime: string;
  status: MatchStatus;
  statusDetail: string;
  home: FootballTeam;
  away: FootballTeam;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  broadcasters: string[];
  matchUrl: string | null;
  source: "ESPN" | "OpenLigaDB" | "API-Football";
}

export interface MatchFeed {
  date: string;
  matches: FootballMatch[];
  updatedAt: string;
  sources: string[];
  partial: boolean;
  errors: string[];
  /** Competitions without configured data, distinct from a match-free day. */
  pendingLeagues?: string[];
  /** Provider errors affecting a configured league, separate from missing credentials. */
  failedLeagues?: string[];
}
