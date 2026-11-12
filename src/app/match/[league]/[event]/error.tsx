"use client";
import Link from "next/link";

export default function MatchPageError({ reset }: { reset: () => void }) {
  return <main className="match-route match-route-state" role="main">
    <section className="match-route-message" role="alert">
      <h1>Chưa thể tải trận đấu</h1>
      <p>Nguồn dữ liệu trận đấu đang gián đoạn. Hãy thử tải lại hoặc trở về trang lịch.</p>
      <div><button type="button" onClick={reset}>Thử lại</button><Link href="/">Về lịch thi đấu</Link></div>
    </section>
  </main>;
}
