import { LEAGUES } from "./leagues.ts";
import { VIETNAM_LEAGUES } from "./vietnam-leagues.ts";
import type { FootballMatch, FootballTeam } from "./types";

export const FOLLOWED_TEAMS_STORAGE_KEY = "sports247:followed-teams:v1";
export const MAX_FOLLOWED_TEAMS = 24;

export interface FollowedTeam {
  id: string;
  name: string;
}

const supportedLeagues = new Set([...LEAGUES, ...VIETNAM_LEAGUES].map(({ id }) => id));
const supportedSources = new Set(["ESPN", "OpenLigaDB", "API-Football"]);

export function isFollowedTeamId(id: unknown): id is string {
  if (typeof id !== "string" || id.length > 200) return false;
  const parts = id.split("|");
  if (parts.length !== 3 || !supportedSources.has(parts[0]) || !supportedLeagues.has(parts[1]) ||
    !parts[2] || parts[2].length > 120) return false;
  try {
    const decoded = decodeURIComponent(parts[2]);
    return decoded.length > 0 && decoded.length <= 80 && encodeURIComponent(decoded) === parts[2];
  } catch { return false; }
}

export function followedTeamForMatch(match: FootballMatch, team: FootballTeam): FollowedTeam | null {
  if (!team.id || !team.name.trim()) return null;
  const id = `${match.source}|${match.leagueId}|${encodeURIComponent(team.id)}`;
  const name = team.name.normalize("NFC").trim();
  return isFollowedTeamId(id) && name.length <= 100 ? { id, name } : null;
}

export function matchContainsTeam(match: FootballMatch, id: string): boolean {
  return followedTeamForMatch(match, match.home)?.id === id || followedTeamForMatch(match, match.away)?.id === id;
}

export function normalizeFollowedTeams(value: unknown): FollowedTeam[] {
  if (!Array.isArray(value)) return [];
  const teams: FollowedTeam[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { id, name } = entry as Record<string, unknown>;
    if (!isFollowedTeamId(id) || typeof name !== "string") continue;
    const cleanName = name.normalize("NFC").trim();
    if (!cleanName || cleanName.length > 100 || seen.has(id)) continue;
    teams.push({ id, name: cleanName });
    seen.add(id);
    if (teams.length === MAX_FOLLOWED_TEAMS) break;
  }
  return teams;
}

export function parseFollowedTeams(value: string | null): FollowedTeam[] {
  if (!value || value.length > 20_000) return [];
  try { return normalizeFollowedTeams(JSON.parse(value)); }
  catch { return []; }
}

export function readFollowedTeams(storage: Pick<Storage, "getItem">): FollowedTeam[] {
  try { return parseFollowedTeams(storage.getItem(FOLLOWED_TEAMS_STORAGE_KEY)); }
  catch { return []; }
}

export function writeFollowedTeams(storage: Pick<Storage, "getItem" | "setItem">, value: FollowedTeam[]): boolean {
  const teams = normalizeFollowedTeams(value);
  try {
    const previous = readFollowedTeams(storage);
    if (previous.length === teams.length && previous.every((team, index) =>
      team.id === teams[index].id && team.name === teams[index].name)) return true;
    storage.setItem(FOLLOWED_TEAMS_STORAGE_KEY, JSON.stringify(teams));
    return true;
  } catch { return false; }
}
