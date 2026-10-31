import { NextRequest, NextResponse } from "next/server";
import { LEAGUES } from "@/lib/football/leagues";
import { isVietnamLeague } from "@/lib/football/vietnam-leagues";
import { getMatchWatch } from "@/lib/football/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league");
  const event = request.nextUrl.searchParams.get("event");
  if (!league || (!LEAGUES.some((entry) => entry.id === league) && !isVietnamLeague(league)) ||
      !event || !/^\d{6,12}$/.test(event)) {
    return NextResponse.json({ error: "Mã giải hoặc mã trận không hợp lệ." }, { status: 400 });
  }

  const started = performance.now();
  try {
    // Trust Vercel's geolocation only on Vercel. Clients cannot choose a country with a query parameter.
    // On local and unrecognized hosts this stays null so playback fails closed.
    const viewerCountry = process.env.VERCEL === "1" ? request.headers.get("x-vercel-ip-country") : null;
    const result = await getMatchWatch(league, event, viewerCountry);
    console.info(JSON.stringify({ event: "sports247_watch_result", league, outcome: result.status,
      durationMs: Math.round(performance.now() - started), at: new Date().toISOString() }));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Only structured identifiers are logged; never serialize the request URL or upstream token.
    console.error(JSON.stringify({ event: "sports247_watch_upstream_failure", league,
      durationMs: Math.round(performance.now() - started), at: new Date().toISOString() }));
    return NextResponse.json({ error: "Tạm thời không thể kiểm tra nguồn phát trực tiếp. Vui lòng thử lại sau." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
