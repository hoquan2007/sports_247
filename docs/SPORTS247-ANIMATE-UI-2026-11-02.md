# SPORTS247 — Tích hợp animate-ui (02/11/2026)

## Mục tiêu

Tạo phản hồi chuyển động rõ ràng khi người xem cập nhật tỷ số, chuyển ngày thi đấu, lọc trận và lưu trận yêu thích. SPORTS247 là trang xem thông tin bóng đá có dữ liệu thay đổi thường xuyên, vì vậy chuyển động cần nhanh, nhẹ và giữ bảng tỷ số dễ đọc. Những chuyển động hiện có bằng GSAP cho mascot, phần mở đầu và trận nổi bật được giữ nguyên.

## Thư viện

- `@animate-ui/react@2.4.1` — các thành phần giao diện có hoạt ảnh.
- `motion@^14.0.0` — bộ máy chuyển động của animate-ui.
- `@base-ui/react@^1.8.0` — nâng từ 1.3 để đáp ứng tương thích với animate-ui.

Tham khảo: https://github.com/imskyleen/animate-ui và https://animate-ui.com/.

## Những vị trí đã áp dụng

| Vị trí | Thành phần | Hiệu ứng và lý do |
| --- | --- | --- |
| 4 ô thống kê (Tất cả, Trực tiếp, Sắp diễn ra, Kết quả) | `SlidingNumber` | Chữ số thay đổi mềm hơn khi dữ liệu được cập nhật; bắt đầu từ đúng giá trị nhận được, tránh đếm giả từ 0 khi mở trang. |
| Tỷ số trận đang trực tiếp | `SlidingNumber` | Nhận ra sự thay đổi tỷ số nhanh, vẫn giữ tỷ số trận đã kết thúc dưới dạng chữ tĩnh để giảm tải. |
| Bộ lọc trạng thái trận | `Highlight` + `HighlightItem` | Nền chọn di chuyển giữa các mục; trạng thái chọn vẫn thể hiện qua `aria-pressed`. |
| Lưu/bỏ lưu trận yêu thích | `Button` | Phản hồi nhấn/hover nhẹ, không thay đổi hành vi lưu. |
| Điều hướng ngày và nút về hôm nay | `Button` | Hiệu ứng nhấn rất ngắn, hỗ trợ nhận biết thao tác. |
| Nhóm trận theo giải đấu | `Fade` | Hiện nhẹ khi đi vào vùng nhìn, tránh dồn chuyển động vào từng hàng trận. |

## Nguyên tắc thiết kế

- Không chạy hiệu ứng xếp tầng trên từng hàng trận hoặc theo mọi lần polling 90 giây.
- Tránh làm các điểm nhấn và chuyển động trùng với GSAP của mascot và spotlight.
- Động tác nhỏ, dùng `opacity` và `transform`; không dùng chuyển động để che số liệu hoặc trì hoãn hiển thị thông tin.
- Giữ thao tác bàn phím, nhãn tiếp cận, focus và chế độ `prefers-reduced-motion`. Các thành phần animate-ui xử lý giảm chuyển động; CSS giữ các nhóm trận luôn thấy rõ khi người dùng yêu cầu giảm chuyển động.
- Nếu đánh giá trên máy yếu cho thấy danh sách trận quá nặng, ưu tiên giảm hiệu ứng của nút lưu trong từng hàng; giữ chuyển động ở bộ lọc và bảng thống kê.

## Lộ trình tiếp theo

**P1 — Kiểm thử trực quan trên thiết bị thật:** so sánh màn hình desktop và điện thoại, cả chế độ sáng/tối, bàn phím, `prefers-reduced-motion`, CPU throttling. Kiểm tra thanh lọc khi có nhiều mục; hiệu ứng không được làm nút bị che hoặc lệch vị trí khi cuộn ngang.

**P2 — Chi tiết trận đấu:** cân nhắc `Tabs`/`Highlight` cho tab Tổng quan, Thống kê, Đội hình, Diễn biến; chỉ sử dụng khi không xung đột với dialog hiện tại. Các biến động tỷ số và thông số phải phản ánh dữ liệu thật.

**P3 — Trang bảng xếp hạng:** cân nhắc chuyển động đổi thứ hạng/hàng được chú ý khi dữ liệu mới được xác thực; không xếp hiệu ứng trên toàn bảng mỗi lần tải lại.

**P4 — Tối ưu:** chỉ thêm hiệu ứng có ích sau khi đo lượng JavaScript, tốc độ hiển thị và độ mượt trên mobile. Duy trì mức tối thiểu chuyển động khi người dùng yêu cầu giảm chuyển động.

## Kiểm tra

Chạy `npm run typecheck`, `npm run lint`, `npm test` và `npm run build`. Thực hiện kiểm thử thao tác giao diện trên desktop/mobile trước khi đưa lên production.
