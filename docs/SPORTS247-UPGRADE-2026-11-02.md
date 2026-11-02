# SPORTS247 — Rà soát mã nguồn và kế hoạch nâng cấp ngày 02/11/2026

**Workspace:** `D:\sports_247`
**Nhánh làm việc:** `codex/sports247-logos-watch-standings`
**Phạm vi:** kiểm tra code, sửa lỗi ổn định, UX khi nguồn chưa có lịch, kiểm thử cục bộ và điều kiện phát hành. Tài liệu này theo dõi riêng các công việc cần tài khoản, dữ liệu thật, quyền tái sử dụng và môi trường production.

## 1. Phạm vi rà soát và kiến trúc

| Khu vực | Thành phần và kết luận chính |
| --- | --- |
| Ứng dụng | Next.js 16.3.5 App Router, React 19, TypeScript; trang server tại `src/app/page.tsx`, giao diện tương tác tại `src/components/match-center.tsx`. |
| Nguồn dữ liệu | 18 giải từ ESPN; hai giải V.League qua adapter cấu hình API-Football; các adapter OpenLigaDB và thông tin bổ sung trận đấu. Tổng cộng 20 giải trong danh mục. |
| API | `src/app/api/matches`, `match-details`, `standings`, `watch`; xác thực đầu vào, trạng thái lỗi và cache phù hợp theo từng nguồn. |
| Client | Chọn ngày, giải, trạng thái, tìm kiếm, yêu thích, dialog chi tiết, BXH, cập nhật định kỳ và phục hồi khi trực tuyến trở lại. |
| Video | `src/lib/football/watch.ts`, ScoreBat, YouTube được ủy quyền, kiểm tra trận, khu vực và ngân sách. Không đủ điều kiện để xác nhận có livestream thật nếu thiếu quyền và credentials. |
| Trình bày | `src/app/sports.css`, Animate UI/GSAP, fallback logo, hiển thị desktop 1440px, mobile 390px và màn hình hẹp 320px. |
| SEO/vận hành | Metadata, sitemap, robots, Open Graph, CI, synthetic monitor, QA HTTP/browser, Lighthouse/Chrome lab. |
| Kiểm thử | Node unit tests trong `tests/`, eslint, TypeScript, webpack production build, HTTP smoke và kiểm thử Chrome trong `scripts/`. |

### Rủi ro cần xử lý theo thứ tự

1. **P0 — dữ liệu một phần hoặc lỗi:** API có thể thất bại riêng từng giải hoặc toàn bộ SSR. Trang cần phân biệt sự cố cập nhật với ngày không có trận, bảo toàn dữ liệu cũ đúng phạm vi và cho phép thử lại.
2. **P0 — trạng thái client:** polling, chuyển ngày và mở/đóng dialog có thể gây phản hồi lỗi thời hoặc cập nhật khi thành phần đã đóng; localStorage có thể chứa JSON hỏng hoặc bị trình duyệt chặn.
3. **P0 — thông báo V.League:** hai giải chưa có cấu hình dữ liệu thật phải hiển thị thông tin chính xác khi rỗng và chỉ dẫn tới lịch do VPF công bố.
4. **P1 — dữ liệu và tài sản:** API-Football cần key, league ID hợp lệ, quota và đối soát với VPF. Logo lấy từ các bên khác cần kiểm tra quyền sử dụng.
5. **P1 — vận hành:** monitoring, nguồn cảnh báo, hành vi khi lệch kết quả upstream, điều kiện rollback và kết quả QA trên đúng bản triển khai vẫn cần bằng chứng sau release.
6. **P2 — video:** nguồn nhúng cần hợp đồng theo giải, trận, thị trường và thời gian; không tự động bật phát sóng khi không có quyền.

## 2. Kế hoạch nâng cấp và tiến độ thực thi

| ID | Ưu tiên | Hạng mục | Trạng thái code | Điều kiện nghiệm thu |
| --- | --- | --- | --- | --- |
| STAB-01 | P0 | SSR trả về feed unavailable đúng cấu trúc khi tổng hợp lỗi | Hoàn thành | Unit test và trang vẫn render sau lỗi. |
| STAB-02 | P0 | Hủy request cũ, chặn phản hồi sai ngày/trận, xử lý đóng dialog, offline/online và retry | Hoàn thành | Kiểm tra lint, typecheck, browser recovery/retry. |
| STAB-03 | P0 | Đọc/ghi Favorites an toàn khi storage hỏng hoặc bị chặn | Hoàn thành | Unit test dữ liệu lỗi, browser không crash. |
| STAB-04 | P0 | Hiển thị feed lỗi một phần, giữ dữ liệu hợp lệ theo giải, có retry và dấu thời gian | Hoàn thành | Unit test reconcile, kiểm tra giao diện. |
| UX-01 | P0 | Trạng thái rỗng riêng cho giải Việt Nam đang chờ lịch, link VPF | Hoàn thành | Browser QA chọn từng giải ở ba viewport, kiểm tra link/trạng thái khi không có trận. |
| TEST-01 | P0 | Unit test SSR/Favorites/feed và dữ liệu upstream | Hoàn thành | Toàn bộ `npm test` thành công. |
| TEST-02 | P0 | Chạy lại lint, typecheck, unit test, build, HTTP/browser QA sau UX-01 | Hoàn thành trên local | Mọi quality gate exit 0, gồm Chrome 1440/390/320px. |
| DOC-01 | P0 | Lập sổ theo dõi audit, rủi ro, bằng chứng và điều kiện release | Hoàn thành | Tài liệu này cập nhật theo kết quả kiểm tra cuối. |
| PERF-02 | P1 | Giảm ảnh logo ESPN quá lớn tại danh sách trận và spotlight | Hoàn thành trên local | Ảnh chuyển sang kích thước theo vị trí; unit test, Chrome QA và lab LCP xác nhận. |
| DATA-01 | P1 | Cung cấp và đối soát V.League 1/2 theo một vòng đấu thực | Chờ bên ngoài | API key, hai mã giải, dữ liệu thật, quyền sử dụng, thời điểm và kết quả khớp VPF. |
| DATA-02 | P1 | Giám sát độ phủ và chất lượng từng nguồn | Đã có audit trong code, chờ production | Có log/đối chiếu nhiều ngày và cảnh báo khi upstream suy giảm. |
| LOGO-01 | P1 | Kiểm tra quyền tái sử dụng logo ESPN/VPF | Chờ bên ngoài | Chấp thuận hoặc tài sản thay thế có quyền dùng. |
| PERF-01 | P1 | Lighthouse và Core Web Vitals của phiên bản phát hành | Chờ production | Đo đúng deployment, có điều kiện máy/mạng và lưu báo cáo. |
| OPS-01 | P1 | Xác nhận monitor cron, gửi alert và rollback | Chờ production | Chứng cứ cron chạy, cảnh báo đến nơi nhận và thao tác khôi phục có kiểm soát. |
| LIVE-01 | P2 | Thử livestream được cấp phép trên production | Chờ bên ngoài | Hợp đồng, key, quyền thị trường, trận live, ngân sách, E2E thực tế. |

Các mục **chờ bên ngoài/chờ production** không thể coi là hoàn tất chỉ bằng thay đổi mã. Không dùng lịch hoặc video giả để che thiếu dữ liệu được cấp phép.

## 3. Các thay đổi code trong đợt nâng cấp

- `src/lib/football/unavailable-feed.ts` và `src/app/page.tsx`: dựng feed không khả dụng có cấu trúc khi SSR thất bại; `tests/unavailable-feed.test.mjs` kiểm tra dữ liệu trả về.
- `src/components/match-center.tsx`: quản lý lifecycle của request, cập nhật khi online, trạng thái cập nhật gián đoạn/thử lại, trạng thái V.League pending kèm liên kết VPF; `src/app/sports.css` bổ sung giao diện liên kết.
- `src/lib/football/favorites.ts` và `tests/favorites.test.mjs`: chuẩn hóa Favorites và trường hợp trình duyệt từ chối storage.
- `scripts/qa-browser.mjs`: xác nhận chọn V.League 1/2; khi giải không có trận, kiểm tra thông báo chưa có lịch và liên kết VPF an toàn ở từng độ rộng màn hình.
- `src/lib/football/team-logo.ts` và `src/components/match-center.tsx`: chỉ thu nhỏ ảnh logo ESPN có URL chuẩn về 64px cho danh sách và tối đa 208px cho spotlight qua ESPN combiner; giữ fallback khi nguồn ảnh lỗi. `tests/team-logo.test.mjs` kiểm tra URL đủ điều kiện và URL không được tự ý biến đổi.
- Các công việc liên quan mascot, logo, performance và monitoring có thay đổi sẵn trong working tree; giữ nguyên, không tự động đưa tất cả vào cùng một commit.

## 4. Bằng chứng kiểm thử

Lượt kiểm tra cuối sau UX-01 và PERF-02 ghi nhận **89/89 unit tests, ESLint, TypeScript, production build, HTTP smoke 8/8 và Chrome QA desktop/mobile/320px đều PASS**. Kịch bản đã bao gồm khôi phục kết nối, retry, bảng xếp hạng, modal/phím, mascot, logo fallback khi CDN bị chặn và hai giải V.League chưa được cấu hình.

**Bảng kiểm cuối ngày 02/11/2026** (kết quả từ các lệnh đã chạy, exit code 0):

| Lệnh | Kết quả ngày 02/11/2026 |
| --- | --- |
| `npm run lint` | PASS qua `npm run check` |
| `npm run typecheck` | PASS qua `npm run check` |
| `npm test` | PASS, **89/89** qua `npm run check` |
| `npm run build` | PASS, Next.js production webpack build qua `npm run check` |
| `npm run qa:local -- --browser` | PASS, HTTP **8/8**, Chrome **1440/390/320px** và trường hợp chặn CDN/VPF |
| `npm run qa:local -- --audit` | PASS, Chrome lab hiệu năng và axe-core |
| `npm run qa:local -- --data` | PASS, kiểm tra 18 trận ngày 02/11/2026; không trùng ID, không giải lạ |
| `npm run audit:logos` | PASS, **20/20** logo giải (bao gồm 2 V.League) trả ảnh hợp lệ qua CDN |
| `npm run audit:readiness` | PASS, trạng thái cấu hình được báo rõ; nguồn V.League/video/budget chưa bật |
| `git diff --check` | PASS; Git chỉ báo chuyển đổi LF/CRLF trong working tree |

Lab Chrome với điều kiện giả lập mobile CPU 4x, 100ms latency, download 1.6 Mbps ghi nhận **LCP trung vị cải thiện từ 9.184ms xuống 1.868ms** (~79,7%), FCP trung vị **720ms**, CLS **0** sau khi thu nhỏ crest ESPN. Desktop lab có LCP trung vị **224ms**, CLS **0**. Đây là kết quả chạy local, không thay thế số liệu Core Web Vitals từ người dùng thật hoặc đo trên production. Axe-core không ghi nhận vi phạm chắc chắn; bộ đánh giá tương phản còn **2 trường hợp desktop và 12 trường hợp mobile cần đánh giá thủ công**, phần lớn ở lớp chữ động trang trí.

Chrome QA đã xác nhận **36/36 ảnh hiển thị tải thành công** ở mỗi viewport, không tràn chiều ngang mobile/320px; khi chặn nguồn ESPN/VPF, ảnh rơi về logo dự phòng, không còn ảnh lỗi. Chạy QA trong môi trường có thể kết nối loopback `127.0.0.1`; cả hai lượt `--browser` và `--audit` đều kết thúc exit 0.

**Đối soát dữ liệu mẫu ngày 02/11/2026:** API có 18 trận trong các giải đã khai báo, không trùng mã trận, không xuất hiện mã giải lạ, không ghi nhận nguồn thất bại trong lần lấy mẫu này. Tổng danh mục 20 giải, 18 giải đã kết nối và `vie.1`/`vie.2` đang chờ cấu hình nguồn. ESPN chưa cấp logo cho **4 lượt xuất hiện của đội bóng** thuộc AFC Champions League Elite và chưa có trường đơn vị phát sóng của **7 trận** (3 Primeira Liga, 4 AFC Champions League Elite). Đây là thiếu trường upstream, không thể tự điền khi chưa có thông tin được xác minh. Kết quả snapshot một ngày không bảo đảm chất lượng các ngày khác.

## 5. Điều kiện trước khi phát hành

1. Rà soát `git diff`, giữ nguyên thay đổi có sẵn, chọn đúng tệp để review/commit; CI phải chạy trên đúng SHA sẽ phát hành.
2. Ghi lại PASS của toàn bộ quality gate và kiểm tra UI, bàn phím, phản hồi khi nguồn lỗi ở 1440/390/320px.
3. Sau khi được phép deploy, kiểm tra `sports247-three.vercel.app` hoặc domain phát hành thực tế bằng HTTP/Chrome, SEO, Lighthouse, monitor, cron/alert và rollback.
4. Chỉ bật V.League khi dữ liệu thực và quyền sử dụng đủ; chỉ bật video đối với nguồn, trận và lãnh thổ có quyền; chỉ sử dụng logo đúng giấy phép.

**Giới hạn xác nhận:** kiểm tra local chứng minh tính đúng đắn của phần code được chạy. Nó không chứng minh chất lượng dữ liệu mọi ngày, quyền phân phối của upstream, hoặc hiệu năng và trạng thái cảnh báo của deployment mới chưa được phát hành.
