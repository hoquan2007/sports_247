import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "SPORTS247 — Football matchday and live scores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      width: "100%", height: "100%", padding: "66px 75px",
      color: "#ebfff1", background: "#071510", fontFamily: "Arial, sans-serif",
      border: "10px solid #1b4030",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", width: 48, height: 48, borderRadius: 24,
          alignItems: "center", justifyContent: "center", background: "#a1f3be", color: "#071510", fontSize: 33 }}>●</div>
        <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: 1 }}>SPORTS247</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ color: "#a1f3be", fontSize: 26, letterSpacing: 5 }}>FOOTBALL / MATCHDAY</span>
        <div style={{ display: "flex", flexDirection: "column", fontWeight: 800, fontSize: 88,
          letterSpacing: -3, lineHeight: 1.06 }}>
          <span>LIVE SCORES</span>
          <span>& FIXTURES.</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: 22, borderTop: "2px solid #2c5942", fontSize: 25 }}>
        <span>Real match data · Vietnam time</span><span style={{ color: "#a1f3be" }}>sports247</span>
      </div>
    </div>,
    size,
  );
}
