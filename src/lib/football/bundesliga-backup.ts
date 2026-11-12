import type { FootballMatch } from "./types";

interface EspnDay {
  day: string;
  healthy: boolean;
  matches: FootballMatch[];
}

interface BundesligaBackup {
  matches: FootballMatch[];
  incomplete: boolean;
}

function utcDay(startTime: string): string {
  return new Date(startTime).toISOString().slice(0, 10);
}

/**
 * ESPN requests straddle two UTC dates for one Vietnamese calendar day.
 * Recover only UTC dates with no usable ESPN data. OpenLigaDB and ESPN use
 * different event IDs, so merging a partially populated UTC day can duplicate
 * fixtures and make live-score updates appear as two separate matches.
 */
export function selectBundesligaBackup(
  attempts: readonly EspnDay[], existing: readonly FootballMatch[], backup: BundesligaBackup,
): { matches: FootballMatch[]; recovered: boolean } {
  const unhealthy = attempts.filter((attempt) => !attempt.healthy);
  const missingDays = new Set(unhealthy.filter((attempt) => !attempt.matches.length).map((attempt) => attempt.day));
  const occupiedDays = new Set(existing.filter((match) => match.leagueId === "ger.1")
    .map((match) => utcDay(match.startTime)));
  const overlaps = [...missingDays].some((day) => occupiedDays.has(day));

  return {
    matches: backup.matches.filter((match) => missingDays.has(utcDay(match.startTime))
      && !occupiedDays.has(utcDay(match.startTime))),
    recovered: !backup.incomplete && unhealthy.every((attempt) => !attempt.matches.length) && !overlaps,
  };
}
