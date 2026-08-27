# KH Auto Next — Chrome Extension

Extension hỗ trợ chấm media trên trang Quản lý media: tự **chọn Đơn vị** (Kendo MultiSelect) + **điền Mã KH** + bấm **Tìm kiếm**, gán nhanh kết quả bằng phím tắt và xuất ra TSV để dán vào Google Sheets.

## Danh sách file

```
kh-auto-next/
├── manifest.json   # Khai báo extension (v1.1.0)
├── popup.html      # Giao diện popup
├── popup.js        # Logic popup (parse list, lưu state, gửi message, copy TSV)
├── content.js      # Script trên trang web (điền KH, phím tắt, gán giá trị, ô KH trùng)
├── inject.js       # Script chạy ở MAIN world để điều khiển Kendo MultiSelect (ô Đơn vị)
├── icons/          # (tuỳ chọn) icon16/48/128.png
└── README.md
```

> Lưu ý: `inject.js` là file bắt buộc cho việc chọn Đơn vị. Đừng quên copy kèm.

## Cài đặt

1. Mở Chrome → `chrome://extensions/`
2. Bật **Developer mode** (góc phải trên)
3. **Load unpacked** → chọn thư mục chứa các file trên
4. Ghim icon extension cho dễ bấm
5. Mỗi lần cập nhật file → bấm **Reload** (vòng tròn) trong trang extensions

## Cách dùng

### 1) Nạp danh sách (2 cột)
- Mở popup, paste danh sách dạng **2 cột**: cột 1 = **Đơn vị**, cột 2 = **Mã KH**.
- Tách bằng Tab / khoảng trắng / dấu phẩy đều được (paste trực tiếp từ Sheets là chuẩn nhất).
- Bấm **Bắt đầu**.

```
AT1001M1	006
AT1001M1	00A
AT1001M1	00B
```

(Dòng chỉ có 1 cột sẽ được hiểu là Mã KH, Đơn vị để trống.)

### 2) Mở trang Quản lý media → Hình ảnh

### 3) Next qua từng dòng
- `→` (mũi tên phải) = Next, `←` = Prev. Mỗi bước: chọn Đơn vị → điền Mã KH → bấm Tìm kiếm.
- Hoặc bấm nút **Next → / ← Prev** trong popup.

### 3b) Chấm theo chương trình (tự mở album sau khi Tìm kiếm)
- Trong popup, ở mục **Chấm theo chương trình**, chọn 1 chương trình (vd `CTTBGTTQ0626STNX_KH`).
- Từ đó mỗi lần Next/Tìm kiếm, sau khi kết quả load xong, extension **tự bấm album đúng chương trình đó** (gọi `Images.showAlbumDetail`).
- Khớp theo CODE trong `onclick` của link album trong `#imageContent`. Không tìm thấy chương trình → bỏ qua, không bấm.
- Để chống bấm nhầm kết quả của KH trước, các album cũ được đánh dấu `data-kh-stale` ngay trước khi search; chỉ album mới (chưa stale) mới được bấm. Poll tối đa ~6s chờ AJAX.
- Chọn `— Không chấm theo chương trình —` để tắt.

### 4) Gán kết quả bằng phím (A–P)
Mỗi phím gán **bộ 3 giá trị** (cột 3 / cột 4 / cột 5) cho KH hiện tại:

| Phím | Cột3 | Cột4      | Cột5 (lý do)                                  |
| ---- | ---- | --------- | --------------------------------------------- |
| A    | 8    | Đạt       | Có 2 ảnh đạt                                  |
| B    | 0    | Không Đạt | Sai đối tượng (cây cối, nhà,...)              |
| C    | 0    | Không Đạt | Sai vị trí TB                                 |
| D    | 0    | Không Đạt | Hình đen, hình mờ, không rõ sản phẩm          |
| E    | 0    | Không Đạt | Không đủ số mặt TB                            |
| F    | 0    | Không Đạt | Không chụp ảnh TB                            |
| G    | 0    | Không Đạt | Ảnh giả, chụp thông qua thiết bị khác         |
| H    | 0    | Không Đạt | Ảnh trùng với điểm bán khác                   |
| I    | 0    | Không Đạt | Có 1 ảnh đạt                                  |
| J    | 0    | Không Đạt | Sai loại hàng TB                             |
| K    | 10   | Đạt       | Có 2 ảnh đạt                                  |
| L    | 4    | Đạt       | Có 2 ảnh đạt                                  |
| M    | 12   | Đạt       | Có 2 ảnh đạt                                  |
| N    | 1    | Đạt       | Có 1 ảnh đạt                                  |
| O    | 0    | Không Đạt | Không đầy 1 ngăn tủ TB                        |
| P    | 0    | Không Đạt | Sai vị trí TB, không xác định được loại tủ TB |

Sau khi bấm phím, 3 cột giá trị tự copy vào clipboard → Ctrl/Cmd+V dán 1 lần ra 3 ô Sheets.

### 4b) Chấm trưng bày nhanh trên trang — phím `1` / `0`
Khi khung chi tiết ảnh (`#divDetail`) **có thuộc tính `value`** (tức đang có ảnh để chấm):

- `1` → tích **Đạt trưng bày** (`#chkResult`) rồi **tự bấm Lưu** (`#btnSaveDetail`).
- `0` → tích **Không đạt** (`#chkNotResult`) rồi **tự bấm Lưu**.

Nếu `#divDetail` không có `value` (chưa chọn ảnh) → bỏ qua và hiện toast nhắc.
Hai phím này dùng `.click()` nên kích hoạt đúng hàm gốc của trang
(`Images.changeCheckDisplay` và `Images.updateResult`).

### 4c) Xác nhận hộp thoại — phím `2` / `3`
Sau khi bấm Lưu, trang hiện hộp thoại EasyUI messager "Bạn có muốn lưu thông tin này?":

- `2` → bấm **Đồng ý**.
- `3` → bấm **Hủy bỏ**.

Vì trang có nhiều nút "Đồng ý" ở chỗ khác, extension chỉ bắt đúng cấu trúc hộp thoại
messager (`div.messager-body` → `div.messager-button` → `a.l-btn`) và chỉ chọn hộp thoại
**đang hiển thị**, khớp theo text "Đồng ý" / "Hủy bỏ".

### 4d) Đủ số ảnh đạt → bấm `Esc` tự lưu kết quả phím `A`
Trong **popup gallery ảnh** (phím `1` = Đạt, `0` = Chưa đạt cho từng ảnh):

- Header popup hiện bộ đếm `3 / 5 · Đạt 2/2` — vế sau là **số ảnh đã đạt / số ảnh cần đạt**
  (lấy từ option **Số ảnh cần đạt** trong popup extension). Đủ số → đếm chuyển màu xanh.
- Bấm **`Esc`** khi đã đủ số ảnh đạt → popup đóng **và tự gán kết quả của phím `A`**
  (bộ 3 `số mặt / Đạt / số ảnh cần đạt`) cho KH hiện tại + copy 3 cột vào clipboard,
  y như bấm `A` thủ công.
- Chưa đủ **nhưng có đúng 1 ảnh đạt** (vd chọn "Có 2 ảnh đạt" mà chỉ chấm đạt 1 ảnh)
  → `Esc` tự gán kết quả của phím **`I`** (`0 / Không Đạt / Có 1 ảnh đạt`) + copy 3 cột.
- Chưa đủ và **0 ảnh đạt** → `Esc` chỉ đóng popup như cũ, không gán gì.
- Extension **đợi các lần chấm đang lưu xong rồi mới đếm**: ảnh chấm lỗi bị hoàn tác
  sẽ không được tính là đạt.

Ví dụ: chọn **Số ảnh cần đạt = "Có 2 ảnh đạt"**, chấm `1` cho 2 ảnh rồi bấm `Esc`
→ dòng kết quả tự có `<số mặt>  Đạt  Có 2 ảnh đạt`.
Cũng option đó nhưng chỉ chấm `1` cho 1 ảnh rồi bấm `Esc`
→ dòng kết quả tự có `0  Không Đạt  Có 1 ảnh đạt`.

### 4e) Trong popup ảnh — phím "Không Đạt" tự chấm ảnh 0

Khi **popup gallery ảnh đang mở**, bấm một phím có cột 4 = `Không Đạt`
(`b c d e f g h i j q w s`) sẽ làm 2 việc liền:

1. Lưu bộ 3 giá trị của phím đó cho KH hiện tại + copy 3 cột vào clipboard (như cũ).
2. **Tự chấm ảnh đang xem = Không Đạt**, y như bấm phím `0` — chỉ ảnh đang xem,
   các ảnh khác trong popup giữ nguyên.

Phím `a` (Đạt) không tự chấm gì. Ngoài popup (chấm trực tiếp khung `#divDetail`)
cũng **không** tự chấm — giữ nguyên hành vi cũ.

Nhận diện phím "Không Đạt" dựa trên **cột 4 trong `keymap.js`**, nên thêm lý do mới
vào `TYPE_KEY_MAP` là tự động có tính năng này, không phải sửa `content.js`.

### 5) Nhập Mã KH trùng (cột 6) — phím `=`
- Bấm `=` để mở ô nhập **Mã KH trùng** cho KH hiện tại.
- **Enter** = lưu, **Esc** = đóng, để trống + Enter = xóa.
- Ô tự đóng khi Next/Prev.

Ví dụ: tại `AT1001M1 / 0CP`, bấm `H` rồi bấm `=` nhập `KV3AT1001M1090SM1001163`, dòng kết quả:

```
AT1001M1	0CP	0	Không Đạt	Ảnh trùng với điểm bán khác	KV3AT1001M1090SM1001163
```

### 6) Xuất kết quả
Kết quả mỗi dòng gồm 6 cột: **Đơn vị | Mã KH | val1 | val2 | val3 | Mã KH trùng**.

- **Copy đủ 6 cột** — copy toàn bộ 6 cột theo thứ tự danh sách.
- **Copy trừ ĐV+Mã KH** — chỉ copy 4 cột giá trị (val1, val2, val3, Mã KH trùng) để dán cạnh danh sách có sẵn.
- **Xóa kết quả** — xóa toàn bộ giá trị đã gán (gồm cả cột Mã KH trùng).
- **Reset** — xóa cả danh sách + tiến độ + kết quả.

## Troubleshooting

**Không chọn được Đơn vị:**
- Ô Đơn vị là Kendo MultiSelect `#shop`. `inject.js` dò option theo **text hiển thị** (vd `AT1001M1`).
- Nếu trang đổi id khác `shop` → sửa chữ `"shop"` trong `inject.js`.
- Nếu một đơn vị không khớp option nào → toast hiện `⚠ Đơn vị?` (vẫn điền Mã KH bình thường).

**Lỗi "Không tìm thấy ô KH":**
- Extension dò ô KH qua `#customerCode`, label "KH", placeholder "Mã KH", hoặc attribute chứa "kh".

**Debug:** F12 → Console, tìm log `[KH Auto Next] Content script loaded` và `inject.js (main world) loaded`.

## Lịch sử

- 1.3.21: trong popup ảnh, bấm phím "Không Đạt" (`b c d e f g h i j q w s`) tự chấm luôn ảnh đang xem = Không Đạt (như bấm phím `0`). Nhận diện theo cột 4 `Không Đạt` trong `keymap.js`.
- 1.3.20: chấm thiếu số ảnh cần đạt nhưng có **đúng 1 ảnh đạt** → bấm `Esc` tự lưu kết quả phím `I` (`0 / Không Đạt / Có 1 ảnh đạt`) thay vì bỏ trống. 0 ảnh đạt vẫn không tự lưu.
- 1.3.19: sửa lỗi bấm `Esc` khi đã đủ số ảnh đạt nhưng không lưu kết quả phím `A` — bộ đếm ảnh đạt tách khỏi `popupApi` (state của popup đang mở), không còn im lặng bỏ qua khi `popupApi` đã bị xóa. Kết quả cũng được chốt theo **KH sở hữu popup ảnh**, nên bấm `Esc` rồi bấm `→` ngay không còn ghi nhầm sang KH kế.
- 1.3.18: popup ảnh đếm "Đạt x/y" theo option **Số ảnh cần đạt**; đủ số thì bấm `Esc` tự lưu kết quả phím `A`.
- 1.2.0: chấm theo chương trình — chọn 1 chương trình trong popup, mỗi lần Tìm kiếm tự bấm album khớp CODE (chống bấm nhầm KH trước bằng cờ stale).
- 1.1.0: chọn Đơn vị (Kendo), nhập 2 cột, bộ 3 giá trị/phím (A–P), cột Mã KH trùng (phím `=`), copy 6 cột / 4 cột.
- 1.0.0: next Mã KH + bấm Tìm kiếm, gán Type đơn, copy TSV.
