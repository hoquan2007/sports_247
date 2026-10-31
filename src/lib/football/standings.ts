/** ESPN publishes soccer tables through /apis/v2 rather than /apis/site/v2. */
export const STANDINGS_LEAGUES = ["eng.1", "esp.1", "ger.1", "ita.1", "fra.1", "por.1", "ned.1", "usa.1", "ksa.1", "eng.2"] as const;

export interface StandingEntry {
  id: string;
  name: string;
  logo: string | null;
  rank: number | null;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  goalDifference: number | null;
  points: number | null;
}

export interface StandingGroup { name: string; entries: StandingEntry[] }
export interface StandingFeed {
  leagueId: string;
  season: string | null;
  groups: StandingGroup[];
  source: "ESPN";
}

interface EspnEntry {
  team?: { id?: string; displayName?: string; logos?: Array<{ href?: string }> };
  stats?: Array<{ name?: string; value?: number; displayValue?: string }>;
}
interface EspnStandings {
  season?: { displayName?: string };
  name?: string;
  children?: Array<{ name?: string; standings?: { entries?: EspnEntry[] } }>;
  standings?: { entries?: EspnEntry[] };
}

function stat(stats: EspnEntry["stats"], names: string[]): number | null {
  const item = stats?.find((s) => names.includes(s.name ?? ""));
  if (!item) return null;
  if (typeof item.value === "number" && Number.isFinite(item.value)) return item.value;
  const fromText = Number(item.displayValue);
  return item.displayValue?.trim() && Number.isFinite(fromText) ? fromText : null;
}

export function mapStandings(payload: unknown, leagueId: string): StandingFeed {
  if (!payload || typeof payload !== "object") throw new Error("Invalid ESPN standings data");
  const data = payload as EspnStandings;
  const sections = data.children?.length ? data.children : [{ name: data.name, standings: data.standings }];
  const groups = sections.flatMap((section) => {
    if (!Array.isArray(section.standings?.entries)) return [];
    const entries = section.standings.entries.flatMap((item, index) => {
      if (!item.team?.id || !item.team?.displayName) return [];
      const logo = item.team.logos?.find((l) => l.href?.startsWith("https://a.espncdn.com/"))?.href ?? null;
      return [{
        id: item.team.id,
        name: item.team.displayName,
        logo,
        rank: stat(item.stats, ["rank", "rankDisplay", "rankValue"]) ?? index + 1,
        played: stat(item.stats, ["gamesPlayed", "games", "played"]),
        wins: stat(item.stats, ["wins", "win"]),
        draws: stat(item.stats, ["ties", "draws", "tie"]),
        losses: stat(item.stats, ["losses", "loss"]),
        goalDifference: stat(item.stats, ["pointDifferential", "goalDifference", "goalDifferential"]),
        points: stat(item.stats, ["points", "point"]),
      } satisfies StandingEntry];
    });
    return entries.length ? [{ name: section.name || "Bảng xếp hạng", entries } satisfies StandingGroup] : [];
  });
  return { leagueId, season: data.season?.displayName ?? null, groups, source: "ESPN" };
}

export async function getStandings(leagueId: string): Promise<StandingFeed> {
  const response = await fetch(
    `https://site.api.espn.com/apis/v2/sports/soccer/${encodeURIComponent(leagueId)}/standings`,
    { next: { revalidate: 1800 }, signal: AbortSignal.timeout(9500), headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`ESPN standings HTTP ${response.status}`);
  return mapStandings(await response.json(), leagueId);
}
