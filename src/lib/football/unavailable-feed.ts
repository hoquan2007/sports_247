import type { MatchFeed } from "./types";

/** Keep the homepage usable when even the feed aggregator fails unexpectedly. */
export function unavailableMatchFeed(
  date: string, failedLeagues: readonly string[], pendingLeagues: readonly string[],
  updatedAt = new Date().toISOString(),
): MatchFeed {
  return {
    date, updatedAt, matches: [], sources: [], partial: true,
    failedLeagues: [...failedLeagues], pendingLeagues: [...pendingLeagues],
    errors: ["Không thể tải dữ liệu trận đấu. Vui lòng thử lại sau."],
  };
}
