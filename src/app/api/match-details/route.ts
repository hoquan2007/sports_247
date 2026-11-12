import { NextRequest, NextResponse } from "next/server";
import { LEAGUES } from "@/lib/football/leagues";
import { getEspnMatchPage } from "@/lib/football/match-page";

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
    const verified = await getEspnMatchPage(league, event);
    if (!verified) {
      return NextResponse.json({ error: "Không tìm thấy trận đấu khớp mã đã yêu cầu." }, { status: 404 });
    }
    return NextResponse.json(verified.details, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ error: "Không thể tải chi tiết trận đấu từ ESPN." }, { status: 502 });
  }
}
