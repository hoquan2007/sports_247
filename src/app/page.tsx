import { MatchCenter } from "@/components/match-center";
import { getMatchFeed } from "@/lib/football/espn";
import { LEAGUES, vietnamDate } from "@/lib/football/leagues";
import { VIETNAM_LEAGUES } from "@/lib/football/vietnam-leagues";
import { unavailableMatchFeed } from "@/lib/football/unavailable-feed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const date = vietnamDate(new Date());
  let feed;
  try {
    feed = await getMatchFeed(date);
  } catch {
    console.error(JSON.stringify({ event: "sports247_home_feed_failure", date, at: new Date().toISOString() }));
    feed = unavailableMatchFeed(date, LEAGUES.map((league) => league.id),
      VIETNAM_LEAGUES.map((league) => league.id));
  }
  return <MatchCenter initialFeed={feed} />;
}
