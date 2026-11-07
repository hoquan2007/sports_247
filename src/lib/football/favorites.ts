/** Favorites live only in this browser and are intentionally never sent to a server. */
export const FAVORITES_STORAGE_KEY = "sports247:favorites";
const MAX_FAVORITES = 500;

export function normalizeFavoriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !item.length || item.length > 160) continue;
    ids.add(item);
    if (ids.size >= MAX_FAVORITES) break;
  }
  return [...ids];
}

export function parseFavoriteIds(raw: string | null): string[] {
  if (!raw || raw.length > 100_000) return [];
  try { return normalizeFavoriteIds(JSON.parse(raw) as unknown); }
  catch { return []; }
}

export function readFavoriteIds(storage: Pick<Storage, "getItem">): string[] {
  try { return parseFavoriteIds(storage.getItem(FAVORITES_STORAGE_KEY)); }
  catch { return []; }
}

export function writeFavoriteIds(storage: Pick<Storage, "setItem">, value: readonly string[]): boolean {
  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalizeFavoriteIds(value)));
    return true;
  } catch { return false; }
}
