# SPORTS247 — Kế hoạch logo, dữ liệu và video bóng đá

Ngày rà soát: **31/10/2026**. Phạm vi: website Next.js trong `D:\sports_247`. Trạng thái phản ánh code đã xây dựng tại máy; việc cấu hình API trả phí, giấy phép phát hình và triển khai production cần chứng cứ riêng.

## 1. Mục tiêu và giới hạn

1. Mọi giải được SPORTS247 hỗ trợ có logo, hiển thị nhất quán ở bộ lọc, ticker, nhóm lịch, trận nổi bật và chi tiết trận, kèm chữ viết tắt khi ảnh lỗi.
2. Giữ lịch, tỷ số, chi tiết trận và thời gian Việt Nam chính xác; không dựng trận hoặc nguồn video giả.
3. Có giao diện **Xem trực tiếp** và API server-side kiểm tra nguồn được phép nhúng. Chỉ hiển thị player khi nhà cung cấp trả về video khớp trận, còn hiệu lực và cho phép phát ở vị trí người dùng.
4. Công khai hạng mục còn thiếu, phụ thuộc bên ngoài và điều kiện nghiệm thu, không nhận là đã hoàn tất 100% video khi chưa có quyền phát sóng thực tế.

Trang [24h lịch thi đấu](https://www.24h.com.vn/bong-da/lich-thi-dau-bong-da-hom-nay-moi-nhat-c48a364371.html) là tham khảo về cách trình bày giải. Logo được dùng từ metadata ESPN tương ứng thay vì tải lại tài nguyên của trang 24h. Quyền nhãn hiệu và tài nguyên ảnh thuộc chủ sở hữu. **ESPN Site API công khai nhưng không phải API đối tác chính thức có SLA**.

## 2. Kết quả kiểm kê

| Lĩnh vực | Hiện trạng | Việc tiếp theo |
|---|---|---|
| Danh mục giải | 18 mã giải ESPN; thêm UEFA Nations League `uefa.nations` (logo ESPN 2395) | So với cả bảng lịch chính và bảng bổ sung 24h ngày 31/10 còn thiếu V.League 1 và V.League 2; cần nhà cung cấp khác có dữ liệu đủ và quyền dùng phù hợp. |
| Logo giải | 18/18 URL CDN trả về PNG hợp lệ; `LeagueBadge` hiển thị ở các vị trí chính; Chrome QA xác nhận logo và fallback khi CDN lỗi | Nếu bổ sung giải mới, thêm logo, kiểm tra quyền nhãn hiệu và cập nhật test tương ứng. |
| Logo đội | 37 trận thật ngày 31/10/2026: thiếu 0 logo đội, 0 sân; fallback chữ khi không có | Theo dõi tỷ lệ thiếu mỗi ngày và bổ sung ảnh chỉ khi nhà cung cấp cho phép. |
| Lịch và tỷ số | ESPN, OpenLigaDB dự phòng Bundesliga; 90 giây polling; múi giờ Việt Nam và trạng thái partial | Theo dõi lỗi upstream và quota; cần kiểm thử E2E đường truyền trong môi trường production. |
| Chi tiết trận | Thống kê, đội hình, diễn biến, tường thuật; phong độ gần đây và đối đầu đã được chuẩn hóa khi ESPN trả về dữ liệu | Đo độ phủ trường dữ liệu theo giải/trận thật; giữ trạng thái rỗng khi nhà cung cấp thiếu dữ liệu. |
| Bảng xếp hạng | Sidebar 10 giải, `/api/standings`; 6 đội đầu và cửa sổ toàn bảng rộng 8 cột T/H/B; browser QA xác nhận 20 dòng thật EPL | Theo dõi kết quả các giải có vòng bảng và thay đổi cấu trúc upstream theo mùa. |
| Video | Tab Xem trực tiếp và `/api/watch` có adapter ScoreBat và YouTube từng trận đã được cấp quyền, đối chiếu quyền theo thị trường và thời gian | Chưa có bằng chứng quyền và video thật được phát hợp pháp tại Việt Nam. |
| Vận hành | ESLint, typecheck, production build; HTTP smoke local 6/6; audit dữ liệu 37 trận/18 giải; Chrome QA desktop/mobile/CDN outage | 9/37 trận thiếu kênh phát (4 Championship, 2 Primeira Liga, 3 Saudi Pro League); E2E trên deployment mới và logging thực tế vẫn chưa xác minh. |

## 3. Task chi tiết và tiêu chí Done

Trạng thái **DONE** = code/kiểm thử nội bộ đã hoàn thành; **PENDING** = chưa có chứng cứ thực tế; **EXTERNAL** = cần tài khoản, hợp đồng hoặc quyền bên ngoài. Mỗi task gồm tiêu chí nghiệm thu cụ thể.

### Mốc A — Logo và danh mục giải (P0)

| ID | Task | Trạng thái | Tiêu chí nghiệm thu |
|---|---|---|---|
| LOGO-01 | Kiểm kê giải đang có trong `leagues.ts` và các vùng còn sử dụng ký tự thay logo | DONE | Có danh sách tất cả giải bật và mọi vị trí cần render logo. |
| LOGO-02 | Đối chiếu logo 18 giải với metadata ESPN, gắn URL duy nhất cho từng mã | DONE | 18/18 URL PNG đã được tải và xác thực MIME/chữ ký, không trùng mã/URL. |
| LOGO-03 | Xây `LeagueBadge` dùng `next/image`, có chữ dự phòng khi CDN lỗi | DONE | Ảnh giữ tỷ lệ, lỗi ảnh không tạo ô trống. |
| LOGO-04 | Thay logo chữ tại sidebar bộ lọc và tiêu đề nhóm lịch | DONE | Hiện logo đúng với tên giải. |
| LOGO-05 | Hiện logo ở ticker, trận nổi bật, modal chi tiết | DONE | Cùng mã giải -> cùng ảnh trong mọi vùng UI. |
| LOGO-06 | Bổ sung CSS light/dark, responsive và kiểu nền sáng giúp logo dễ đọc | DONE | CSS build thành công; cần xác nhận trực quan trên thiết bị thật ở QA-03. |
| LOGO-07 | Bổ sung kiểm thử cấu hình logo, cập nhật tài liệu nguồn ảnh | DONE | Test tự động chạy được; README nêu nguồn dữ liệu. |
| LOGO-08 | Soát trực quan 18 logo tại browser với mạng bình thường/chặn CDN | DONE | Chrome QA desktop/mobile: 18 giải trong bộ lọc, 37 logo nhìn thấy đã tải, 0 lỗi; khi chặn CDN 46/46 badge hiện fallback có chữ; ảnh trong `docs/qa/`. |

### Mốc B — Xem trực tiếp theo quyền phát hình (P0)

| ID | Task | Trạng thái | Tiêu chí nghiệm thu |
|---|---|---|---|
| VIDEO-01 | Phân biệt API tỷ số ESPN với quyền phát video | DONE | README giải thích ESPN không cung cấp URL stream hợp pháp. |
| VIDEO-02 | Khảo sát API ScoreBat, live-streams, giới hạn gói miễn phí và quota | DONE | Ghi link docs và điều kiện sử dụng trong README. |
| VIDEO-03 | Khảo sát YouTube IFrame và danh sách đơn vị nắm bản quyền UEFA tại Việt Nam | DONE | Không giả định video YouTube nào cũng được phát, dẫn nguồn tham khảo. |
| VIDEO-04 | Tạo `GET /api/watch` validate giải, event và xử lý lỗi upstream | DONE | Mã giải ngoài whitelist / mã trận không hợp lệ -> HTTP 400. |
| VIDEO-05 | Giữ `SCOREBAT_API_TOKEN` phía server | DONE | Không đưa token vào client props, không commit khóa API. |
| VIDEO-06 | Đối chiếu ngày giờ + hai đội khi ghép ESPN/ScoreBat | DONE | Video của đối thủ sai hoặc thời gian cách >90 phút bị loại; hỗ trợ một số tên viết tắt đã xác định như Man Utd, PSG và Bayern München mà không nhập nhằng tên Inter. |
| VIDEO-07 | Cho nhúng chỉ URL HTTPS trên ScoreBat đúng cấu trúc | DONE | Không hiển thị iframe src lạ, URL không tin cậy bị loại. |
| VIDEO-08 | Xây tab video, player responsive, trạng thái chưa cấu hình/không có video/lỗi, retry | DONE | UI không hiện player giả; hỗ trợ thử lại khi chưa có nguồn và phân biệt trực tiếp với phát lại khi ESPN có trạng thái trận. |
| VIDEO-09 | Viết test an toàn URL và đối chiếu trận | DONE | Test cho trường hợp hợp lệ, tên đội viết khác nhau và từ chối sai/trùng; URL nhúng hoặc tiêu đề chứa secret ở query, fragment, tên tham số hay dạng percent-encoded đều bị từ chối. |
| VIDEO-13 | Chặn nhúng video khi thiếu khai báo quyền theo giải/quốc gia | DONE (CODE) | Server chỉ cho phép cặp `SCOREBAT_LICENSED_MARKETS` dạng `eng.1:VN`, không mở quyền chéo giữa các nước; chỉ đọc GeoIP trên Vercel; không gọi ESPN/ScoreBat nếu thiếu quyền; test nhánh chặn và nhánh được phép. Cần QA trên Vercel để xác minh header và quyền thực tế. |
| VIDEO-14 | Giới hạn truy vấn video trả phí theo giờ bóng lăn | DONE (CODE) | Feed chỉ được gọi từ 5 phút trước kickoff đến tối đa 72 giờ sau kickoff; test xác nhận bỏ qua ScoreBat khi trận quá sớm hoặc đã cũ. Thời gian phát lại phụ thuộc dữ liệu/hợp đồng nhà cung cấp. |
| VIDEO-15 | Hỗ trợ YouTube livestream của kênh được cấp quyền theo từng trận | DONE (CODE) | `OFFICIAL_YOUTUBE_STREAMS` có bằng chứng quyền, ID ESPN, video ID 11 ký tự, quốc gia ISO, khoảng giờ tối đa 8h; sai trận/vùng/giờ không trả video, URI chỉ từ `youtube-nocookie.com`; unit test không gọi upstream. Chưa kiểm chứng video thực tế được cấp quyền. |
| VIDEO-10 | Mua/cấu hình gói ScoreBat live, kiểm tra dạng JSON/iframe thực tế | EXTERNAL | Có token **server-only**, tài khoản được cấp endpoint live, log thử nghiệm đã ẩn token. |
| VIDEO-11 | Xác minh điều khoản nhúng, khu vực người xem tại Việt Nam và giới hạn bản quyền từng giải | EXTERNAL | Có bằng chứng nhà cung cấp chấp thuận phát cho website/thị trường mục tiêu; chỉ sau đó khai báo từng cặp `SCOREBAT_LICENSED_MARKETS`. GeoIP vẫn cần kiểm tra ngoài thực tế. |
| VIDEO-12 | E2E với ít nhất một trận đang diễn ra và có nguồn phát được phép nhúng | PENDING | Trong bản triển khai thật: mở modal, video chạy, hết trận xử lý hợp lệ, không leak token; theo dõi quota và lỗi. |

### Mốc C — Chất lượng dữ liệu và vận hành (P1)

| ID | Task | Trạng thái | Tiêu chí nghiệm thu |
|---|---|---|---|
| DATA-01 | Giới hạn đồng thời truy vấn ESPN khi thu thập hai ngày UTC x 18 giải | DONE | Giữ thứ tự và trạng thái lỗi từng giải, tránh đồng loạt 36 request. |
| DATA-02 | Bổ sung nguồn V.League có quyền dùng và ID/logo ổn định | EXTERNAL | Nguồn và điều khoản hợp lệ; dữ liệu đầy đủ ít nhất một vòng đấu và kiểm tra giờ VN. |
| DATA-03 | Điều tra thêm các giải ở lịch tham khảo còn thiếu, ưu tiên theo nhu cầu | PARTIAL | Đã bổ sung AFC Asian Cup `afc.asian.cup` và UEFA Nations League `uefa.nations`; xác thực logo cả hai. Trang 24h ngày 31/10 còn V.League 1 (bảng chính) và V.League 2/Hạng nhất Việt Nam (bảng bổ sung) chưa có trên SPORTS247; giải trẻ không được tự gộp vào FIFA World Cup. TheSportsDB mã 4803 cần xác minh quota, lịch đủ vòng và điều khoản trước khi triển khai. |
| DATA-04A | Bổ sung API bảng xếp hạng và bảng rút gọn trong sidebar | DONE | 10 giải có thể lấy BXH; parser giữ dữ liệu thiếu là null; HTTP trả dữ liệu thật và Chrome hiển thị 6 dòng EPL. |
| DATA-04B | Bổ sung phong độ, đối đầu và kiểm chứng BXH thật | DONE (CODE) | Có parser phong độ từ ESPN và đối đầu từ `seasonseries`, test trường hợp thiếu/sai dữ liệu; BXH EPL đã được xác minh thật. Độ phủ các trận/giải vẫn phụ thuộc upstream. |
| DATA-04C | Xem toàn bảng ngay trên SPORTS247, có T/H/B và thu gọn | DONE | Chrome QA mở bảng EPL từ 6 đội trong sidebar lên cửa sổ 20 đội/8 cột trên desktop/mobile; cửa sổ nằm trong viewport, tên đội xuống dòng, cuộn bảng và nhấn Escape để đóng, hoàn lại focus cho nút mở. |
| DATA-05 | Xây CLI kiểm kê độ phủ dữ liệu giải/trận `npm run audit:data -- YYYY-MM-DD` | DONE | Kiểm tra được 18 giải, số trận, thiếu logo đội/sân/kênh, lỗi upstream, bản ghi trùng và mã giải không biết; kiểm tra ngày lịch hợp lệ trên Windows; audit ngày 31/10 chạy thành công với 37 trận và 0 lỗi nguồn. |
| DATA-06 | Bổ sung/đối chiếu thông tin kênh phát cho trận thiếu metadata | PARTIAL | Phát hiện 9/37 trận thiếu trường broadcaster. Chỉ hiển thị kênh được nguồn có quyền cung cấp xác nhận; không suy đoán hoặc gắn kênh của trận khác. |
| DATA-07 | Kiểm tra dữ liệu và biểu trưng V.League 2 / Hạng nhất Việt Nam | EXTERNAL | VPF công bố V.League 2 mùa 2026/27. Cần API và điều khoản phù hợp, lịch đủ 14 CLB và thời gian VN, ánh xạ ID/logo đội, xác nhận ít nhất một vòng đấu với nguồn chính thức trước khi thêm vào danh mục. |
| QA-01 | Chạy ESLint và TypeScript | DONE | `npm run lint && npm run typecheck` đều exit 0. |
| QA-02 | Chạy unit tests và production build | DONE | `npm run check` exit 0 sau adapter YouTube: ESLint, TypeScript, 33/33 tests và Next.js 16.3.5 production build. Build workers trên Windows cần quyền ghi thư mục `.next`; lần chạy sandbox mặc định báo EPERM, lần chạy được cấp quyền đã thành công. |
| QA-03 | Browser QA trên desktop/mobile, tab xem trực tiếp, ảnh lỗi, bàn phím | DONE (DARK THEME) | Chrome 1440×900, 390×844: không tràn ngang; modal xem trận và cửa sổ BXH, tab trực tiếp, Escape và hoàn lại focus hoạt động; CDN outage fallback 46/46 badge; screenshots `docs/qa/`. Website hiện chỉ có chủ đề tối, chưa có công tắc chủ đề sáng. |
| QA-04 | Smoke test HTTP `/api/watch`, `/api/matches` và `/api/standings` | DONE (LOCAL) | Bản mới `next start` + `npm run smoke:local` chạy cùng phiên ở cổng 3282: 6/6 HTTP checks pass (200/400, dữ liệu trận và BXH). Baseline từng chạy 7/7 với `--watch`; bản mới không gọi nguồn video trả phí và chưa chứng minh playback live. |
| OPS-01 | Theo dõi độ trễ, upstream partial, lỗi ScoreBat và quota video | PARTIAL | Đã ghi log JSON thời gian xử lý cho matches partial/lỗi, standings chậm/lỗi, watch outcome/lỗi, không ghi token/URL. Cần đo quota thực và cảnh báo qua nền tảng vận hành. |
| OPS-02 | Kiểm tra sản xuất qua Vercel sau triển khai | PARTIAL | Kiểm tra Vercel API 31/10: production mới nhất vẫn ở commit `2f2684ca4721748db887f5c315886df543e3d0ca`, trạng thái READY; chưa chứa cập nhật logo/watch/standings trên nhánh `codex/`. Cần triển khai bản mới được phê duyệt và chạy smoke/cache/SEO/E2E; kiểm thử máy local không thay thế production. |
| OPS-03 | Theo dõi ngân sách request ScoreBat theo tháng và tốc độ polling | PARTIAL | Thu hẹp thời gian gọi live từ -30 phút xuống -5 phút theo docs, nâng cache feed từ 60s lên 300s; mỗi API call vẫn tốn 5 credits, mỗi view 1 credit. Cache **không bảo đảm hạn mức toàn cục** giữa các vùng serverless; còn phải đo usage, gắn ngân sách/cảnh báo bằng bộ đếm dùng chung và tài khoản thật. |

## 4. Quy trình cho các task phụ thuộc bên ngoài

### So sánh nguồn video đã khảo sát

| Phương án | Khả năng | Điều kiện quyết định |
|---|---|---|
| ScoreBat Video API | Highlights miễn phí giới hạn; gói trả phí mở endpoint live chính thức cho một số trận | Mua đúng gói, kiểm tra quota, trạng thái nhúng, quyền theo khu vực và trận thực tế. Đã làm adapter tùy chọn. |
| YouTube IFrame API | Nhúng stream công khai từ kênh/đơn vị được phép phát | Cần video ID hợp lệ từ kênh có quyền, tuân thủ chính sách embed; không thể thay thế bằng một API tra cứu bất kỳ. |
| Nhà đài/đối tác bản quyền | Có thể có nhiều giải theo hợp đồng của từng thị trường | Ký hợp đồng hoặc tích hợp SDK chính thức với quyền nhúng cho SPORTS247; không được tự lấy link CDN từ web khác. |
| ESPN / API-Football / OpenLigaDB | Lịch thi đấu, tỷ số, thông số sự kiện | Không phải API cung cấp hình ảnh trận đấu trực tiếp. |

**Bật phát trực tiếp:** tài khoản ScoreBat gói có Live Streams -> xác minh quyền nhúng theo giải và nước -> thêm `SCOREBAT_API_TOKEN`, `SCOREBAT_LICENSED_MARKETS` vào env server, khai báo từng cặp như `eng.1:VN` chỉ khi được nhà cung cấp cấp quyền -> thử `GET /api/watch` trên deployment Vercel với GeoIP đáng tin cậy và trận live chính thức -> xác nhận iframe thực tế được phép phát tại Việt Nam -> QA mobile/desktop -> theo dõi quota. Thiếu quốc gia/IP đáng tin cậy hoặc chưa khai báo quyền sẽ trả `restricted` trước khi gọi dịch vụ trả phí. Không đăng token trong tài liệu hoặc issue. [ScoreBat docs](https://www.scorebat.com/video-api/docs/), [bảng giá](https://www.scorebat.com/video-api/): tại lần kiểm tra này Starter $69/tháng, 5.000 credits, mỗi API call tính 5 credits và mỗi video view tính 1 credit. Khả năng truy cập phụ thuộc gói, trận và địa lý.

**Mở rộng giải:** phải có ít nhất tên giải, mã sự kiện/đội, ngày thi đấu ISO, biểu trưng được phép dùng, kết quả/trạng thái và nguồn tin. Trang 24h ngày 31/10/2026 có V.League 1, cùng Premier League, La Liga, Serie A, Bundesliga. ESPN `vie.1` không hoạt động khi kiểm tra. Đã tìm thấy [TheSportsDB V.League mã 4803 mùa 2026–27](https://api.thesportsdb.com/season/4803-vietnamese-v.league-1/2026-2027). Tài liệu [TheSportsDB V1 API](https://api.thesportsdb.com/documentation) cập nhật 2026 nêu khóa miễn phí chỉ trả tối đa **3 sự kiện cho schedule/day, 15 sự kiện cho schedule/season và 1 sự kiện cho schedule/next/league**; không đủ đảm bảo đầy đủ một vòng đấu. [Điều khoản](https://www.thesportsdb.com/docs_terms_of_use.php) cho dùng API trong dự án phát triển nhưng yêu cầu kiểm tra quyền của từng hình ảnh/logo bên thứ ba; logo thương hiệu không được tự động cấp phép. Vì vậy DATA-02 vẫn EXTERNAL đến khi có nguồn toàn bộ sự kiện, quyền tài sản và kiểm thử dữ liệu; khảo sát thêm gói premium hoặc API-Football/đối tác V.League.

**Đối chiếu danh mục 24h ngày 31/10/2026:** mục điều hướng lịch chính nêu 10 giải: Ngoại hạng Anh, V.League 1, Cúp C1, La Liga, Serie A, Bundesliga, Ligue 1, FA Cup, Europa League và Asian Cup. SPORTS247 đã có mã và logo của 9 giải còn lại: `eng.1`, `uefa.champions`, `esp.1`, `ita.1`, `ger.1`, `fra.1`, `eng.fa`, `uefa.europa`, `afc.asian.cup`. Bảng lịch bổ sung trên cùng trang có thêm Hạng nhất Việt Nam, Primeira Liga, Eredivisie, Saudi Pro League, MLS và Hạng nhất Anh; SPORTS247 có 5 giải sau, thiếu **Hạng nhất Việt Nam/V.League 2**. Như vậy trong 16 danh mục được liệt kê, **14 được hỗ trợ, 2 chưa có (V.League 1 và V.League 2)**. [VPF công bố cả hai hạng đấu mùa 2026/27](https://vpf.vn/tin-tuc/tin-vleague/thong-cao-bao-chi-le-boc-tham-xep-lich-thi-dau-cac-giai-bong-da-chuyen-nghiep-quoc-gia-2026-27/). Có đủ tên giải và logo chưa chứng minh lịch mỗi giải đủ so với 24h ở mọi ngày; cần kiểm tra số trận thực tế theo từng vòng.

**Bản quyền Việt Nam:** kiểm tra [UEFA Champions League](https://www.uefa.com/uefachampionsleague/news/0253-0d82037aaedd-f371c464f919-1000--/) và [UEFA Europa League](https://www.uefa.com/uefaeuropaleague/news/028d-1ae6d62165d6-69b17b354deb-1000/) để biết nhà phát hành tại khu vực; danh sách broadcaster không tự cấp quyền nhúng cho SPORTS247. [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference) chỉ nhúng nội dung của kênh cho phép.

## 5. Nguyên tắc nghiệm thu 100%

Tập task có thể hoàn thành bằng mã nguồn đã kiểm tra tại máy và được đánh dấu DONE. Các task **EXTERNAL/PENDING/PARTIAL** vẫn chưa được nghiệm thu; không thể tính là 100% tổng phạm vi đến khi có license/token, live fixture thật, V.League 1/2 đủ dữ liệu và giám sát production. Không có một API miễn phí, hợp pháp đã xác minh bao phủ video toàn bộ trận đấu của 18 giải. Ưu tiên tiếp theo: **VIDEO-10/11/12** -> **DATA-02/03/06/07** -> **OPS-01/02/03**. Các hạng mục cần liên hệ đối tác được giữ riêng, tránh gắn nhãn DONE trước khi có bằng chứng.

### Bằng chứng kiểm thử cục bộ (31/10/2026)

- `npm run check` **exit 0** sau cập nhật adapter YouTube: ESLint, TypeScript, **33/33** Node tests và webpack production build Next.js 16.3.5 thành công; routes `/`, `/api/matches`, `/api/match-details`, `/api/watch`, `/api/standings`. Bản build trên Windows chạy dưới quyền được cấp để các worker Next.js tạo thư mục `.next`; sandbox hạn chế trước đó từng báo EPERM, không phải lỗi TypeScript hoặc test.
- `npm run audit:logos` **exit 0** trong phiên mạng được cấp quyền: tải và kiểm tra MIME/chữ ký PNG thành công cho cả **18/18** logo ESPN (bao gồm AFC Asian Cup và UEFA Nations League).
- Trên server production **cục bộ** port 3282, `npm run smoke:local` **exit 0**, 6/6 HTTP kiểm tra gồm đầu vào sai trả 400 và dữ liệu trận/BXH thật trả 200. Server và script chạy trong cùng phiên được cấp quyền mạng vì hai phiên sandbox tách biệt không chia sẻ localhost. Lần chạy cũ ở port 50082 với `--watch` đạt 7/7; lần mới không gọi API xem trực tiếp để tránh tiêu tốn quota.
- `npm run audit:data -- 2026-10-31` **exit 0**: 37 trận từ 18 giải được hỗ trợ; 0 lỗi nguồn, 0 mã giải lạ, 0 trận trùng ID, 0 logo đội thiếu, 0 sân thiếu, **9 trận thiếu broadcaster**: Championship (4), Primeira Liga (2), Saudi Pro League (3). 9 giải còn lại không có trận trong ngày, chưa phải bằng chứng provider thiếu dữ liệu.
- `npm run qa:browser` **exit 0**: Chrome 1440×900 và 390×844, 18 giải có logo, 37 ảnh hiển thị đều tải xong, 0 lỗi, 0 overflow, 37 trận trên ngày kiểm tra; sidebar EPL 6 dòng, cửa sổ rộng đầy đủ 20 dòng/8 cột, Escape đóng và hoàn lại focus; modal/tab xem trực tiếp hoạt động. Khi chặn `a.espncdn.com`, **46/46 badge** chuyển sang fallback chữ. 5 ảnh tại `docs/qa/desktop.png`, `mobile.png`, `desktop-standings.png`, `mobile-standings.png`, `mobile-cdn-blocked.png`.
- Bản production Vercel truy vấn lại ngày 31/10 xác nhận vẫn ở `2f2684ca...` (deployment `dpl_98WLGTM5m7zMPGhcZyYZdDPzkhbC`, READY), **chưa chứa cập nhật nhánh `codex/`**. Các lệnh trên kiểm chứng bản build local, **chưa xác nhận khả năng phát video trực tiếp và dữ liệu V.League**.

### Kiểm thử cần chạy trên máy có kết nối localhost

1. Chạy `npm run start -- -p 3199` sau khi build, mở `http://localhost:3199` trên Chrome; kiểm tra bộ lọc từng giải, ảnh/logo ở sidebar, lịch đấu, ticker và modal.
2. Thử viewport desktop 1440×900, mobile 390×844; kiểm tra tràn ngang, giao diện tối hiện có, phím Tab/Escape, fallback ảnh bằng cách chặn `a.espncdn.com` trong DevTools. Giao diện sáng chưa được triển khai.
3. Chạy `npm run smoke:local` ở terminal khác. Script kiểm tra HTTP 400 khi input sai, cùng schema thật của matches/standings. Nếu chưa có `SCOREBAT_API_TOKEN`, thử `npm run smoke:local -- --watch` để xác nhận `status=unconfigured`; khi có key, option này sẽ gọi ScoreBat và có thể tính phí.
4. Gọi `/api/standings?league=eng.1` và xác nhận `groups` có bảng thật; thử mã không được hỗ trợ phải HTTP 400. Đổi lựa chọn BXH trong sidebar, kiểm tra logo đội và màu chữ ở chế độ tối.
5. Khi có token/hợp đồng, mở tab Xem trực tiếp cho trận có stream được phép phát, quan sát Network xem secret không có trong response, kiểm tra quota và điều kiện hạn chế theo khu vực trước khi triển khai công khai.
