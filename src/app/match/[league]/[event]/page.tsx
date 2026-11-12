import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchDialog } from "@/components/match-dialog";
import { vietnamDate } from "@/lib/football/leagues";
import { getEspnMatchPage } from "@/lib/football/match-page";
import { validEspnMatchId } from "@/lib/football/match-link";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ league: string; event: string }> };

async function loadMatch({ params }: Params) {
  const { league, event } = await params;
  if (!validEspnMatchId(league, event)) notFound();
  const data = await getEspnMatchPage(league, event);
  if (!data) notFound();
  return data;
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { match } = await loadMatch(props);
  const title = `${match.home.name} vs ${match.away.name} | SPORTS247`;
  const description = `Lịch thi đấu, tỷ số và diễn biến trận ${match.home.name} - ${match.away.name} tại ${match.leagueName}, theo giờ Việt Nam.`;
  const path = `/match/${match.leagueId}/${match.eventId}`;
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function MatchPage(props: Params) {
  const { match, details } = await loadMatch(props);
  const date = vietnamDate(match.startTime);
  return <main className="match-route">
    <nav className="match-route-nav" aria-label="Điều hướng trận đấu">
      <Link href={`/?date=${date}`} className="match-route-home"><strong>SPORTS<span>247</span></strong><span>← Trở về lịch {date}</span></Link>
    </nav>
    <h1 className="sr-only">{match.home.name} - {match.away.name} · {match.leagueName}</h1>
    <MatchDialog match={match} initialDetails={details} mode="page" />
  </main>;
}
