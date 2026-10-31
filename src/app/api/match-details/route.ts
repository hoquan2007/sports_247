import { NextRequest, NextResponse } from "next/server";
import { LEAGUES } from "@/lib/football/leagues";
import { getEspnMatchDetails } from "@/lib/football/match-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league");
  const event = request.nextUrl.searchParams.get("event");
  if (!league || !LEAGUES.some((candidate) => candidate.id === league) ||
      !event || !/^\d{6,12}$/.test(event)) {
    return NextResponse.json({ error: "Mã giải đấu hoặc trận đấu không hợp lệ." }, { status: 400 });
  }

  try {
    const details = await getEspnMatchDetails(league, event);
    return NextResponse.json(details, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ error: "Không thể tải chi tiết trận đấu từ ESPN." }, { status: 502 });
  }
}
