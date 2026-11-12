import Link from "next/link";

export default function MatchNotFound() {
  return <main className="match-route match-route-state">
    <section className="match-route-message">
      <h1>Không tìm thấy trận đấu</h1>
      <p>Mã trận hoặc giải đấu chưa có trong dữ liệu ESPN được xác nhận.</p>
      <Link href="/">Trở về lịch thi đấu</Link>
    </section>
  </main>;
}
