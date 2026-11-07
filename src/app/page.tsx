import { MatchCenter } from "@/components/match-center";
import { getMatchFeed } from "@/lib/football/espn";
import { LEAGUES, vietnamDate } from "@/lib/football/leagues";
import { parseMatchFilters } from "@/lib/football/shareable-filters";
import { VIETNAM_LEAGUES } from "@/lib/football/vietnam-leagues";
import { unavailableMatchFeed } from "@/lib/football/unavailable-feed";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const rawParams = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["date", "league", "status", "q"] as const) {
    const value = rawParams[key];
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === "string") params.set(key, value[0]);
  }
  const filters = parseMatchFilters(params, vietnamDate(new Date()));
  const date = filters.date;
  let feed;
  try {
    feed = await getMatchFeed(date);
  } catch {
    console.error(JSON.stringify({ event: "sports247_home_feed_failure", date, at: new Date().toISOString() }));
    feed = unavailableMatchFeed(date, LEAGUES.map((league) => league.id),
      VIETNAM_LEAGUES.map((league) => league.id));
  }
  return <MatchCenter initialFeed={feed} initialFilters={filters} />;
}
