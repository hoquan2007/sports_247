import type { FootballMatch, MatchFeed } from "./types";

/**
 * A temporary provider outage should not make known fixtures disappear.
 * Fresh records always win, while missing matches are kept only for the same
 * selected date and only when the provider explicitly reports a partial feed.
 */
export function reconcileFeed(previous: MatchFeed | null, next: MatchFeed): MatchFeed {
  if (!next.partial || !previous || previous.date !== next.date) return next;

  const known = new Map<string, FootballMatch>(previous.matches.map((match) => [match.id, match]));
  for (const match of next.matches) known.set(match.id, match);
  const matches = [...known.values()].sort((a, b) =>
    Date.parse(a.startTime) - Date.parse(b.startTime));

  return {
    ...next,
    matches,
    sources: [...new Set(matches.map((match) => match.source))],
  };
}
