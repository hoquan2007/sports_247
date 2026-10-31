import { NextRequest, NextResponse } from "next/server";
import { STANDINGS_LEAGUES, getStandings } from "@/lib/football/standings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const leagueId = request.nextUrl.searchParams.get("league");
  if (!leagueId || !STANDINGS_LEAGUES.some((id) => id === leagueId)) {
    return NextResponse.json({ error: "Giải chưa hỗ trợ bảng xếp hạng." }, { status: 400 });
  }
  const started = performance.now();
  try {
    const standings = await getStandings(leagueId);
    const durationMs = Math.round(performance.now() - started);
    if (durationMs > 2500) console.warn(JSON.stringify({
      event: "sports247_standings_slow", league: leagueId, durationMs, at: new Date().toISOString(),
    }));
    return NextResponse.json(standings, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch {
    console.error(JSON.stringify({ event: "sports247_standings_upstream_failure", league: leagueId,
      durationMs: Math.round(performance.now() - started), at: new Date().toISOString() }));
    return NextResponse.json({ error: "Chưa thể tải bảng xếp hạng." }, { status: 502 });
  }
}
