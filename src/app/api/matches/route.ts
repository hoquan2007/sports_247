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
  const started = performance.now();
  try {
    const feed = await getMatchFeed(date);
    if (feed.partial) console.warn(JSON.stringify({
      event: "sports247_matches_partial", date, missingSources: feed.errors.length,
      failedLeagues: feed.failedLeagues ?? [],
      durationMs: Math.round(performance.now() - started), at: new Date().toISOString(),
    }));
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=180" },
    });
  } catch {
    console.error(JSON.stringify({ event: "sports247_matches_upstream_failure", date,
      durationMs: Math.round(performance.now() - started), at: new Date().toISOString() }));
    return NextResponse.json({ error: "Không thể kết nối nguồn dữ liệu bóng đá." }, { status: 502 });
  }
}
