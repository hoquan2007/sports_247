# SPORTS247 — đo hiệu năng, giám sát và quy trình xử lý sự cố

Ngày cập nhật: **01/11/2026**. Nhánh làm việc: `codex/sports247-logos-watch-standings`, HEAD trên remote tại thời điểm kiểm tra `1603bad`. Các chỉnh sửa mới vẫn ở working tree.

## 1. Kiểm tra trình duyệt trước khi phát hành

Từ PowerShell trong repo, có thể chạy toàn bộ HTTP smoke, Chrome QA và Chrome lab audit trong cùng một tiến trình:

```powershell
npm run build
npm run qa:local -- --browser --audit
```

Nếu đã mở Next.js server riêng, chạy audit thủ công ở PowerShell khác:

```powershell
$env:SPORTS247_BASE_URL = 'http://127.0.0.1:34133'
npm run audit:browser
```

`scripts/audit-browser.mjs` chạy Chrome headless có sẵn trên Windows và dùng `axe-core` trong devDependencies (cài bằng `npm ci`). Hai cấu hình:

- Desktop 1440×900: CPU và mạng không bóp tốc độ.
- Mobile 390×844: CPU giảm còn một phần tư, mạng mô phỏng 100 ms và 1,6 Mb/s tải xuống.

Kết quả là `temp/sports247-browser-audit.json` (file tạm, không commit), gồm FCP, LCP, CLS, TTFB, bộ nhớ JS, tràn ngang, ngôn ngữ trang, `main`/`h1`, kiểm tra sơ bộ nút/ảnh thiếu nhãn. Sau khi lấy đủ mẫu hiệu năng, script chạy **axe-core WCAG 2.0/2.1 A/AA** và báo `violations` cùng các trường hợp `incomplete` để rà soát thủ công; `violations` làm audit thất bại. Dùng ba lần chạy độc lập mỗi cấu hình và ghi trung vị để so sánh các bản phát hành. **Đây là phép đo trong phòng thử nghiệm**, không phải điểm Lighthouse hoặc Core Web Vitals người dùng thực tế; trình duyệt chạy với reduced motion và dữ liệu từ upstream có thể làm thay đổi kết quả.

Mặc định script đo **3 lần mỗi cấu hình** (`SPORTS247_AUDIT_RUNS=1..5` để đổi số mẫu), tắt cache Chrome, lưu cả mẫu thô, phần tử LCP và giá trị trung vị. Ảnh chụp QA mặc định ghi trong `temp/qa-browser/` để tránh ghi đè chứng cứ đã duyệt trong `docs/qa/`; chỉ ghi nơi khác khi đặt `SPORTS247_QA_OUTPUT_DIR`.

Trước khi đưa lên production, đo thêm Lighthouse mobile/desktop và kiểm bằng bàn phím, trình đọc màn hình, tương phản màu sắc. Mục tiêu tham khảo cho trải nghiệm thực tế: LCP ≤ 2,5 giây; CLS ≤ 0,1. Không đánh dấu đạt tiêu chuẩn truy cập chỉ dựa trên kiểm tra DOM của script.

**Kết quả đã đo ngày 01/11** trên bản build local với Chrome, 3 mẫu/cấu hình, không cache:

| Cấu hình | FCP trung vị | LCP trung vị | CLS trung vị | TTFB trung vị |
| --- | ---: | ---: | ---: | ---: |
| Desktop 1440px trước tối ưu | 228 ms | 228 ms | 0 | 81 ms |
| Mobile 390px trước tối ưu | 1.104 ms | **5.044 ms** | 0 | 66 ms |
| Desktop sau tối ưu | 176 ms | 176 ms | 0 | 58 ms |
| Mobile sau tối ưu | 792 ms | **3.228 ms** | 0 | 31 ms |
| Desktop kiểm tra cuối đợt | 184 ms | **184 ms** | 0 | 61 ms |
| Mobile kiểm tra cuối đợt | 1.168 ms | **2.256 ms** | 0 | 60 ms |
| Desktop lượt bổ sung trước tối ưu priority | 164 ms | **164 ms** | 0 | — |
| Mobile lượt bổ sung trước tối ưu priority | 900 ms | **2.964 ms** | 0 | — |
| Desktop sau ưu tiên ảnh phụ thấp | 168 ms | **168 ms** | 0 | 56 ms |
| Mobile sau ưu tiên ảnh phụ thấp | 1.064 ms | **2.364 ms** | 0 | 60 ms |

Mobile LCP trong lần đo trước tối ưu giảm khoảng **36%** sau khi mở kết nối sớm tới `a.espncdn.com` và ưu tiên tải logo của trận nổi bật. Phần tử LCP mobile là logo đội bóng dạng ảnh PNG ESPN 500px. Thử đường dẫn `/100/` và `/200/` cho một logo thực tế đều trả HTTP 404, nên **không thay đổi đường dẫn sang kích cỡ chưa được nguồn hỗ trợ**. Trong đợt cuối, mobile LCP trung vị là **2.256 ms** (dưới mốc tham khảo 2,5 giây), nhưng lần đo trước đó là **2.384 ms**, và một lần đo riêng lẻ đạt **2.692 ms**. Các phép đo bị ảnh hưởng bởi mạng/CDN và mẫu trận nổi bật; chưa thể quy khác biệt cho sửa đổi ARIA. Cần Lighthouse và đánh giá tối ưu tài nguyên ảnh có quyền sử dụng trước release. Số đo chỉ phản ánh máy local, mạng/CPU mô phỏng và một thời điểm dữ liệu cụ thể.

**Trợ năng đã xác minh:** audit đầu tiên phát hiện hai lỗi axe (tương phản chữ ở giải đấu được chọn và nhãn nút yêu thích ở mobile), đã sửa. Trong bản cuối, axe-core có **0 violations**, `aria-prohibited-attr` không còn trường hợp chưa kết luận sau khi bổ sung vai trò nhóm điều khiển. QA tự động thêm kiểm tra bẫy tiêu điểm Shift+Tab/Tab, mũi tên chuyển tab, Escape và trả tiêu điểm cho nút mở; tất cả PASS. Còn **24 desktop/21 mobile** phần tử `color-contrast` ở trạng thái `incomplete` do **nền chuyển sắc**, vì vậy cần kiểm tra tương phản bằng mắt và công cụ phù hợp với từng vùng gradient; axe PASS không có nghĩa là hoàn tất WCAG. Cần tiếp tục kiểm thử bằng bàn phím thực và trình đọc màn hình.

**Cải tiến audit tiếp theo:** `accessibility.<desktop|mobile>.incomplete[].review` trong JSON hiện ghi **toàn bộ** selector chưa kết luận cùng màu chữ, cỡ/chữ đậm và các lớp nền từ element tới tổ tiên có background, thay vì chỉ hiển thị 8 ví dụ. Dùng danh sách đầy đủ này để đối chiếu ảnh và đo tỷ lệ tương phản ở vùng gradient tối/sáng nhất; dữ liệu CSS chỉ hỗ trợ rà soát và không phải kết quả đo tương phản thực tế.

**Đối chiếu pixel bổ sung lúc 17:54 GMT+7:** `contrastReview.<desktop|mobile>` hiện lấy ảnh chụp toàn trang Chrome ở trạng thái nền chữ không còn mực, rồi so màu foreground với các pixel nằm trong hình chữ nhật của text node. Script ẩn mascot và chấm xanh trạng thái ở footer trong lúc đo để chúng không bị nhầm thành nền chữ; khôi phục trạng thái sau khi đo. Kết quả **24/24 vùng desktop** và **21/21 vùng mobile** đạt ngưỡng 4,5:1 cho chữ thường, 3:1 cho chữ lớn; **0 needs-review, 0 not-measured** trong lần chạy này. Axe vẫn có thể ghi các mục gradient vào `incomplete` vì chính axe không suy ra màu nền. Đây là **bằng chứng kiểm tra pixel cho một trạng thái render local**, chưa xác minh mọi trạng thái/thiết bị và chưa thay thế đánh giá WCAG chính thức. Nếu mascot thực tế che chữ, phép đo tạm ẩn mascot sẽ không phát hiện; kiểm tra collision riêng của Chrome QA đã PASS.

**Lượt đo hiệu năng mới:** giảm độ ưu tiên tải logo ngoài spotlight bằng `fetchPriority="low"`, giữ `high` cho logo spotlight. 3 mẫu mới có desktop FCP/LCP **168/168 ms**, mobile FCP/LCP **1.064/2.364 ms**, CLS **0**. Lượt ngay trước có mobile LCP **2.964 ms**; vì CDN, ảnh LCP và mạng dao động, mức chênh này chỉ là quan sát, chưa thể khẳng định thay đổi priority gây giảm LCP. `npm run check` PASS với **83/83 tests**, `npm run qa:local -- --browser --audit` PASS gồm **8/8 HTTP**, QA 1440/390/320px, axe và contrast review. Lighthouse hiện không có trong bộ công cụ local; chưa thể cung cấp điểm Lighthouse. JSON mới nhất: `temp/sports247-browser-audit.json`.

## 2. Giám sát và thông báo thất bại

`.github/workflows/production-monitor.yml` chạy vào phút 17 của các giờ 00, 06, 12, 18 UTC, và có `workflow_dispatch` để thử thủ công. GitHub Actions chỉ chạy `schedule` từ **nhánh mặc định**; hiện workflow trên nhánh tính năng, nên chưa thể xác nhận cron.

Mỗi lượt gọi chỉ đọc `/`, `/api/matches` và `/api/standings`; `SPORTS247_MONITOR_FAIL_ON_PARTIAL=1` biến dữ liệu ESPN lỗi một phần thành job failure. Workflow hiện lưu:

1. Job summary với kết quả từng probe, thời gian, lỗi và cảnh báo.
2. `::error` để hiển thị lỗi rõ trên GitHub Actions.
3. File JSON đính kèm dưới tên `sports247-monitor-failure` trong 7 ngày khi job thất bại.

**Đã bổ sung xử lý lỗi khởi tạo:** URL không hợp lệ, origin không dùng HTTPS hoặc ngưỡng thời gian sai cũng trả mã thoát 1, đồng thời tạo JSON `FAIL`, GitHub step summary và `::error` tương tự lỗi từ endpoint. Bài kiểm thử CLI khởi chạy tiến trình Node thật, không gọi mạng, rồi kiểm tra ba đầu ra này. Nếu chính đường dẫn ghi artifact/summary không thể truy cập, monitor báo lỗi ghi báo cáo trên stderr và thoát 1; GitHub runner cần cấp quyền ghi vào các đường dẫn cấu hình.

**Nơi nhận thông báo:** dùng hệ thống thông báo GitHub Actions của tài khoản tạo/cập nhật lịch workflow; tài khoản đó cần bật thông báo cho workflow thất bại qua web hoặc email. Sau khi merge vào `main`, chạy `workflow_dispatch`, kiểm tra **Actions → SPORTS247 production monitor → Summary / Artifacts**, và xác nhận tài khoản thực tế nhận một thông báo lỗi được thử nghiệm có kiểm soát trước khi coi alert hoàn thành. Chưa cấu hình người nhận ngoài GitHub, chưa diễn tập notification thật.

Để kiểm thủ công trên môi trường có internet:

```powershell
$env:SPORTS247_BASE_URL = 'https://sports247-three.vercel.app'
$env:SPORTS247_MONITOR_FAIL_ON_PARTIAL = '1'
$env:SPORTS247_MONITOR_REPORT = 'temp/monitor-production.json'
npm run monitor:production
```

**Xác minh production qua kết nối Vercel ngày 01/11:** `/`, `/api/matches?date=2026-11-01`, `/api/standings?league=eng.1`, `/robots.txt`, `/sitemap.xml` đều trả HTTP 200 và kiểu nội dung phù hợp; trận đấu và bảng xếp hạng có dữ liệu. Vercel báo không có runtime error trong 24 giờ trước thời điểm kiểm tra. Đây là các lần đọc endpoint qua Vercel, **chưa tương đương một lần chạy `npm run monitor:production` thành công từ GitHub Actions**; lệnh monitor trực tiếp trong môi trường Codex trước đó gặp `fetch failed` do đường mạng. GitHub cron và thông báo thất bại vẫn chưa được diễn tập trên `main`.

## 3. Thủ tục rollback trên Vercel (chưa thực hiện trên production)

Trạng thái xác minh ngày **01/11/2026** qua Vercel: domain `sports247-three.vercel.app` trỏ tới deployment **READY** `dpl_8xrRgAjAYYwJkcBsE9agPuaPZ3ky`, git source `1603bad`. Một deployment READY cũ hơn là `dpl_5n7TW5qoFLunFe9c7LGEJTCtqW4o` (source `a496f0b`). Luôn kiểm tra lại trạng thái ngay trước sự cố vì deployment có thể thay đổi.

**Kiểm tra chỉ đọc bổ sung ngày 01/11, sau 17:54 GMT+7:** Vercel xác nhận alias `sports247-three.vercel.app` đang phục vụ `dpl_8xrRgAjAYYwJkcBsE9agPuaPZ3ky` (READY, `1603bad`). Danh sách deployment `target=production` sắp xếp mới nhất trước cho thấy bản liền trước là **`dpl_5n7TW5qoFLunFe9c7LGEJTCtqW4o`** (READY, `a496f0b`); API đánh dấu cả bản hiện tại và bản liền trước `isRollbackCandidate=true`. Đây là **ứng viên rollback được đối chiếu ở thời điểm này**, chưa thực thi rollback và chưa xác nhận cách CLI chọn đích khi có các bản phát hành mới. Mọi thao tác đổi traffic production tiếp tục cần phê duyệt cho bản đích cụ thể và kiểm chứng lại trạng thái ngay trước khi thực hiện.

Diễn tập khô, chỉ đọc thông tin (không thay đổi tên miền):

```powershell
vercel list --prod
vercel inspect https://sports247-three.vercel.app
vercel rollback status
```

Đối chiếu deployment đang nhận traffic, SHA, domain, phiên bản liền trước và commit liên quan với biên bản. Chỉ làm rollback thật khi đã xác nhận sự cố và chọn đúng deployment phù hợp:

```powershell
vercel logs --environment production --status-code 5xx --since 30m
vercel rollback
vercel rollback status
```

Sau rollback, chạy smoke và monitor trên domain thật, kiểm luồng browser, theo dõi lỗi runtime. Trên Vercel Hobby, `vercel rollback` chỉ quay về **deployment production ngay trước đó**, không chọn tùy ý bản cũ. Rollback có thể khôi phục cấu hình cũ, và có thể tạm ngừng việc tự gán domain production khi push commit mới. Khi muốn quay lại phát hành tự động, xem lịch sử deployment rồi dùng `vercel promote <deployment-id-or-url>` với bản đã được xác minh để khôi phục gán domain; xác nhận lại bằng `vercel inspect` và HTTP smoke.

**Cảnh báo:** chưa diễn tập rollback thực tế vì việc đó đổi traffic production; hướng dẫn này chỉ thực hiện ở mức runbook. Không thực hiện rollback theo suy đoán từ môi trường Codex mất kết nối.

## 4. Cửa phát hành tiếp theo

- Review diff PR #1 và quyền logo/nguồn dữ liệu; GitHub Actions run `41288610750` đã **SUCCESS** cho remote SHA `1603bad`; cần CI mới cho mọi SHA được push sau đây.
- `npm run check` và `npm run qa:local -- --browser --audit` đã PASS sau thay đổi trên runner local (**83 tests**, HTTP 8/8, desktop/mobile/compact QA, axe 0 violations, kiểm chứng pixel gradient desktop 24/24 và mobile 21/21); bổ sung Lighthouse, kiểm contrast ở production và trình đọc màn hình.
- Vercel preview chạy đúng commit, production synthetic monitor PASS và có bài thử GitHub Actions notification; ghi deployment ID ↔ SHA ↔ domain.
- Xác minh quyền dùng API-Football cho V.League 1/2 và quyền nhúng nguồn live trước khi công bố dữ liệu/video thật; giữ trạng thái pending khi thiếu quyền hoặc khóa.

Giữ PR ở trạng thái draft cho tới khi các điểm phát hành phù hợp được xác minh. Các thay đổi hiện tại chỉ ở working tree; chưa push/merge/deploy.
