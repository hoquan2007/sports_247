import type { FootballMatch } from "./types";

export interface GoalEvent {
  matchId: string;
  teamName: string;
  score: string;
}

/** Compare consecutive successful snapshots for the SAME selected date. */
export function detectGoalEvent(before: FootballMatch[], after: FootballMatch[]): GoalEvent | null {
  const prior = new Map(before.map((match) => [match.id, match]));
  for (const current of after) {
    const previous = prior.get(current.id);
    if (!previous || !["live", "finished"].includes(current.status)) continue;
    if (previous.homeScore === null || previous.awayScore === null ||
      current.homeScore === null || current.awayScore === null) continue;
    const homeDelta = current.homeScore - previous.homeScore;
    const awayDelta = current.awayScore - previous.awayScore;
    if (homeDelta > 0 || awayDelta > 0) {
      return {
        matchId: current.id,
        teamName: homeDelta > 0 ? current.home.name : current.away.name,
        score: `${current.homeScore}–${current.awayScore}`,
      };
    }
  }
  return null;
}
