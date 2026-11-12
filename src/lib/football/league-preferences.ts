import { LEAGUES } from "./leagues.ts";
import { VIETNAM_LEAGUES } from "./vietnam-leagues.ts";

export const PINNED_LEAGUES_STORAGE_KEY = "sports247:pinned-leagues:v1";

const allowedLeagueIds = new Set([...LEAGUES, ...VIETNAM_LEAGUES].map((league) => league.id));

export function normalizePinnedLeagueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const id of value) {
    if (typeof id === "string" && allowedLeagueIds.has(id)) unique.add(id);
  }
  return [...unique];
}

export function parsePinnedLeagueIds(value: string | null): string[] {
  if (!value || value.length > 10_000) return [];
  try { return normalizePinnedLeagueIds(JSON.parse(value)); }
  catch { return []; }
}

export function readPinnedLeagueIds(storage: Pick<Storage, "getItem">): string[] {
  try { return parsePinnedLeagueIds(storage.getItem(PINNED_LEAGUES_STORAGE_KEY)); }
  catch { return []; }
}

export function writePinnedLeagueIds(storage: Pick<Storage, "getItem" | "setItem">, value: string[]): boolean {
  const ids = normalizePinnedLeagueIds(value);
  try {
    const previous = readPinnedLeagueIds(storage);
    if (previous.length === ids.length && previous.every((id, index) => id === ids[index])) return true;
    storage.setItem(PINNED_LEAGUES_STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch { return false; }
}
