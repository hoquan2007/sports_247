import { LEAGUES } from "./leagues.ts";
import { VIETNAM_LEAGUES } from "./vietnam-leagues.ts";
import type { MatchStatus } from "./types";

export type StatusFilter = "all" | MatchStatus;

export interface MatchFilters {
  date: string;
  league: string;
  status: StatusFilter;
  query: string;
}

const allowedLeagues = new Set([...LEAGUES, ...VIETNAM_LEAGUES].map(({ id }) => id));
const allowedStatuses = new Set<StatusFilter>([
  "all", "scheduled", "live", "finished", "postponed", "cancelled", "interrupted", "awarded",
]);

export function isValidMatchDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseMatchFilters(params: URLSearchParams, fallbackDate: string): MatchFilters {
  const date = params.get("date");
  const league = params.get("league");
  const status = params.get("status") as StatusFilter | null;
  return {
    date: isValidMatchDate(date) ? date : fallbackDate,
    league: league && allowedLeagues.has(league) ? league : "all",
    status: status && allowedStatuses.has(status) ? status : "all",
    query: (params.get("q") ?? "").trim().slice(0, 100),
  };
}

export function serializeMatchFilters(filters: MatchFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("date", filters.date);
  if (filters.league !== "all") params.set("league", filters.league);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  return params;
}
