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
| [API-Football](https://www.api-football.com/pricing) | Free account / API key | Phương án nâng cấp khi cần bao phủ giải đấu hơn | Free hiện giới hạn 100 request/ngày; **chưa bật** trong bản này. |
| [TheSportsDB](https://www.thesportsdb.com/docs/api) | Khóa thử `123` | Phương án bổ sung dữ liệu/ảnh | API v1 free bị giới hạn số sự kiện trả về; livescore v2 là trả phí. |

Ứng dụng tích hợp trực tiếp ESPN và OpenLigaDB. Các API khác được đánh giá và ghi lại như lựa chọn mở rộng, không tuyên bố đã tích hợp.

Endpoint của ứng dụng:

```http
GET /api/matches?date=2026-10-31
GET /api/match-details?league=eng.1&event=401879248
GET /api/watch?league=eng.1&event=401879248
GET /api/standings?league=eng.1
```

Trả về `{ date, matches, updatedAt, sources, partial, errors }`. Mỗi trận bao gồm tên giải, tên/logo hai đội, giờ UTC ISO, tỷ số (`null` trước khi diễn ra), trạng thái, sân, kênh phát sóng và nguồn. Dữ liệu lịch theo ngày Việt Nam cần gọi **hai ngày UTC** vì mốc 00:00 GMT+7 nằm trong ngày UTC trước đó.

`/api/match-details` chỉ nhận các mã giải trong danh sách đang bật và ESPN event ID dạng số. API trả về thống kê, sự kiện, đội hình, tường thuật, trọng tài, lượng khán giả đã được chuẩn hóa từ ESPN, các trường không có sẽ rỗng. Dữ liệu được cache 60 giây; khi đang xem trận trực tiếp, cửa sổ chi tiết sẽ thử cập nhật sau mỗi 60 giây. Với trận từ OpenLigaDB, chỉ hiển thị thông tin cơ bản, vì mã trận không tương thích ESPN.

`/api/standings` nhận mã giải được hỗ trợ và trả về các nhóm xếp hạng, mùa giải, số trận, hiệu số, điểm khi ESPN cung cấp. Sidebar hiển thị 6 đội đầu; nút **Xem toàn bộ** mở cửa sổ rộng với 8 cột và chọn nhóm xếp hạng. API được cache 30 phút; dữ liệu Premier League 20 đội đã được kiểm tra qua localhost ngày 31/10/2026.

Các giải mặc định (18): Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League, UEFA Nations League, Championship, MLS, FA Cup, FIFA World Cup, Conference League, Primeira Liga, Eredivisie, Saudi Pro League, AFC Champions League Elite và AFC Asian Cup. Cả 18 logo (gồm UEFA Nations League, `uefa.nations`, ESPN ID 2395) đều vượt qua kiểm tra tải CDN, MIME và chữ ký PNG ngày 31/10/2026; Chrome QA desktop/mobile kiểm tra logo hiển thị và fallback. SPORTS247 còn thiếu V.League 1 và Hạng nhất Việt Nam/V.League 2 so với các bảng lịch trên trang 24h; mã ESPN `vie.1` cho V.League 1 trả HTTP 400 khi kiểm tra. Chỉ bổ sung khi xác định nguồn lịch và quyền sử dụng hình ảnh phù hợp. Trang [24h lịch thi đấu](https://www.24h.com.vn/bong-da/lich-thi-dau-bong-da-hom-nay-moi-nhat-c48a364371.html) được dùng làm tham khảo, không sao chép logo trực tiếp từ 24h.

Nguồn đang khảo sát cho V.League: [TheSportsDB giải 4803 mùa 2026–27](https://api.thesportsdb.com/season/4803-vietnamese-v.league-1/2026-2027). Cần xác nhận dữ liệu qua API chính thức, hạn mức bản miễn phí và [quyền sử dụng hình ảnh](https://www.thesportsdb.com/docs_terms_of_use.php) trước khi bật trên production. Gói v1 free trả về ít sự kiện cho một số endpoint; livescore liên tục yêu cầu gói phù hợp.

## Video trận đấu trực tiếp

**API tỷ số trực tiếp không đồng nghĩa với quyền phát hình trực tiếp.** Quyền phát trận được bán theo giải và quốc gia; hiện không có một API miễn phí, hợp pháp và ổn định cung cấp video toàn bộ các giải. Trường `broadcasters` của ESPN có thể hiển thị tên kênh tại thị trường Mỹ và không bảo đảm quyền xem tại Việt Nam.

SPORTS247 đã tích hợp tùy chọn [ScoreBat Video API](https://www.scorebat.com/video-api/docs/), endpoint `live-streams`, qua server-side `GET /api/watch`. API lấy mã trận ESPN đã xác minh, đối chiếu **cả hai đội và giờ thi đấu** trước khi trả về URL nhúng `https://www.scorebat.com/embed/v/...`. Chỉ URL HTTPS từ miền và đường dẫn cho phép được chấp nhận; không trả HTML nguồn chưa kiểm tra. Token API chỉ nằm trong môi trường server.

Để giảm request tính phí, máy chủ chỉ truy vấn feed live khi trận còn trong khoảng **30 phút trước kickoff đến 72 giờ sau kickoff**. Ngoài khoảng này, API trả trạng thái `unavailable` và hướng dẫn xem lịch/diễn biến. Đây là giới hạn tối ưu cho nhu cầu live và phát lại gần đây của SPORTS247; nếu đối tác hỗ trợ phát lại lâu hơn, cần xem xét điều chỉnh theo hợp đồng.

Để bật tính năng khi có gói ScoreBat hỗ trợ live **và đã được nhà cung cấp xác nhận phạm vi sử dụng**, đặt các biến **chỉ phía server** trong `.env.local` hoặc trên hosting (không commit):

```dotenv
SCOREBAT_API_TOKEN=<token-thuc-te>
SCOREBAT_LICENSED_MARKETS=eng.1:VN,esp.1:VN
```

Giá trị `eng.1:VN,esp.1:VN` **chỉ minh họa định dạng**, không khẳng định SPORTS247 đã có quyền phát các giải này tại Việt Nam. Mỗi phần tử là một **cặp giải:quốc gia** (ISO 3166-1) được cấp quyền riêng, tránh vô tình cho phép một giải ở quốc gia khác. `/api/watch` chỉ đọc vị trí IP từ `x-vercel-ip-country` khi chạy trên Vercel; host không có địa chỉ quốc gia tin cậy, hoặc cặp giải/quốc gia chưa được khai báo, sẽ trả `restricted` mà không gọi API trả phí. [Tài liệu Vercel GeoIP](https://vercel.com/docs/headers/request-headers) xác nhận header này có ở deployment; localhost không có header. Cần bật hệ thống biến môi trường Vercel (`VERCEL=1`), thử thực tế khi triển khai và xác minh với nhà cung cấp rằng biện pháp hạn chế theo IP đáp ứng điều khoản sử dụng.

Gói miễn phí ScoreBat chỉ có highlights giới hạn và **không** bao gồm endpoint live; theo bảng giá ngày 31/10/2026 gói Starter có live là **$69/tháng** với 5.000 credits, API call tốn 5 credits và mỗi lượt xem tiêu tốn credit. Khi chưa có token, tab hiển thị giải thích thay vì giả lập phát video. Token một mình sẽ không bật phát; cả quyền giải đấu, quốc gia và luồng trận khớp mới có thể cho phép nhúng.

Nguồn nghiên cứu và hướng dẫn quyền phát sóng: [ScoreBat API](https://www.scorebat.com/video-api/docs/), [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [UEFA Champions League](https://www.uefa.com/uefachampionsleague/news/0253-0d82037aaedd-f371c464f919-1000--/), [UEFA Europa League](https://www.uefa.com/uefaeuropaleague/news/028d-1ae6d62165d6-69b17b354deb-1000/). Đối tác UEFA niêm yết tại Việt Nam bao gồm VTVCab, Viettel (và MyTV tại trang UCL thời điểm kiểm tra). Đây là thông tin hướng dẫn xem, không phải quyền nhúng video do SPORTS247 sở hữu.

Kế hoạch hạng mục đã làm / còn thiếu và tiêu chí nghiệm thu: [docs/SPORTS247-ROADMAP-2026-10-31.md](docs/SPORTS247-ROADMAP-2026-10-31.md).

Kiểm tra HTTP: chạy `npm run build`, sau đó `npm run start -- -p 3199` trong một terminal; tại terminal khác chạy `npm run smoke:local`. Script kiểm tra trang chủ, đầu vào API không hợp lệ, lịch và bảng xếp hạng có dữ liệu thật. Đặt `SPORTS247_BASE_URL=https://your-domain.example` để thử domain triển khai. Chỉ thêm `-- --watch` khi muốn thực sự truy vấn nhà cung cấp video (có thể tính phí theo lượt API). Môi trường Windows sandbox có thể chặn localhost; phiên thực thi được phép truy cập mạng đã chạy được smoke vào ngày 31/10/2026.

Để kiểm tra toàn bộ logo đang hoạt động trên ESPN CDN, chạy `npm run audit:logos`. Lệnh tải và xác nhận trạng thái HTTP, MIME và chữ ký PNG của tất cả logo có trong cấu hình; cần kết nối internet và được chạy tách biệt khỏi unit tests để tránh gây lỗi CI khi CDN tạm thời không phản hồi. Kiểm tra tương tác và ảnh desktop/mobile qua `npm run qa:browser` khi đã chạy `next start` ở `http://127.0.0.1:3199` (hoặc đặt biến `SPORTS247_BASE_URL`). Chạy `npm run audit:data -- 2026-10-31` khi server đang hoạt động để xem số trận, tỷ lệ thiếu logo đội, sân, kênh phát, bản ghi trùng và lỗi nhà cung cấp theo từng giải. Kết quả ngày 31/10/2026: 37 trận, 0 logo đội thiếu, 0 sân thiếu, 9 trận không có thông tin kênh (4 Championship, 2 Primeira Liga, 3 Saudi Pro League). Giải có 0 trận trong ngày không mặc nhiên được coi là thiếu dữ liệu.

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
