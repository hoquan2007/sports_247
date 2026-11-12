/** Favorites live only in this browser and are intentionally never sent to a server. */
export const FAVORITES_STORAGE_KEY = "sports247:favorites";
const MAX_FAVORITES = 500;
const MAX_BACKUP_SIZE = 100_000;

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

export function writeFavoriteIds(storage: Pick<Storage, "getItem" | "setItem">, value: readonly string[]): boolean {
  try {
    const serialized = JSON.stringify(normalizeFavoriteIds(value));
    // A remote storage event can update another tab's state. Avoid writing the
    // identical value back and generating needless cross-tab notifications.
    if (storage.getItem(FAVORITES_STORAGE_KEY) !== serialized) {
      storage.setItem(FAVORITES_STORAGE_KEY, serialized);
    }
    return true;
  } catch { return false; }
}

/** A portable, versioned backup containing only local favorite match IDs. */
export function serializeFavoriteBackup(ids: readonly string[], exportedAt = new Date().toISOString()): string {
  return JSON.stringify({ version: 1, exportedAt, favorites: normalizeFavoriteIds(ids) }, null, 2);
}

export function parseFavoriteBackup(raw: string): string[] {
  if (raw.length > MAX_BACKUP_SIZE) throw new Error("Tệp yêu thích quá lớn.");
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error("Tệp JSON không hợp lệ."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Định dạng tệp không hợp lệ.");
  const backup = data as Record<string, unknown>;
  if (backup.version !== 1 || !Array.isArray(backup.favorites) || backup.favorites.length > MAX_FAVORITES ||
      backup.favorites.some((id: unknown) => typeof id !== "string" || !id.length || id.length > 160)) {
    throw new Error("Tệp yêu thích không đúng định dạng hoặc vượt giới hạn 500 trận.");
  }
  return normalizeFavoriteIds(backup.favorites);
}
