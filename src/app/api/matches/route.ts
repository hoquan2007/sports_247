import { NextRequest, NextResponse } from "next/server";
import { getMatchFeed } from "@/lib/football/espn";
import { vietnamDate } from "@/lib/football/leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? vietnamDate(new Date());
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: "Ngày phải có định dạng YYYY-MM-DD." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getMatchFeed(date), {
      headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=180" },
    });
  } catch {
    return NextResponse.json({ error: "Không thể kết nối nguồn dữ liệu bóng đá." }, { status: 502 });
  }
}
