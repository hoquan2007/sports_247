# SPORTS247 — Biên bản release SEO và synthetic monitoring

Ngày: 31/10/2026 (giờ Việt Nam). Phạm vi: REL-03 (technical SEO) và OPS-05 (monitor script/workflow).

## Định danh bản phát hành

- Repository: `hoquan2007/sports_247`; branch `codex/sports247-logos-watch-standings`; source commit `d9fc58612bd4a9b99844b5aaa0f5d4d80b8f232d`.
- PR [#1](https://github.com/hoquan2007/sports_247/pull/1) vẫn **draft**, chưa merge vào `main`.
- GitHub Actions [run #41216394295](https://github.com/hoquan2007/sports_247/actions/runs/41216394295): `completed/success` trên chính source commit.
- Vercel preview: `dpl_96mJbdbp7WueVFNYp4YUFXmjghnY`, `sports247-14l4gfhr3-hnquan.vercel.app`, `READY`. Preview có Deployment Protection; phải dùng `vercel curl` để đọc nội dung thực.
- Vercel production: `dpl_6cdYcXp1QMFT9RbqRadzCcByPEFV`, `READY`, source `d9fc586`, Next.js 16.3.5, project `sports_247`. Địa chỉ chính `https://sports247-three.vercel.app`; Vercel xác nhận thêm alias `https://sports247-hnquan.vercel.app`.
- Production trước release: `dpl_94uKhp9HvM7RViCY5i4MKn8zkETm`, source `4e7978c`. Giữ ID để đối chiếu khi cần rollback; **chưa diễn tập rollback**.

## Kiểm thử và quan sát

| Phạm vi | Bằng chứng | Kết quả |
| --- | --- | --- |
| Local CI | `npm run check`: ESLint, TypeScript, **80/80** Node tests, production build | PASS |
| Local HTTP | `next start` trên localhost:34133, `scripts/smoke-http.mjs` | **8/8 PASS** |
| Preview được bảo vệ | `vercel curl /robots.txt`, `/sitemap.xml` và `--head /opengraph-image` | Robots/XML đúng nội dung; Open Graph **HTTP 200 image/png**, 50.874 bytes |
| Production HTTP | `SPORTS247_BASE_URL=https://sports247-three.vercel.app` với `scripts/smoke-http.mjs` | **8/8 PASS**; không thử video có phí |
| Production SEO | `GET /`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image` | Cả 4 **HTTP 200**; HTML có canonical + OG + Twitter URL đúng; robots `text/plain`, sitemap `application/xml`, social image `image/png` |
| Production synthetic monitor | `node scripts/monitor-production.mjs` | **PASS**; homepage, matches, EPL standings hợp lệ; V.League 1/2 `pending` (đúng trạng thái chưa cấu hình) |
| Vercel runtime errors | Project runtime errors, cửa sổ 30 phút lúc kiểm tra | Không thấy lỗi trong cửa sổ đã chọn |

Script monitoring chỉ kiểm tra homepage, `GET /api/matches` và `GET /api/standings`; không truy cập `/api/watch` hay provider video tính phí. Workflow `.github/workflows/production-monitor.yml` được thiết kế chạy bốn lần/ngày, báo lỗi HTTP/schema hoặc ESPN degraded ở chế độ strict. **GitHub cron chỉ hoạt động khi workflow nằm trên nhánh mặc định `main`**: lịch chưa hoạt động trong PR draft, và hiện chưa xác minh nơi nhận thông báo thất bại. Cần kiểm tra lần chạy đầu thực tế sau khi workflow được đưa lên main.

## Giới hạn và release gate còn mở

- Lighthouse desktop/mobile, LCP/CLS, focus/contrast và kiểm tra ảnh chia sẻ khi crawler bên ngoài chưa có số đo mới.
- Chưa diễn tập rollback production; nếu cần quay lại phiên bản cũ, xem thông tin deployment trước release ở trên và xác nhận alias mục tiêu trước khi thực hiện.
- Chưa có credentials/đối soát trận thật cho V.League 1/2, chưa có bản quyền livestream để nghiệm thu luồng xem trực tiếp tại Việt Nam.
- PR #1 giữ draft; trước khi merge cần review quyền tài nguyên, chạy đủ release gate, xác minh CI và cảnh báo monitoring.
