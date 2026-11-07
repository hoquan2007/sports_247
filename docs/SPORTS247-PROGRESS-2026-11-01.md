# SPORTS247 — Tiến độ và bước phát triển tiếp theo

Ngày kiểm tra: **01/11/2026**. Phạm vi: source code tại `D:\sports_247`, branch `codex/sports247-logos-watch-standings`, kiểm thử local và xác minh production qua Vercel/GitHub.

## Hiện trạng

| Hạng mục | Đánh giá và bằng chứng | Việc còn lại |
| --- | --- | --- |
| Trận đấu và kết quả | Hỗ trợ 20 giải (18 ESPN và 2 V.League), lịch theo ngày, trực tiếp, chi tiết trận, tìm kiếm, lọc và lưu yêu thích. Polling 90 giây khi tab mở. | Theo dõi chất lượng dữ liệu upstream và cập nhật thông báo khi gián đoạn. |
| Bảng xếp hạng | Có bảng rút gọn và mở rộng; đã kiểm tra trên desktop/mobile/320px. | Đối soát số liệu từng giải khi upstream thay đổi. |
| Giao diện | Chrome local QA PASS ở 1440px, 390px, 320px: điều hướng, mascot, dialog, bảng xếp hạng, bàn phím, phục hồi kết nối và fallback ảnh; axe 0 violations. Đã đo pixel nền gradient: desktop 24/24, mobile 21/21 vùng đạt ngưỡng trong lượt lab. | Lighthouse/Web Vitals thực tế, trình đọc màn hình và kiểm tra tương phản trên production. |
| Dữ liệu Việt Nam | Hai giải `vie.1` và `vie.2` đang ở trạng thái **pending** vì chưa có credentials/ID nguồn dữ liệu thực. Có liên kết tham khảo lịch từ VPF. | Xin quyền sử dụng API, xác thực league ID và so sánh lịch với VPF. |
| Video | Có luồng kiểm soát quyền nhúng và trạng thái chưa cấu hình, các test kiểm tra đúng trận và lãnh thổ. | Cần chứng minh quyền phát/nhúng và thử một trận được cấp phép thực tế. |
| Chất lượng và vận hành | **83/83 tests** ở lượt kiểm tra mới nhất, lint, typecheck, build; HTTP smoke local 8/8; Chrome QA 1440/390/320px; endpoint production HTTP 200 và Vercel không báo lỗi runtime trong 24 giờ ở lần kiểm tra trước. | Đo Lighthouse thực tế; kiểm lịch cron và thông báo lỗi khi workflow vào `main`; diễn tập rollback có kiểm soát. |

## Đã triển khai trên nhánh làm việc ngày 01/11

- Tự động tải lại khi tab trở lại trạng thái hiển thị hoặc mạng kết nối lại, bên cạnh chu kỳ 90 giây.
- Chặn các yêu cầu polling chồng chéo; khi người xem làm mới thủ công thì hủy yêu cầu cũ và bỏ qua dữ liệu lỗi thời.
- Hủy và vô hiệu hóa yêu cầu khi mất mạng, giải phóng trạng thái tải để lần kết nối tiếp theo phục hồi ngay cả khi yêu cầu trước chưa hoàn tất.
- Hiển thị trạng thái cập nhật gián đoạn, dấu thời gian dữ liệu gần nhất (nếu đúng ngày đã chọn), và nút **Thử lại**. Nút refresh có tín hiệu đang tải và vùng thông báo hỗ trợ trình đọc màn hình.
- Mở rộng `scripts/qa-browser.mjs` để kiểm thử tự phục hồi sau sự kiện offline/online và nút thử lại khi API lỗi.

Các thay đổi này là **local**: chưa commit, push, merge hoặc deploy theo đợt này. Tài liệu/ảnh QA người dùng đang chỉnh sửa được giữ nguyên.

**Kiểm chứng hoàn tất (01/11):** `npm run lint` PASS, `npm run typecheck` PASS, `npm run test` **80/80 PASS**, `npm run build` PASS; `npm run qa:local -- --browser` gồm HTTP smoke **8/8 PASS**, Chrome QA desktop 1440px/mobile 390px/compact 320px PASS. Kịch bản offline → online và lỗi API → bấm **Thử lại** đều PASS. 14 ảnh QA được ghi riêng tại `temp/qa-refresh-2026-11-01/` để tránh thay đổi các ảnh trong `docs/qa/`.

**Tiếp tục đợt vận hành (01/11):** Thêm Chrome lab audit `npm run audit:browser` để thu FCP/LCP/CLS/TTFB, phần tử LCP, phát hiện tràn ngang/nhãn thiếu và báo trung vị 3 lần đo; nâng cấp synthetic monitor viết GitHub Actions summary và đính kèm JSON khi lỗi; bổ sung [runbook hiệu năng, cảnh báo và rollback](SPORTS247-OPS-PERFORMANCE-2026-11-01.md). Đã chạy `npm run check`: **81/81 tests**, lint/typecheck và **production build PASS**. `npm run qa:local -- --browser --audit` có HTTP smoke **8/8**, QA desktop/mobile/320px và Chrome audit **PASS**. Ảnh kiểm tra mới lưu tại `temp/qa-browser/`, không ghi đè ảnh đang được lưu trong `docs/qa/`.

**Hiệu năng:** đo 3 lần mỗi cấu hình với cache Chrome tắt cho thấy mobile 390px mô phỏng CPU 4×/mạng 1,6 Mbps có LCP trung vị **5.044 → 3.228 ms** sau khi ưu tiên tải hai logo trận nổi bật và preconnect ESPN (giảm ~36%); desktop LCP **228 → 176 ms**, CLS bằng 0. Mobile vẫn chưa đạt mốc tham khảo 2,5 giây; phép đo này không thay thế Lighthouse/field Core Web Vitals. Phần tử LCP là logo đội bóng tải từ CDN ESPN.

**Bổ sung kiểm chứng cuối đợt (01/11):** tích hợp kiểm tra axe-core WCAG 2.0/2.1 A/AA vào Chrome lab audit, sau khi đo hiệu năng để không làm lệch mẫu. Audit ban đầu phát hiện hai vấn đề: nhãn nút **Đã lưu** bị ẩn trên mobile và màu số lượng giải đang chọn có độ tương phản 4,33:1, dưới mức 4,5:1. Đã sửa nhãn nút và màu chữ; hai nhóm điều khiển ticker và trận nổi bật được thêm `role="group"` sau khi axe chỉ ra nhãn ARIA thiếu vai trò. QA bổ sung thao tác **Shift+Tab / Tab**, chuyển tab bằng **ArrowRight**, **Escape** và trả tiêu điểm về nút mở hộp thoại.

Sau thay đổi, **`npm run check` PASS (81/81 tests, lint, typecheck, production build)**; **`npm run qa:local -- --browser --audit` PASS** với HTTP smoke **8/8**, Chrome QA 1440/390/320px, phục hồi offline/online/retry, CDN fallback và kiểm tra bàn phím. Axe báo **0 violations** trên desktop/mobile, `aria-prohibited-attr` không còn trong `incomplete`. Còn **24 desktop/21 mobile** phần tử có độ tương phản **chưa xác định tự động** do nền gradient: phải đánh giá trực quan hoặc đo theo vùng ảnh thực tế trước release, chưa đủ cơ sở xác nhận đạt toàn bộ WCAG.

Đợt đo Chrome lab cuối (**3 mẫu/cấu hình, cache tắt**) đạt desktop FCP/LCP **184/184 ms**, mobile FCP/LCP **1.168/2.256 ms**, CLS **0** ở cả hai. Mobile LCP thấp hơn mốc tham khảo **2,5 giây trong đợt lab này**, nhưng còn phụ thuộc tốc độ ảnh CDN và chưa có Lighthouse/field CWV. Mẫu trước đó đạt mobile LCP **2.384 ms**, mẫu đơn lẻ lần kiểm tra ARIA đạt **2.692 ms**; tránh coi sự khác biệt theo lần tải ảnh là hiệu quả của việc sửa trợ năng. Báo cáo máy đọc được: `temp/sports247-browser-audit.json`.

`npm run audit:readiness` ngày 01/11 xác nhận môi trường local **chưa có `.env.local`**: tích hợp V.League, ScoreBat, giới hạn credits chung và nguồn YouTube được ủy quyền đều `disabled`. Các phần phụ thuộc quyền và credentials tiếp tục ở trạng thái chờ.

**Lượt nghiệm thu local mới nhất (01/11, 17:54 GMT+7):** sau khi đặt `fetchPriority="low"` cho logo đội không nằm trong spotlight và duy trì `high` cho ảnh nổi bật, `npm run check` **PASS (83/83 tests, lint, typecheck và production build)**. `npm run qa:local -- --browser --audit` **exit 0**: HTTP smoke **8/8**, Chrome QA 1440/390/320px PASS, mascot/khả năng dùng phím/đóng modal/phục hồi offline-online/nút thử lại/fallback CDN PASS; axe **0 violations** desktop và mobile. Audit lấy ảnh toàn trang khi ẩn lớp chữ và hai yếu tố trang trí có thể che pixel nền, đo độ tương phản thấp nhất trong phạm vi từng vùng chữ: **desktop 24/24 PASS**, **mobile 21/21 PASS**, **0 vùng cần đánh giá lại và 0 vùng không đo được** trong lần chạy này. Kỹ thuật đo có giới hạn với trạng thái hover, thay đổi dữ liệu, thiết bị, logo/mascot che khuất và kỹ thuật khử răng cưa; đây **không phải chứng nhận WCAG** và chưa thay thế thử nghiệm người dùng với trình đọc màn hình.

**Số đo lần chạy 17:54 (3 mẫu mỗi cấu hình, cache tắt):** desktop FCP/LCP **168/168 ms**, mobile FCP/LCP **1.064/2.364 ms**, CLS **0** ở cả hai. Lượt sát trước cho mobile LCP **2.964 ms**; thay đổi giữa lượt đo không đủ chứng minh `fetchPriority=low` là nguyên nhân vì phần tử LCP đến từ CDN ESPN và điều kiện mạng/ảnh biến thiên. File chứng cứ JSON ở `temp/sports247-browser-audit.json` (tạm, không commit). Chưa cài Lighthouse trong workspace nên **không có điểm Lighthouse** để báo cáo.

**Bổ sung đợt cuối:** synthetic monitor giờ tạo chẩn đoán `FAIL` cả khi sai HTTPS/origin hoặc ngưỡng thời gian, có bài test CLI xác minh JSON, GitHub summary và error annotation. Chrome axe audit lưu đầy đủ selector/foreground/các lớp nền của mọi mục `incomplete`, giúp đánh giá thủ công từng vùng gradient có bằng chứng hơn. Điều này **chưa** xác nhận độ tương phản thực tế trên nền chuyển sắc.

Khi đối chiếu CSS của vùng spotlight, các dòng phụ dùng màu `#b1c7b7` hoặc `#91a79a` có tương phản ước tính lần lượt **3,98:1** và **2,79:1** trên nền sáng có thể xuất hiện từ lớp gradient `rgb(39,99,63)`. Đã tăng màu chữ phụ thành `#dcefe5` (**5,86:1 trên nền tham chiếu này**) và làm sáng kicker phần kết quả. Các phép tính dựa trên một màu nền tham chiếu, **không** thay thế kiểm tra pixel vùng gradient hoặc kết luận WCAG.

## Kế hoạch ưu tiên

| Ưu tiên | Công việc | Tiêu chí hoàn thành |
| --- | --- | --- |
| **P0 — hoàn tất local** | Chạy lại lint, TypeScript, toàn bộ test, production build, HTTP smoke và browser QA có kiểm thử offline/online/retry. | **PASS 01/11**; không có hồi quy desktop/mobile/320px. |
| **P0 — trước release** | Đo Lighthouse mobile/desktop; kiểm lại tương phản nền gradient trên production, focus bằng trình đọc màn hình và crawler; rà soát PR draft #1 và CI của commit mới. | QA bàn phím/axe và phép đo pixel gradient local PASS; còn Lighthouse, xác nhận thực địa và CI đúng SHA mới. |
| **P0 — vận hành** | Xác nhận lịch chạy GitHub Actions monitor, nơi nhận cảnh báo thất bại và diễn tập rollback. | Có lần chạy cron/cảnh báo và rollback được ghi bằng chứng. Cron phụ thuộc workflow ở default branch. |
| **P1 — dữ liệu** | Xin API key có quyền sử dụng cho V.League, league IDs mùa hiện tại và quota; đối soát với VPF; kiểm quyền logo. | Ít nhất một vòng đấu hai giải khớp tên đội, thời gian, tỷ số và trạng thái. |
| **P2 — livestream** | Xác minh hợp đồng nhúng phát sóng theo trận, lãnh thổ, thời hạn; cấu hình budget, credentials server-only và chạy E2E. | Một trận được cấp phép phát đúng người xem, đúng thời gian và có giám sát chi phí. |

## Trạng thái phát hành đã biết

Kiểm tra lại ngày **01/11/2026**: domain `https://sports247-three.vercel.app` đang trỏ tới deployment Vercel **READY** `dpl_8xrRgAjAYYwJkcBsE9agPuaPZ3ky` (source `1603bad`). HTTP 200 đã được xác nhận qua Vercel ở trang chủ, matches, standings, robots và sitemap; không có runtime error 24 giờ. GitHub Actions run `41288610750` cho SHA `1603bad` **SUCCESS**. PR #1 vẫn **DRAFT**, `main` ở `2f2684c` tại thời điểm xác minh; code mới chỉnh trong working tree **chưa có CI theo SHA mới**. Workflow cron monitor chỉ có lịch thực tế khi được đưa lên nhánh mặc định, nên chưa xác nhận nhận thông báo lỗi.

Chặn release nếu còn thiếu quyền sử dụng dữ liệu/video/ảnh tương ứng với tính năng dự kiến đưa lên production. Không dùng video mẫu hoặc fixture giả để công bố hai V.League đã có dữ liệu thực.
