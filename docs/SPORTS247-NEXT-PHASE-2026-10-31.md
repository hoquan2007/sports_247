# SPORTS247 — Tiến độ thực tế và kế hoạch triển khai tiếp

Ngày cập nhật: **31/10/2026**. Nguồn trạng thái: Git local, kết quả kiểm tra GitHub Actions API, Vercel CLI và HTTP smoke gọi **production**. Đây là kế hoạch tiếp tục triển khai; không coi cấu hình sẵn hoặc kiểm thử mock là bằng chứng có bản quyền video hay dữ liệu V.League thực tế.

## 1. Baseline đã xác nhận

| Hạng mục | Kết quả kiểm tra | Trạng thái |
| --- | --- | --- |
| Git | Nhánh `codex/sports247-logos-watch-standings`, head đã push trước đợt SEO/monitoring là `30a2798`; `main`/`origin/main` vẫn tại `2f2684c`. | Đã push và mở PR; **chưa merge main** |
| Chất lượng mã | `npm run check` đã đạt lint, typecheck, **78/78 tests**, Next.js 16.3.5 production build (31/10). | PASS |
| Vercel | `dpl_94uKhp9HvM7RViCY5i4MKn8zkETm` READY, target production; alias `https://sports247-three.vercel.app` và `https://sports247-hnquan.vercel.app`. | Đã deploy |
| HTTP production | `npm run smoke:local` với `SPORTS247_BASE_URL=https://sports247-three.vercel.app`: **8/8 PASS** (trang chủ, input sai, video V.League không cấu hình, matches, standings). Mặc định không gọi provider video trả phí. | PASS |
| Feed production 31/10 | **37 trận**; `partial=false`; `errors=[]`, `failedLeagues=[]`; `pendingLeagues=[vie.1,vie.2]`. | ESPN hoạt động; Việt Nam chờ key |
| GitHub Actions | PR draft [#1](https://github.com/hoquan2007/sports_247/pull/1), hiện vẫn mở; run [#41213643328](https://github.com/hoquan2007/sports_247/actions/runs/41213643328) đã **success** ở commit cũ. Cần kiểm tra run mới sau lần push SEO/monitoring. | **PR chưa merge; đợi CI mới** |
| Video và Việt Nam | `audit:readiness` không có `.env.local`: API-Football, ScoreBat, Redis budget và YouTube đều `disabled`. | Chưa có dữ liệu/live có quyền trong môi trường kiểm thử này |

Ghi chú: trạng thái Vercel và HTTP smoke xác thực website đang phục vụ các API nêu trên; chúng không xác thực toàn bộ trải nghiệm browser, tính ổn định nhiều ngày, CDN, hoặc quyền phát video tại Việt Nam.

**Kiểm chứng bổ sung ngay trong ngày:** Chrome production desktop 1440×900 và mobile 390×844 đều **PASS**, có 8 ảnh bằng chứng; xem [biên bản QA](SPORTS247-PRODUCTION-QA-2026-10-31.md). Đã xác nhận 20 giải, 37 trận, 39/39 ảnh hiển thị, bảng xếp hạng, điều hướng, fallback ESPN/VPF và trạng thái hai V.League pending. HTTP probe phát hiện `/robots.txt` và `/sitemap.xml` trả 404; homepage có description nhưng thiếu canonical và `og:image` — chuyển sang REL-03.

**Release REL-03/OPS-05 đã deploy production:** Commit `d9fc586` đạt GitHub CI [#41216394295](https://github.com/hoquan2007/sports_247/actions/runs/41216394295) `success`, local **80/80 tests** và 8/8 HTTP smoke. Vercel deployment `dpl_6cdYcXp1QMFT9RbqRadzCcByPEFV` đã **READY** cho `sports247-three.vercel.app`; production HTTP smoke **8/8 PASS**. `/robots.txt`, `/sitemap.xml`, `/opengraph-image` trả **200** đúng MIME; canonical, Open Graph và Twitter trong HTML trỏ đúng site. Synthetic monitor production **PASS**, V.League 1/2 còn `pending`, không gọi video trả phí. Chi tiết bằng chứng và rollback target tại [biên bản release](SPORTS247-RELEASE-REL03-OPS05-2026-10-31.md).

## 2. Sprint kế tiếp — ưu tiên P0 (có thể làm ngay)

| ID | Việc cần làm | Đầu ra và tiêu chí nghiệm thu | Phụ thuộc |
| --- | --- | --- | --- |
| REL-01 | **PR OPEN/DRAFT; CI SUCCESS:** [PR #1](https://github.com/hoquan2007/sports_247/pull/1) từ nhánh tính năng sang `main`; [run #41216394295](https://github.com/hoquan2007/sports_247/actions/runs/41216394295) đã xanh trên `d9fc586`. | Review toàn bộ diff; kiểm tra credentials, bản quyền; chỉ chuyển PR sang ready/merge khi release gate đạt, kiểm CI lại nếu có commit mới. | Review/quyền tài nguyên/OPS-05 |
| REL-02 | **DONE (PRODUCTION CHROME):** Đã QA desktop 1440×900 và mobile 390×844 trên `sports247-three.vercel.app`, bao gồm bảng xếp hạng, modal/watch, bàn phím, filter, ảnh lỗi, hai V.League pending. | 8 ảnh và báo cáo ở `docs/qa/production-2026-10-31/`, [biên bản QA](SPORTS247-PRODUCTION-QA-2026-10-31.md); không tràn ngang, 0 ảnh vỡ, các assertion đều PASS. | Đã đạt |
| REL-03 | **SEO PRODUCTION DONE; PERFORMANCE PENDING:** Canonical, robots, sitemap, ảnh Open Graph 1200×630 có trên production `dpl_6cdYcX...` và trả HTTP 200 đúng định dạng. | Đo Lighthouse mobile/desktop, LCP/CLS, focus/contrast, và kiểm tra lại cache/browser sau release. | Đo Web Vitals |
| OPS-05 | **MONITOR LIVE PROBE PASS; SCHEDULE PENDING:** Script chỉ đọc `/`, `/api/matches`, `/api/standings`; kiểm schema, HTTP, latency, lỗi upstream, `pendingLeagues`. Workflow GitHub Actions cấu hình chạy mỗi 6 giờ và thủ công. | Cron chỉ kích hoạt từ `main` sau merge; cần xác nhận lịch sử chạy thực tế và cấu hình nơi nhận cảnh báo (GitHub Actions failure notifications hoặc dịch vụ tương đương). | Merge sau release gate, vận hành alert |
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

1. **Bây giờ:** REL-02 đã có browser QA production PASS trước release; REL-03 đã deploy và xác minh SEO production. OPS-05 có synthetic probe PASS nhưng cron/alert còn chờ merge `main`. Đo Lighthouse, kiểm browser sau release, cấu hình alert, review PR trước khi quyết định merge. Hoàn tất diễn tập rollback (REL-04).
2. **Song song với P0:** yêu cầu thông tin quyền API-Football cho hai hạng V.League; nếu chưa có key/ID thì duy trì `pendingLeagues` và đường dẫn VPF rõ ràng.
3. **Khi có dữ liệu thật:** VN-01 → VN-02 → DATA-15, đồng thời xử lý quyền logo qua LOGO-10.
4. **Khi có bản quyền phát:** LIVE-01 → LIVE-02 → LIVE-03. Không nhập token trả phí, tự mở market whitelist hoặc phát nguồn không xác minh chỉ để đạt demo.

**Các rủi ro cần theo dõi:** ESPN Site API công khai không cam kết SLA; thiếu V.League credentials; quyền sử dụng logo/stream; ScoreBat có thể tính phí theo request và view; Vercel serverless/multi-region làm khác biệt cache và quota. Khi chưa xử lý hết, dùng trạng thái `partial/pending/unavailable` minh bạch cho người xem.

**Bước triển khai tiếp theo:** đo Lighthouse trên production mới, rà soát quyền logo/video, cấu hình nơi nhận alert khi synthetic monitor thất bại, kiểm tra lần chạy lịch thực tế sau khi workflow về `main`, diễn tập rollback và hoàn thành review PR #1. Không bật video có phí hay merge chỉ dựa vào CI/HTTP smoke.
