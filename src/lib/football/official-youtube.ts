/** Curated live broadcasts supplied by a rights holder or an authorized operator.
 * This file never searches YouTube or guesses stream IDs from fixture names.
 */
export interface LicensedYouTubeStream {
  league: string;
  event: string;
  videoId: string;
  countries: string[];
  validFrom: string;
  validUntil: string;
  title?: string;
  rightsReference: string;
}

export interface AuthorizedYouTubeStream {
  provider: "YouTube";
  embedUrl: string;
  title: string;
  broadcastType: "live";
}

/** Accept unambiguous UTC instants and reject dates normalized by Date.parse. */
function parseUtcInstant(value: string | undefined): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) return NaN;
  return parsed;
}

/** Invalid configuration fails closed, including missing evidence references. */
export function parseLicensedYouTubeStreams(value: string | undefined): LicensedYouTubeStream[] {
  if (!value || value.length > 64_000) return [];
  try {
    const entries: unknown = JSON.parse(value);
    if (!Array.isArray(entries) || entries.length > 100) return [];
    return entries.filter((item): item is LicensedYouTubeStream => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const entry = item as Partial<LicensedYouTubeStream>;
      const from = parseUtcInstant(entry.validFrom);
      const until = parseUtcInstant(entry.validUntil);
      return typeof entry.league === "string" && /^[a-z]+\.[a-z0-9.]+$/.test(entry.league) &&
        typeof entry.event === "string" && /^\d{6,12}$/.test(entry.event) &&
        typeof entry.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(entry.videoId) &&
        Array.isArray(entry.countries) && entry.countries.length > 0 &&
        entry.countries.every((country) => typeof country === "string" && /^[A-Z]{2}$/.test(country)) &&
        Number.isFinite(from) && Number.isFinite(until) && until > from && until - from <= 8 * 60 * 60_000 &&
        typeof entry.rightsReference === "string" && entry.rightsReference.trim().length >= 3 &&
        (entry.title === undefined || (typeof entry.title === "string" && entry.title.length <= 120));
    });
  } catch {
    return [];
  }
}

/** An exact ESPN event ID, verified viewer market and active broadcast window are required. */
export function findAuthorizedYouTubeStream(
  config: string | undefined,
  league: string,
  event: string,
  viewerCountry: string | null,
  now = Date.now(),
): AuthorizedYouTubeStream | null {
  if (!viewerCountry || !/^[A-Z]{2}$/.test(viewerCountry) || !Number.isFinite(now)) return null;
  const matching = parseLicensedYouTubeStreams(config).find((entry) =>
    entry.league === league && entry.event === event && entry.countries.includes(viewerCountry) &&
    now >= parseUtcInstant(entry.validFrom) && now <= parseUtcInstant(entry.validUntil),
  );
  if (!matching) return null;
  return {
    provider: "YouTube",
    embedUrl: `https://www.youtube-nocookie.com/embed/${matching.videoId}`,
    title: matching.title?.trim() || "Luồng phát trực tiếp được cấp quyền",
    broadcastType: "live",
  };
}
