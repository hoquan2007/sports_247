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
- Logo giải đấu chính thức ở bộ lọc, tiêu đề lịch đấu, khu vực trận nổi bật và trang chi tiết. Logo lỗi mạng tự động có chữ viết tắt thay thế.
- Trong tab Tổng quan: phong độ gần đây ở lịch ESPN; lịch sử đối đầu tối đa 5 trận gần nhất từ ESPN `seasonseries`, chỉ lấy trận kết thúc và đúng cặp đội, khi có dữ liệu thật.
- Sidebar bảng xếp hạng ESPN cho 10 giải tính điểm: chọn giải, xem sáu đội đầu, mở cửa sổ rộng để xem toàn bảng cùng số trận thắng/hòa/thua; hỗ trợ bàn phím Escape và cuộn ngang trên điện thoại. Hiển thị trạng thái thiếu dữ liệu nếu ESPN chưa cung cấp.
- Bộ lọc giải đấu, trạng thái, tìm kiếm tên đội; lưu trận yêu thích bằng `localStorage`.
- Tự làm mới khi trang hiển thị mỗi **90 giây**; cache dữ liệu ESPN **90 giây** trên Next.js và hỗ trợ Vercel CDN.
- Giao diện desktop và điện thoại, trung tâm chi tiết trận với các tab **Tổng quan**, **Thống kê**, **Đội hình** và **Diễn biến**.
- Tab **Xem trực tiếp** kiểm tra nguồn video được phép nhúng qua ScoreBat khi có khóa API phù hợp; có trạng thái minh bạch khi không có luồng và dẫn tới hướng dẫn quyền phát sóng UEFA cho Champions League/Europa League.
- Chi tiết theo ESPN Site API: so sánh thông số hai đội, các sự kiện chính, danh sách đá chính/dự bị và tường thuật khi ESPN cung cấp. Trận chưa diễn ra hoặc không có dữ liệu sẽ hiển thị trạng thái tương ứng; không dựng số liệu giả.
- Không hiển thị dữ liệu mô phỏng như tỷ số thật.

## API sử dụng

| Nguồn | Quyền truy cập | Mục đích | Lưu ý |
| --- | --- | --- | --- |
| [ESPN public Site API](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard) | Không cần key | Lịch, tỷ số, trạng thái, logo đội, thông tin trận và [summary theo event](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401879248) | API **không chính thức**; không có SLA và có thể đổi cấu trúc, hạn chế truy cập. |
| [ESPN standings API](https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings) | Không cần key | Bảng xếp hạng một số giải | Dùng `/apis/v2/` (khác scoreboard), cache 30 phút; hiển thị trạng thái rỗng khi không có BXH. |
| [OpenLigaDB](https://api.openligadb.de/) | Không cần key | Dự phòng Bundesliga khi ESPN không truy cập được | Dữ liệu cộng đồng theo [ODbL](https://opendatacommons.org/licenses/odbl/1-0/); kết quả có thể cập nhật trễ. |
| [API-Football](https://www.api-football.com/documentation_v3) | API key phía server | Adapter **tùy chọn** cho V.League 1 và V.League 2 | Chỉ tải khi có key và hai ID giải đúng; cache 1 giờ, không bảo đảm tỷ số cập nhật mỗi 90 giây. Chưa kiểm chứng trận thật hoặc quyền sử dụng dữ liệu của tài khoản. |
| [TheSportsDB](https://www.thesportsdb.com/docs/api) | Khóa thử `123` | Phương án bổ sung dữ liệu/ảnh | API v1 free bị giới hạn số sự kiện trả về; livescore v2 là trả phí. |

Ứng dụng tích hợp trực tiếp ESPN và OpenLigaDB; API-Football đã có adapter V.League nhưng **chưa kích hoạt** khi thiếu cấu hình. TheSportsDB mới ở bước khảo sát.

Endpoint của ứng dụng:

```http
GET /api/matches?date=2026-10-31
GET /api/match-details?league=eng.1&event=401879248
GET /api/watch?league=eng.1&event=401879248
GET /api/standings?league=eng.1
```

Trả về `{ date, matches, updatedAt, sources, partial, errors, pendingLeagues, failedLeagues }`. `pendingLeagues` nêu giải V.League chưa kết nối hoặc đang gặp lỗi provider; `failedLeagues` nêu **từng giải ESPN/API-Football** đã cấu hình nhưng có ít nhất một truy vấn dữ liệu thất bại. Khi một giải bị lỗi, client chỉ giữ các trận cũ thuộc giải đó (cùng ngày), thay kết quả mới bằng dữ liệu vừa cập nhật; trận cũ từ các giải không bị lỗi sẽ được loại bỏ. Bundesliga dùng OpenLigaDB làm nguồn thay thế nếu cả hai truy vấn ESPN thất bại. Mỗi trận bao gồm tên giải, tên/logo hai đội, giờ UTC ISO, tỷ số (`null` trước khi diễn ra), trạng thái, sân, kênh phát sóng và nguồn. Dữ liệu lịch theo ngày Việt Nam cần gọi **hai ngày UTC** vì mốc 00:00 GMT+7 nằm trong ngày UTC trước đó.

`/api/match-details` chỉ nhận các mã giải trong danh sách đang bật và ESPN event ID dạng số. API trả về thống kê, sự kiện, đội hình, tường thuật, trọng tài, lượng khán giả đã được chuẩn hóa từ ESPN, các trường không có sẽ rỗng. Dữ liệu được cache 60 giây; khi đang xem trận trực tiếp, cửa sổ chi tiết sẽ thử cập nhật sau mỗi 60 giây. Với trận từ OpenLigaDB, chỉ hiển thị thông tin cơ bản, vì mã trận không tương thích ESPN.

`/api/standings` nhận mã giải được hỗ trợ và trả về các nhóm xếp hạng, mùa giải, số trận, hiệu số, điểm khi ESPN cung cấp. Sidebar hiển thị 6 đội đầu; nút **Xem toàn bộ** mở cửa sổ rộng với 8 cột và chọn nhóm xếp hạng. API được cache 30 phút; dữ liệu Premier League 20 đội đã được kiểm tra qua localhost ngày 31/10/2026.

Danh mục giao diện hiện có **20 giải**: 18 giải ESPN (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League, UEFA Nations League, Championship, MLS, FA Cup, FIFA World Cup, Conference League, Primeira Liga, Eredivisie, Saudi Pro League, AFC Champions League Elite, AFC Asian Cup) và **V.League 1 / V.League 2**. Cả **20/20 ảnh** đã qua audit HTTP, MIME và chữ ký PNG/JPEG ngày 31/10/2026: 18 logo ESPN và 2 thumbnail VPF mùa 2026/27. Chrome desktop/mobile đã hiển thị đủ và xác minh fallback khi CDN ESPN hoặc VPF bị chặn. **Còn phải xác nhận quyền phân phối ảnh** trên SPORTS247 và kiểm tra lại sau deployment; thumbnail chưa chắc thay được artwork logo gốc. Hai giải Việt Nam **chỉ có dữ liệu lịch khi kết nối API-Football**; nếu chưa có key/ID, trang báo rõ và dẫn tới lịch VPF. Trang [24h lịch thi đấu](https://www.24h.com.vn/bong-da/lich-thi-dau-bong-da-hom-nay-moi-nhat-c48a364371.html) là tài liệu đối chiếu, không trực tiếp sao chép ảnh từ 24h.

Để bật adapter V.League, lấy khóa và **ID numeric chính xác** của hai giải mùa 2026/27 qua endpoint `GET /leagues?country=Vietnam&season=2026` của [API-Football](https://www.api-football.com/documentation_v3), rồi khai báo **chỉ trên server** trong `.env.local` hoặc Vercel: `API_FOOTBALL_KEY`, `SPORTS247_VLEAGUE1_ID`, `SPORTS247_VLEAGUE2_ID`. Không tự suy đoán ID; hai ID phải khác nhau. Adapter xác minh quốc gia, tên giải, ngày Việt Nam, đội và trạng thái trận, bỏ dữ liệu không khớp, giữ kết quả giải còn hoạt động nếu giải kia lỗi. **Cache mặc định 3600 giây** phù hợp giới hạn quota thấp. Nếu tài khoản có đủ quota, có thể đặt thêm `SPORTS247_VIETNAM_CACHE_SECONDS=300` trên server để làm mới mỗi 5 phút, hoặc `=90` khi đã tính đủ ngân sách; chỉ chấp nhận số nguyên từ **90 đến 3600** giây, giá trị sai làm adapter không hoạt động. Làm mới client mỗi 90 giây **không bảo đảm** dữ liệu provider được cập nhật với cùng tần suất; cần kiểm tra quota, cache CDN và lịch trận trước khi quảng bá realtime. Nguồn hình tham khảo: [logo V.League 1 trên VPF](https://vpf.vn/tai-lieu-vleague/logo-giai-va-logo-14-clb-tham-du-lpbank-v-league-1-2026-27/) và [logo V.League 2 trên VPF](https://vpf.vn/hang-nhat-tai-lieu/logo-giai-va-logo-14-clb-tham-du-v-league-2-2026-27/). [TheSportsDB mã 4803](https://api.thesportsdb.com/season/4803-vietnamese-v.league-1/2026-2027) vẫn là phương án khảo sát; các giới hạn và quyền ảnh cần kiểm tra riêng.

## Video trận đấu trực tiếp

**API tỷ số trực tiếp không đồng nghĩa với quyền phát hình trực tiếp.** Quyền phát trận được bán theo giải và quốc gia; hiện không có một API miễn phí, hợp pháp và ổn định cung cấp video toàn bộ các giải. Trường `broadcasters` của ESPN có thể hiển thị tên kênh tại thị trường Mỹ và không bảo đảm quyền xem tại Việt Nam.

SPORTS247 đã tích hợp tùy chọn [ScoreBat Video API](https://www.scorebat.com/video-api/docs/), endpoint `live-streams`, qua server-side `GET /api/watch`. API lấy mã trận ESPN đã xác minh, đối chiếu **cả hai đội và giờ thi đấu** trước khi trả về URL nhúng `https://www.scorebat.com/embed/v/...`. Chỉ URL HTTPS từ miền và đường dẫn cho phép được chấp nhận; không trả HTML nguồn chưa kiểm tra. Token API chỉ nằm trong môi trường server.

Để giảm request tính phí, máy chủ chỉ truy vấn feed live khi trận còn trong khoảng **5 phút trước kickoff đến 72 giờ sau kickoff** (tài liệu ScoreBat ghi live stream thường xuất hiện ~5 phút trước giờ bắt đầu), và cache feed server-side tối đa **300 giây**. Ngoài khoảng này, API trả trạng thái `unavailable` và hướng dẫn xem lịch/diễn biến. Cache giúp giảm request lặp, nhưng không đảm bảo giới hạn chi phí giữa nhiều vùng Vercel. SPORTS247 có thêm **bộ đếm credits chia sẻ tùy chọn qua Upstash Redis REST** để chủ động chặn API/trả player khi hết ngân sách; cần cấu hình và kiểm tra thực tế trước khi bật gói trả phí.

Để bật tính năng khi có gói ScoreBat hỗ trợ live **và đã được nhà cung cấp xác nhận phạm vi sử dụng**, đặt các biến **chỉ phía server** trong `.env.local` hoặc trên hosting (không commit):

```dotenv
SCOREBAT_API_TOKEN=<token-thuc-te>
SCOREBAT_LICENSED_MARKETS=eng.1:VN,esp.1:VN
```

Để giới hạn các lần truy vấn có khả năng tính phí trên toàn hệ thống, có thể cấu hình thêm **cả ba** biến sau trên server khi có gói ScoreBat:

```dotenv
SCOREBAT_MONTHLY_CREDIT_LIMIT=4000
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=<standard-token-tren-server>
```

Chỉ sử dụng URL và Standard token do Upstash cấp, giữ cả hai bí mật ở server. Con số **4000 chỉ là ví dụ**, cần dành credits cho lượt xem và các ứng dụng khác dùng chung tài khoản; không đặt quá hạn mức hợp đồng. Bộ đếm sử dụng Redis Lua `EVAL` atomic theo từng tháng UTC; dành trước **5 credits** cho mỗi lần server chuẩn bị truy vấn ScoreBat (kể cả khi Next.js trả dữ liệu từ cache, nên có thể tính cao hơn số API call thực) và **1 credit** trước khi trả mỗi iframe ScoreBat. Không đủ credits hoặc Redis lỗi thì API từ chối phát video để bảo vệ ngân sách. Khi không khai báo ba biến, tính năng ScoreBat giữ cơ chế cũ **không có giới hạn chung**; khai báo thiếu/sai thì chặn truy vấn trả phí. Log JSON `sports247_scorebat_budget` cho biết credits đã dành, ngưỡng ≥80% được cảnh báo để gắn alert trên hệ thống log. Thống kê này **không thay thế số liệu nhà cung cấp**: một iframe/link có thể tạo nhiều lượt xem tính phí bên ngoài máy chủ, các lượt xem và ứng dụng khác phải được đối soát trong tài khoản ScoreBat. Tài liệu [Upstash Redis REST](https://upstash.com/docs/redis/features/restapi) mô tả endpoint và token; [Lua EVAL](https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http) hỗ trợ thao tác đồng bộ.

Để kiểm tra cấu hình server **trước triển khai** (không truy cập API trả phí), chạy `npm run audit:readiness` hoặc `npm run audit:readiness -- --json --require-video --require-vietnam`. Lệnh tự đọc `.env.local` nếu có và các biến môi trường của tiến trình. Nó phân biệt `disabled`, `invalid`, `unmetered` và `configured_unverified`, không in token/ID video/mã hợp đồng. Exit code **0** nghĩa là cấu hình hiện có không sai định dạng, **1** nghĩa là phát hiện cấu hình sai, **2** nghĩa là một tích hợp được yêu cầu chưa cấu hình đủ. `configured_unverified` **không chứng minh có hợp đồng, dữ liệu V.League, stream hoạt động hay quyền phát ở Việt Nam**; các điều kiện này vẫn phải kiểm tra bằng đối tác và E2E thật. Với Redis, log `sports247_scorebat_budget` có trường `reason` (`invalid_settings`, `redis_http_error`, `redis_connection_error`...) khi không thể giữ credits; không ghi URL, body lỗi hoặc token. Điều này hỗ trợ alert và phân biệt lỗi cấu hình với Redis mất kết nối.

Giá trị `eng.1:VN,esp.1:VN` **chỉ minh họa định dạng**, không khẳng định SPORTS247 đã có quyền phát các giải này tại Việt Nam. Mỗi phần tử là một **cặp giải:quốc gia** (ISO 3166-1) được cấp quyền riêng, tránh vô tình cho phép một giải ở quốc gia khác. `/api/watch` chỉ đọc vị trí IP từ `x-vercel-ip-country` khi chạy trên Vercel; host không có địa chỉ quốc gia tin cậy, hoặc cặp giải/quốc gia chưa được khai báo, sẽ trả `restricted` mà không gọi API trả phí. [Tài liệu Vercel GeoIP](https://vercel.com/docs/headers/request-headers) xác nhận header này có ở deployment; localhost không có header. Cần bật hệ thống biến môi trường Vercel (`VERCEL=1`), thử thực tế khi triển khai và xác minh với nhà cung cấp rằng biện pháp hạn chế theo IP đáp ứng điều khoản sử dụng.

Ngoài ScoreBat, `GET /api/watch` có adapter **YouTube livestream được chọn thủ công theo từng trận có bản quyền**. Đặt `OFFICIAL_YOUTUBE_STREAMS` trên server là mảng JSON với `league` (mã ESPN hoặc `vie.1`/`vie.2`), `event` (ID trận tương ứng của ESPN hoặc API-Football), `videoId` (đúng 11 ký tự), `countries` (các mã ISO cho phép), `validFrom` và `validUntil` (ISO UTC, tối đa 8 giờ), `rightsReference` (mã hợp đồng/ủy quyền để kiểm toán) và `title` tùy chọn. Ví dụ **chỉ mô tả định dạng, không chứa video có thật**:

```dotenv
OFFICIAL_YOUTUBE_STREAMS=[{"league":"eng.1","event":"401879248","videoId":"AbCdEFg1234","countries":["VN"],"validFrom":"2026-10-31T12:00:00Z","validUntil":"2026-10-31T15:00:00Z","rightsReference":"agreement-2026-123"}]
```

**Không dùng ví dụ này trên production.** Người vận hành chỉ khai báo ID video của kênh chính thức khi có xác nhận quyền nhúng trên SPORTS247 theo lãnh thổ và thời gian; video không chính thức hoặc bị hạn chế nhúng không được tự động tìm kiếm/phát. Server yêu cầu khớp toàn bộ ID trận, mã giải, nước, khoảng giờ và bằng chứng quyền; khi hợp lệ trả iframe `youtube-nocookie.com`, không tiết lộ mã hợp đồng. Với trận V.League từ API-Football, tab Xem trực tiếp có thể nhúng YouTube từng trận đã cấp quyền, nhưng **không gọi ScoreBat hoặc ESPN bằng ID trận V.League**. Không có quyền/video phù hợp thì hiển thị trạng thái chưa khả dụng và liên kết VPF. Có thể kiểm tra parser và thời hạn bằng `npm test` mà không cần token; xem thực tế cần deployment có GeoIP được kiểm chứng.

Gói miễn phí ScoreBat chỉ có highlights giới hạn và **không** bao gồm endpoint live; theo bảng giá ngày 31/10/2026 gói Starter có live là **$69/tháng** với 5.000 credits, API call tốn 5 credits và mỗi lượt xem tiêu tốn credit. Khi chưa có token, tab hiển thị giải thích thay vì giả lập phát video. Token một mình sẽ không bật phát; cả quyền giải đấu, quốc gia và luồng trận khớp mới có thể cho phép nhúng.

Nguồn nghiên cứu và hướng dẫn quyền phát sóng: [ScoreBat API](https://www.scorebat.com/video-api/docs/), [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [UEFA Champions League](https://www.uefa.com/uefachampionsleague/news/0253-0d82037aaedd-f371c464f919-1000--/), [UEFA Europa League](https://www.uefa.com/uefaeuropaleague/news/028d-1ae6d62165d6-69b17b354deb-1000/). Đối tác UEFA niêm yết tại Việt Nam bao gồm VTVCab, Viettel (và MyTV tại trang UCL thời điểm kiểm tra). Đây là thông tin hướng dẫn xem, không phải quyền nhúng video do SPORTS247 sở hữu.

Kế hoạch hạng mục đã làm / còn thiếu và tiêu chí nghiệm thu: [docs/SPORTS247-ROADMAP-2026-10-31.md](docs/SPORTS247-ROADMAP-2026-10-31.md).

Mẫu biến môi trường an toàn: [`.env.example`](.env.example). Sao chép sang `.env.local` và điền giá trị thật **chỉ khi đã xác minh quyền sử dụng dữ liệu/video**; file `.env.local` đã nằm trong `.gitignore`. Các giá trị mặc định để trống giữ nguồn video và adapter V.League ở trạng thái không cấu hình, tránh tự kích hoạt nhúng video hoặc tiêu quota trả phí.

Workflow `.github/workflows/ci.yml` chạy `npm ci` và `npm run check` trên pull request, push vào `main` hoặc khi khởi chạy thủ công. Workflow không dùng API token; kiểm thử truy cập mạng/Chrome và xác minh phát livestream được chạy ở bước QA phù hợp riêng.

Kiểm tra HTTP và trình duyệt sau `npm run build`: chạy `npm run qa:local -- --browser --data 2026-10-31`. Lệnh này tự mở `next start` tại `127.0.0.1:34131`, chạy 8 HTTP smoke checks, audit dữ liệu ngày chỉ định, Chrome QA trên desktop/mobile (kể cả chặn từng CDN logo), rồi dừng server. Có thể dùng `npm run qa:local` để chỉ kiểm tra HTTP; thay cổng bằng biến `SPORTS247_QA_PORT`. Nếu Windows sandbox từ chối kết nối localhost với `EACCES`, cần chạy trong phiên Codex đã được cấp quyền network/localhost. Để smoke riêng trên server đã chạy hoặc deployment, đặt `SPORTS247_BASE_URL` rồi gọi `npm run smoke:local`. Chỉ thêm `-- --watch` cho smoke riêng khi muốn truy vấn nhà cung cấp video; endpoint trả phí có thể tính credit. Smoke mặc định chỉ kiểm tra API, **không chứng minh đã phát được livestream**.

Để kiểm tra toàn bộ **20 ảnh giải** đang hoạt động trên ESPN CDN và VPF, chạy `npm run audit:logos`. Lệnh tải và xác nhận trạng thái HTTP, MIME và chữ ký PNG/JPEG tương ứng với từng URL; cần kết nối internet và được chạy tách biệt khỏi unit tests để tránh gây lỗi CI khi CDN tạm thời không phản hồi. Ảnh QA tại `docs/qa/` gồm desktop/mobile, danh sách giải, bảng xếp hạng và hai ảnh CDN bị chặn. Có thể chạy `npm run qa:browser` hoặc `npm run audit:data -- 2026-10-31` riêng khi server đang hoạt động, nhưng cách được khuyến nghị là `qa:local` ở trên. Kết quả ngày 31/10/2026: 20 giải hiển thị, 18 giải ESPN kết nối, 2 giải V.League chờ API; 37 trận ESPN, 0 logo đội thiếu, 0 sân thiếu, 9 trận không có thông tin kênh (4 Championship, 2 Primeira Liga, 3 Saudi Pro League). Giải có 0 trận trong ngày không mặc nhiên được coi là thiếu dữ liệu.

## Kiến trúc

```text
src/
  app/
    api/matches/route.ts     API proxy, validation, response cache
    api/match-details/route.ts API chi tiết ESPN theo event
    api/watch/route.ts         API kiểm tra video trực tiếp chính thức (nếu cấu hình)
    api/standings/route.ts     API bảng xếp hạng từ ESPN
    page.tsx                 Server-render dữ liệu cho ngày hiện tại
    layout.tsx               SEO và khung tài liệu
    sports.css               Responsive dark scoreboard
  components/
    match-center.tsx         Giao diện client, bộ lọc, chi tiết trận và polling
    league-standings.tsx     Bảng xếp hạng rút gọn và cửa sổ xem toàn bộ trên desktop/mobile
  lib/football/
    espn.ts                  Adapter ESPN + OpenLigaDB fallback
    match-details.ts         ESPN soccer summary adapter + normalized models
    watch.ts                  Adapter ScoreBat và kiểm tra an toàn embed
    official-youtube.ts       Cho phép video YouTube đã cấp quyền theo trận/quốc gia/thời hạn
    standings.ts              Chuẩn hóa bảng xếp hạng ESPN
    leagues.ts               Danh sách giải, xử lý ngày và múi giờ
    types.ts                 Contract API frontend/backend
```

Các external request có timeout 9,5 giây; tối đa 16 request ESPN chạy song song, vẫn giữ riêng lỗi của từng giải dưới trạng thái `partial`. API watch từ chối nhúng URL có chứa chính secret server; để phát cần URL nhúng công khai do nhà cung cấp cấp phép. Cần theo dõi quota/điều khoản ESPN nếu lượng truy cập tăng; Vercel serverless không giữ kết nối WebSocket lâu dài, nên dùng polling.

## Công cụ yêu cầu

- **ai-website-cloner-template**: được clone vào `tools/ai-website-cloner-template/`, sử dụng stack Next.js + Tailwind của dự án làm nền tảng. Đọc hướng dẫn tại repo để dùng kỹ năng `/clone-website` khi cần dựng trang khác.
- **REA**: clone tại `tools/rea/` và cài CLI npm tại `tools/rea-cli/node_modules/.bin/rea.cmd`. Kiểm tra bằng `./tools/rea-cli/node_modules/.bin/rea.cmd --version`. REA 6.8 yêu cầu Node `^24.22.1` hoặc cao hơn (hoặc Node 22 bản hỗ trợ). Máy hiện có Node 24.19.0 nên cần nâng runtime trước khi chạy đầy đủ REA. Để thêm REA vào Codex/Cursor sau khi nâng Node: `npx rea-agents setup --client codex --client cursor` và kiểm tra đề xuất sửa cấu hình.

Thư mục `tools/` và `.taste-skill/` là công cụ phát triển, được bỏ qua khi commit và khi triển khai từ root.

## Triển khai Vercel

1. Push **root dự án** lên GitHub (không chứa `node_modules`, `tools/`, `.next/`).
2. Import repository ở Vercel, framework **Next.js**, Root Directory `.`, Install Command `npm ci`, Build Command `npm run build`.
3. Chọn region gần Việt Nam khi phù hợp; endpoint không cần environment variables. Kiểm tra `/api/matches?date=2026-10-31` sau deploy.

Lưu ý tuân thủ điều khoản sử dụng dữ liệu, bản quyền logo CLB, nguồn phát sóng, và hiển thị nguồn phù hợp trước khi thương mại hóa.
