export const SAVED_SEARCHES_STORAGE_KEY = "sports247:saved-searches:v1";
export const MAX_SAVED_SEARCHES = 6;

export function normalizeSavedSearches(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const searches: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const search = entry.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (!search || search.length > 100) continue;
    const identity = search.toLocaleLowerCase("vi-VN");
    if (seen.has(identity)) continue;
    searches.push(search);
    seen.add(identity);
    if (searches.length === MAX_SAVED_SEARCHES) break;
  }
  return searches;
}

export function parseSavedSearches(value: string | null): string[] {
  if (!value || value.length > 10_000) return [];
  try { return normalizeSavedSearches(JSON.parse(value)); }
  catch { return []; }
}

export function readSavedSearches(storage: Pick<Storage, "getItem">): string[] {
  try { return parseSavedSearches(storage.getItem(SAVED_SEARCHES_STORAGE_KEY)); }
  catch { return []; }
}

export function writeSavedSearches(storage: Pick<Storage, "getItem" | "setItem">, value: string[]): boolean {
  const searches = normalizeSavedSearches(value);
  try {
    const previous = readSavedSearches(storage);
    if (previous.length === searches.length && previous.every((entry, index) => entry === searches[index])) return true;
    storage.setItem(SAVED_SEARCHES_STORAGE_KEY, JSON.stringify(searches));
    return true;
  } catch { return false; }
}
