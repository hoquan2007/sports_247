# SPORTS247 — Tiến độ thực tế và kế hoạch triển khai tiếp

Ngày cập nhật: **31/10/2026**. Nguồn trạng thái: Git local, kết quả kiểm tra GitHub Actions API, Vercel CLI và HTTP smoke gọi **production**. Đây là kế hoạch tiếp tục triển khai; không coi cấu hình sẵn hoặc kiểm thử mock là bằng chứng có bản quyền video hay dữ liệu V.League thực tế.

## 1. Baseline đã xác nhận

| Hạng mục | Kết quả kiểm tra | Trạng thái |
| --- | --- | --- |
| Git | Nhánh `codex/sports247-logos-watch-standings`, commit `4e7978c0c60260184e49946ffa821134c000fbf8`, local = `origin/codex/sports247-logos-watch-standings`; working tree sạch trước khi cập nhật tài liệu này. `main`/`origin/main` vẫn tại `2f2684c`. | Đã push; **chưa merge main** |
| Chất lượng mã | `npm run check` đã đạt lint, typecheck, **78/78 tests**, Next.js 16.3.5 production build (31/10). | PASS |
| Vercel | `dpl_94uKhp9HvM7RViCY5i4MKn8zkETm` READY, target production; alias `https://sports247-three.vercel.app` và `https://sports247-hnquan.vercel.app`. | Đã deploy |
| HTTP production | `npm run smoke:local` với `SPORTS247_BASE_URL=https://sports247-three.vercel.app`: **8/8 PASS** (trang chủ, input sai, video V.League không cấu hình, matches, standings). Mặc định không gọi provider video trả phí. | PASS |
| Feed production 31/10 | **37 trận**; `partial=false`; `errors=[]`, `failedLeagues=[]`; `pendingLeagues=[vie.1,vie.2]`. | ESPN hoạt động; Việt Nam chờ key |
| GitHub Actions | Workflow `.github/workflows/ci.yml` đã push; API GitHub báo **0 runs** trên nhánh, do workflow kích hoạt khi có pull request, push `main` hoặc manual dispatch. | **Chưa kiểm chứng CI remote** |
| Video và Việt Nam | `audit:readiness` không có `.env.local`: API-Football, ScoreBat, Redis budget và YouTube đều `disabled`. | Chưa có dữ liệu/live có quyền trong môi trường kiểm thử này |

Ghi chú: trạng thái Vercel và HTTP smoke xác thực website đang phục vụ các API nêu trên; chúng không xác thực toàn bộ trải nghiệm browser, tính ổn định nhiều ngày, CDN, hoặc quyền phát video tại Việt Nam.

## 2. Sprint kế tiếp — ưu tiên P0 (có thể làm ngay)

| ID | Việc cần làm | Đầu ra và tiêu chí nghiệm thu | Phụ thuộc |
| --- | --- | --- | --- |
| REL-01 | Tạo PR từ `codex/sports247-logos-watch-standings` sang `main`; review toàn bộ **4 commits** sau `2f2684c`; chạy GitHub Actions trên PR. | PR có diff rõ ràng, CI xanh (`npm ci`, lint, typecheck, 78+ tests, build); không có credentials trong thay đổi. Chỉ merge khi kết quả đạt và đã xem tác động triển khai production. | Quyền GitHub tạo PR/merge |
| REL-02 | Browser QA **trên production** tại 1440×900 và 390×844: chọn 20 giải, mở trận, bảng xếp hạng, tab watch, thử ảnh hỏng, bàn phím và mobile. | Lưu ảnh và báo cáo theo từng viewport; 0 lỗi JS nghiêm trọng, 0 tràn ngang, nút điều hướng và trạng thái V.League đúng, không có video giả. Đối chiếu UI với ảnh QA local trong `docs/qa/`. | Truy cập browser production |
| REL-03 | Kiểm tra cache, SEO, khả năng truy cập và hiệu suất ở production. | Headers/cache hợp lý cho matches/standings; Lighthouse mobile/desktop ghi số liệu thực tế (LCP/CLS/INP khi đo được), kiểm tra metadata, canonical, robots, focus và contrast; sửa lỗi có bằng chứng. | REL-02 |
| OPS-05 | Thiết kế và bật synthetic monitoring **không gọi video trả phí**: homepage, matches, standings, schema, độ trễ, lỗi upstream và trạng thái pending V.League. | Có lịch kiểm tra (ví dụ mỗi giờ, theo quota), dashboard/lịch sử failures, alert khi 5xx/schema lỗi hoặc nguồn partial kéo dài; ngưỡng và nơi nhận cảnh báo được cấu hình thực tế. | Quyền cấu hình giám sát và nơi nhận alert |
| REL-04 | Quy trình release: version/commit ↔ Vercel deployment ↔ checklist rollback, ghi kết quả smoke sau mỗi deployment. | Mỗi lần release truy được SHA, deployment ID, alias, test result; có thao tác rollback được thử nghiệm trước khi dựa vào tự động hoá. | REL-01, REL-02 |

**Definition of Done P0:** PR CI xanh, browser QA production đạt, liên kết release và rollback rõ ràng, có kiểm tra chủ động các endpoint quan trọng. Deployment READY + HTTP 200 hiện tại chỉ hoàn thành một phần các điều kiện này.

## 3. Sprint dữ liệu — ưu tiên P1

| ID | Việc cần làm | Điều kiện hoàn thành | Phụ thuộc |
| --- | --- | --- | --- |
| VN-01 | Xác minh hợp đồng/điều khoản dùng API-Football; xác định ID numeric mùa **2026/27** cho V.League 1 và V.League 2. | Có tài khoản, phạm vi sử dụng, ID đúng và quota thực; khai báo khóa chỉ qua Vercel Environment Variables; chạy `audit:readiness --require-vietnam`. | Quyền sử dụng API và credentials thực |
| VN-02 | So sánh fixtures API-Football với lịch VPF trong **ít nhất một vòng đấu đủ của cả hai giải**, kiểm tra giờ Việt Nam, vòng, đội, sân, tỷ số, trạng thái và logo. | Bảng đối soát từng trận; 0 nhầm giải/ID và số trận thiếu được giải thích; cache 3600s mặc định, chỉ giảm TTL sau khi đo quota. | VN-01 |
| DATA-15 | Đo độ phủ broadcaster, thống kê/phong độ/BXH theo ngày và giải; ưu tiên 9/37 trận từng thiếu thông tin kênh. | Audit và báo cáo theo giải; dữ liệu thiếu có nhãn rõ; không đoán thông tin hoặc gán kênh sai trận. | Nguồn dữ liệu có quyền |
| LOGO-10 | Kiểm chứng quyền sử dụng thumbnail/logo VPF và các ảnh ESPN; xem chất lượng ở production và xử lý khi CDN chặn. | Có nguồn quyền sử dụng, fallback vẫn hoạt động, ảnh sắc nét và không sai giải. | Xác minh quyền tài nguyên |

**Definition of Done P1:** lịch hai hạng Việt Nam có bằng chứng đối soát từ nguồn đáng tin cậy, trạng thái thiếu dữ liệu chính xác, không làm suy giảm 18 nguồn ESPN. Không đánh dấu VN-01/VN-02 DONE khi chỉ có fixture giả hoặc khi thiếu quyền.

## 4. Sprint livestream hợp pháp — ưu tiên P2, bị chặn bởi điều kiện bên ngoài

| ID | Việc cần làm | Điều kiện hoàn thành | Phụ thuộc |
| --- | --- | --- | --- |
| LIVE-01 | Chọn nguồn có quyền nhúng thực tế (ScoreBat gói Live/nhà đài hoặc YouTube từng trận có ủy quyền), xác minh **giải + quốc gia + khung giờ + website**. | Bằng chứng phạm vi quyền và hợp đồng; không dùng video công khai bất kỳ làm bằng chứng mặc định. | Hợp đồng/ủy quyền |
| LIVE-02 | Cấu hình credentials server-only, market whitelist, GeoIP đáng tin cậy, cùng giới hạn credit qua Redis nếu dùng ScoreBat; theo dõi chi phí thực. | `audit:readiness` qua cấu hình; kiểm thử integration trên môi trường được phép, không lộ token/rightsReference; quota và alert hoạt động giữa nhiều region. | LIVE-01, tài khoản và Redis |
| LIVE-03 | E2E một trận **thật**, có quyền phát ở Việt Nam, trên desktop/mobile; kiểm tra trạng thái chưa bắt đầu/live/phát lại và bị hạn chế địa lý. | Video phát hợp pháp, đúng trận và đúng người xem; hết thời hạn/không được cấp quyền thì chặn; có nhật ký đo lường không chứa secret. | LIVE-02 và sự kiện thật |

**Definition of Done P2:** ít nhất một livestream được cấp phép đã được xác nhận trong production và có đối soát chi phí; tính năng không được quảng bá là phát mọi trận khi chưa có bằng chứng tương ứng.

## 5. Thứ tự thực hiện và các điểm dừng

1. **Bây giờ:** REL-01, REL-02, REL-03, OPS-05; giữ nhánh `main` nguyên trạng cho tới khi PR/CI và QA đạt. Sau đó mới chuẩn hóa release/rollback (REL-04).
2. **Song song với P0:** yêu cầu thông tin quyền API-Football cho hai hạng V.League; nếu chưa có key/ID thì duy trì `pendingLeagues` và đường dẫn VPF rõ ràng.
3. **Khi có dữ liệu thật:** VN-01 → VN-02 → DATA-15, đồng thời xử lý quyền logo qua LOGO-10.
4. **Khi có bản quyền phát:** LIVE-01 → LIVE-02 → LIVE-03. Không nhập token trả phí, tự mở market whitelist hoặc phát nguồn không xác minh chỉ để đạt demo.

**Các rủi ro cần theo dõi:** ESPN Site API công khai không cam kết SLA; thiếu V.League credentials; quyền sử dụng logo/stream; ScoreBat có thể tính phí theo request và view; Vercel serverless/multi-region làm khác biệt cache và quota. Khi chưa xử lý hết, dùng trạng thái `partial/pending/unavailable` minh bạch cho người xem.

**Bước triển khai đề xuất đầu tiên:** mở PR cho 4 commit tính năng hiện tại, xác minh GitHub Actions, chạy browser QA production và bổ sung bộ synthetic monitoring không tiêu credit video.
