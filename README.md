# SPORTS247 — Football Match Center

Website lịch thi đấu, tỷ số bóng đá trực tiếp, giờ Việt Nam, xây dựng bằng **Next.js 16 / React 19 / TypeScript / Tailwind CSS 4** để triển khai lên Vercel.

Build sản xuất dùng `next build --webpack` do worker Turbopack gặp lỗi trong môi trường Windows sandbox khi xử lý PostCSS. Vercel vẫn nhận diện đây là ứng dụng Next.js thông thường.

## Chạy tại máy

```powershell
npm ci
npm run dev
```

Mở `http://localhost:3000`. Kiểm tra trước khi triển khai:

```powershell
npm run check
```

Lệnh `check` chạy ESLint, TypeScript, kiểm thử múi giờ/ngày thi đấu bằng Node test runner và bản build production.

Không cần API key để chạy các giải được ESPN cung cấp. Trình duyệt tải dữ liệu qua API của chính ứng dụng; yêu cầu tới nguồn ngoài chỉ thực hiện trên server.

## Tính năng

- Lịch theo ngày, quy đổi chính xác múi giờ `Asia/Ho_Chi_Minh` (GMT+7).
- Tỷ số, tình trạng trận (chưa bắt đầu / đang diễn ra / kết thúc), logo đội, sân vận động và thông tin truyền hình khi nhà cung cấp có dữ liệu.
- Bộ lọc giải đấu, trạng thái, tìm kiếm tên đội; lưu trận yêu thích bằng `localStorage`.
- Tự làm mới khi trang hiển thị mỗi **90 giây**; cache dữ liệu ESPN **90 giây** trên Next.js và hỗ trợ Vercel CDN.
- Giao diện desktop và điện thoại, modal chi tiết trận, trạng thái trống / lỗi / thiếu nguồn.
- Không hiển thị dữ liệu mô phỏng như tỷ số thật.

## API sử dụng

| Nguồn | Quyền truy cập | Mục đích | Lưu ý |
| --- | --- | --- | --- |
| [ESPN public Site API](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard) | Không cần key | Lịch, tỷ số, trạng thái, logo đội, thông tin trận | API **không chính thức**; không có SLA và có thể đổi cấu trúc, hạn chế truy cập. |
| [OpenLigaDB](https://api.openligadb.de/) | Không cần key | Dự phòng Bundesliga khi ESPN không truy cập được | Dữ liệu cộng đồng theo [ODbL](https://opendatacommons.org/licenses/odbl/1-0/); kết quả có thể cập nhật trễ. |
| [API-Football](https://www.api-football.com/pricing) | Free account / API key | Phương án nâng cấp khi cần bao phủ giải đấu hơn | Free hiện giới hạn 100 request/ngày; **chưa bật** trong bản này. |
| [TheSportsDB](https://www.thesportsdb.com/docs/api) | Khóa thử `123` | Phương án bổ sung dữ liệu/ảnh | API v1 free bị giới hạn số sự kiện trả về; livescore v2 là trả phí. |

Ứng dụng tích hợp trực tiếp ESPN và OpenLigaDB. Các API khác được đánh giá và ghi lại như lựa chọn mở rộng, không tuyên bố đã tích hợp.

Endpoint của ứng dụng:

```http
GET /api/matches?date=2026-10-31
```

Trả về `{ date, matches, updatedAt, sources, partial, errors }`. Mỗi trận bao gồm tên giải, tên/logo hai đội, giờ UTC ISO, tỷ số (`null` trước khi diễn ra), trạng thái, sân, kênh phát sóng và nguồn. Dữ liệu lịch theo ngày Việt Nam cần gọi **hai ngày UTC** vì mốc 00:00 GMT+7 nằm trong ngày UTC trước đó.

Các giải mặc định: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League, Championship, MLS. Giải khác như V.League cần nhà cung cấp hỗ trợ trước khi bật. Logo được lấy từ dữ liệu ESPN/OpenLigaDB, không tự động sao chép hình ảnh từ website 24h. Trang [24h lịch thi đấu](https://www.24h.com.vn/bong-da/lich-thi-dau-bong-da-hom-nay-moi-nhat-c48a364371.html) chỉ được dùng để tham khảo nội dung/tổ chức và kiểm tra chéo các trận.

## Video trận đấu trực tiếp

**API tỷ số trực tiếp không đồng nghĩa với quyền phát hình trực tiếp.** Quyền phát trận được bán theo giải và quốc gia; hiện không có một API miễn phí, hợp pháp và ổn định cung cấp video toàn bộ các giải. Trường `broadcasters` của ESPN có thể hiển thị tên kênh tại thị trường Mỹ và không bảo đảm quyền xem tại Việt Nam. Giao diện cung cấp tên kênh (khi có) và đường dẫn tới trang thông tin ESPN, không nhúng luồng không được cấp phép.

Khi có hợp đồng hoặc nguồn embed chính thức, có thể bổ sung trang `/watch` với allowlist domain và thông tin quyền xem theo khu vực.

## Kiến trúc

```text
src/
  app/
    api/matches/route.ts     API proxy, validation, response cache
    page.tsx                 Server-render dữ liệu cho ngày hiện tại
    layout.tsx               SEO và khung tài liệu
    sports.css               Responsive dark scoreboard
  components/
    match-center.tsx         Giao diện client và bộ lọc / modal / polling
  lib/football/
    espn.ts                  Adapter ESPN + OpenLigaDB fallback
    leagues.ts               Danh sách giải, xử lý ngày và múi giờ
    types.ts                 Contract API frontend/backend
```

Các external request có timeout 9,5 giây và chuyển lỗi của từng giải thành trạng thái `partial`. Cần theo dõi quota/điều khoản ESPN nếu lượng truy cập tăng; Vercel serverless không giữ kết nối WebSocket lâu dài, nên dùng polling.

## Công cụ yêu cầu

- **ai-website-cloner-template**: được clone vào `tools/ai-website-cloner-template/`, sử dụng stack Next.js + Tailwind của dự án làm nền tảng. Đọc hướng dẫn tại repo để dùng kỹ năng `/clone-website` khi cần dựng trang khác.
- **REA**: clone tại `tools/rea/` và cài CLI npm tại `tools/rea-cli/node_modules/.bin/rea.cmd`. Kiểm tra bằng `./tools/rea-cli/node_modules/.bin/rea.cmd --version`. REA 6.8 yêu cầu Node `^24.22.1` hoặc cao hơn (hoặc Node 22 bản hỗ trợ). Máy hiện có Node 24.19.0 nên cần nâng runtime trước khi chạy đầy đủ REA. Để thêm REA vào Codex/Cursor sau khi nâng Node: `npx rea-agents setup --client codex --client cursor` và kiểm tra đề xuất sửa cấu hình.

Thư mục `tools/` và `.taste-skill/` là công cụ phát triển, được bỏ qua khi commit và khi triển khai từ root.

## Triển khai Vercel

1. Push **root dự án** lên GitHub (không chứa `node_modules`, `tools/`, `.next/`).
2. Import repository ở Vercel, framework **Next.js**, Root Directory `.`, Install Command `npm ci`, Build Command `npm run build`.
3. Chọn region gần Việt Nam khi phù hợp; endpoint không cần environment variables. Kiểm tra `/api/matches?date=2026-10-31` sau deploy.

Lưu ý tuân thủ điều khoản sử dụng dữ liệu, bản quyền logo CLB, nguồn phát sóng, và hiển thị nguồn phù hợp trước khi thương mại hóa.
