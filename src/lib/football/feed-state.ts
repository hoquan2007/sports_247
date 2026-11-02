import type { FootballMatch, MatchFeed } from "./types";

/**
 * A temporary provider outage should not make known fixtures disappear.
 * Fresh records always win. Preserve missing fixtures only in leagues whose
 * configured provider failed for the selected date, so an unrelated upstream
 * outage cannot retain obsolete scores from otherwise healthy leagues.
 */
export function reconcileFeed(previous: MatchFeed | null, next: MatchFeed): MatchFeed {
  if (!next.partial || !previous || previous.date !== next.date) return next;

  const failed = new Set(next.failedLeagues ?? []);
  if (!failed.size) return next;

  const known = new Map<string, FootballMatch>(
    previous.matches.filter((match) => failed.has(match.leagueId)).map((match) => [match.id, match]),
  );
  for (const match of next.matches) known.set(match.id, match);
  const matches = [...known.values()].sort((a, b) =>
    Date.parse(a.startTime) - Date.parse(b.startTime));

  return {
    ...next,
    matches,
    sources: [...new Set(matches.map((match) => match.source))],
  };
}
