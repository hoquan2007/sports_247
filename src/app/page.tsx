import { MatchCenter } from "@/components/match-center";
import { getMatchFeed } from "@/lib/football/espn";
import { vietnamDate } from "@/lib/football/leagues";

export const dynamic = "force-dynamic";

export default async function Home() {
  const feed = await getMatchFeed(vietnamDate(new Date()));
  return <MatchCenter initialFeed={feed} />;
}
