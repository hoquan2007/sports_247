# SPORTS247 — Kiểm thử production ngày 31/10/2026

## Môi trường và mức độ xác nhận

- URL: `https://sports247-three.vercel.app`; Vercel deployment production `dpl_94uKhp9HvM7RViCY5i4MKn8zkETm` từ commit code `4e7978c` (**READY**). Bản commit tài liệu `7d391a9` không thay đổi code runtime của deployment.
- Kiểm thử: `SPORTS247_BASE_URL=https://sports247-three.vercel.app node scripts/qa-browser.mjs`, Chrome headless trên Windows, desktop **1440×900** và mobile **390×844**. Exit code **0**, JSON kết quả `status=PASS`.
- Browser: **20** tùy chọn giải, **37** trận, 48 league badges, **39/39** ảnh đang hiển thị tải thành công, **0** ảnh vỡ, **0** tràn ngang; hai V.League ở trạng thái `pending` với link VPF.
- Tương tác: mở modal chi tiết trận, tab xem trực tiếp, thoát bằng Escape; bảng xếp hạng EPL có 6 dòng sidebar, 20 dòng toàn bảng, 8 cột; focus hoàn lại khi đóng. Bộ lọc V.League 1/2 và nút reset hoạt động trên hai viewport.
- CDN fallback: khi chặn ESPN CDN, **46** badge ESPN chuyển sang chữ, 2 logo VPF vẫn tải; khi chặn VPF CDN, **2** badge Việt Nam fallback, 37 logo ESPN vẫn tải. Không có ảnh vỡ ở cả hai trường hợp.
- 8 ảnh ở thư mục [`qa/production-2026-10-31/`](qa/production-2026-10-31/): `desktop.png`, `desktop-leagues.png`, `desktop-standings.png`, `mobile.png`, `mobile-leagues.png`, `mobile-standings.png`, `mobile-cdn-blocked.png`, `mobile-vpf-blocked.png`. Ảnh QA local trước đó được khôi phục nguyên trạng.

## Kiểm tra GitHub và HTTP

- Draft [PR #1](https://github.com/hoquan2007/sports_247/pull/1), head `7d391a9`, base `main`. Workflow [Actions #41213643328](https://github.com/hoquan2007/sports_247/actions/runs/41213643328) **completed/success**, job `Lint, types, tests, build` thành công.
- Production HTTP smoke **8/8 PASS** trước PR; feed ngày 31/10 có 37 trận, `partial=false`, `errors=[]`, `failedLeagues=[]`, `pendingLeagues=[vie.1,vie.2]`.
- HTTP probe production sau QA: `/` 200 (~863 ms); `/api/matches?date=2026-10-31` 200 (~805 ms), `Cache-Control: public`, `X-Vercel-Cache: MISS`; `/api/standings?league=eng.1` 200 (~75 ms), `Cache-Control: public`, `X-Vercel-Cache: HIT`. Các số đo là **một lần yêu cầu**, không đại diện cho p95 hoặc Web Vitals.
- `/robots.txt` và `/sitemap.xml` **404**. Homepage có description nhưng **thiếu** canonical và `og:image` trong HTML; chưa chạy Lighthouse. Cần kiểm tra tiếp chính sách cache/CDN trước khi kết luận TTL hiệu lực.

## Release gate chưa đạt

PR vẫn ở trạng thái draft, chưa review/merge. Ưu tiên tiếp theo: REL-03 (SEO/cache/Lighthouse) và OPS-05 (synthetic monitoring/alert); sau đó hoàn thành review và kế hoạch rollback. Dữ liệu V.League thực, tài khoản API-Football, streaming hợp pháp và Redis budget vẫn phụ thuộc cấu hình/quyền bên ngoài; browser QA chỉ xác nhận giao diện hoạt động và trạng thái thiếu dữ liệu chính xác.
