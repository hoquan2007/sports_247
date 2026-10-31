/** Keep upstream results attributed to their competition, including the UTC
 * day that failed or contained malformed records. One imperfect day makes
 * that competition's local date partial while valid fixtures remain visible.
 */
export interface ProviderFixtureBatch<T> { matches: T[]; incomplete: boolean }
export interface ProviderIssue { leagueId: string; message: string }

/** A verified complete fallback supersedes the original provider's warnings. */
export function markProviderRecovered(
  leagueId: string, failedLeagues: Set<string>, issues: ProviderIssue[],
): void {
  failedLeagues.delete(leagueId);
  for (let index = issues.length - 1; index >= 0; index--) {
    if (issues[index].leagueId === leagueId) issues.splice(index, 1);
  }
}

export function collectEspnOutcomes<T>(
  tasks: ReadonlyArray<{ league: { id: string; name: string } }>,
  outcomes: ReadonlyArray<PromiseSettledResult<T[] | ProviderFixtureBatch<T>>>,
): { matches: T[]; errors: string[]; failedLeagues: string[]; issues: ProviderIssue[] } {
  const matches: T[] = [];
  const issues: ProviderIssue[] = [];
  const failed = new Set<string>();
  outcomes.forEach((outcome, index) => {
    const league = tasks[index]?.league;
    if (!league) throw new Error("Missing competition for provider result");
    if (outcome.status === "fulfilled") {
      const batch = Array.isArray(outcome.value) ? { matches: outcome.value, incomplete: false } : outcome.value;
      matches.push(...batch.matches);
      if (batch.incomplete) {
        issues.push({ leagueId: league.id, message: `${league.name}: nguồn ESPN trả về dữ liệu chưa đầy đủ` });
        failed.add(league.id);
      }
    } else {
      issues.push({ leagueId: league.id, message: `${league.name}: không thể tải dữ liệu` });
      failed.add(league.id);
    }
  });
  return { matches, errors: issues.map((issue) => issue.message), failedLeagues: [...failed], issues };
}
