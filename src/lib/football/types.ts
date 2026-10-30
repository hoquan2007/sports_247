export type MatchStatus = "scheduled" | "live" | "finished";

export interface FootballTeam {
  id: string;
  name: string;
  shortName: string;
  logo: string | null;
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
  source: "ESPN" | "OpenLigaDB";
}

export interface MatchFeed {
  date: string;
  matches: FootballMatch[];
  updatedAt: string;
  sources: string[];
  partial: boolean;
  errors: string[];
}
