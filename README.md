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

### 1b) Gộp đơn vị
- 2 ô trong popup, mỗi ô nhập 1 hoặc nhiều mã đơn vị (cách nhau bởi dấu phẩy / khoảng trắng):
  - **Đơn vị gốc** — đơn vị được phép gộp, vd `DN1001M1`.
  - **Gộp đơn vị** — đơn vị lọc thêm cùng đơn vị gốc, vd `DN1003M1`.
- Mỗi lần Next/Tìm kiếm, dòng có Đơn vị **thuộc Đơn vị gốc** → ô **Đơn vị** trên trang chọn
  **đơn vị của dòng + các mã gộp** rồi mới tìm (vd dòng `DN1001M1 / 006` → lọc cả `DN1001M1`
  và `DN1003M1`).
- Dòng có Đơn vị **khác Đơn vị gốc** (vd `AT1001M1 / 00A`) → không gộp, chỉ lọc đúng đơn vị
  của dòng như cũ.
- Khi đang **Chấm theo chương trình** (mục 3b) và kết quả có nhiều album cùng chương trình
  (mỗi đơn vị 1 album), extension lần lượt mở **từng album**, lấy ảnh của từng cái rồi gom
  **tất cả** vào 1 popup ảnh (tiêu đề hiện các đơn vị, vd `DN1001M1 + DN1003M1`).
  Chỉ có 1 album → như cũ.
- Mã gộp không có trong ô Đơn vị → bỏ qua mã đó, toast `⚠ Không có ĐV gộp: <mã>`.
- Dòng không có Đơn vị (danh sách 1 cột) → không đụng ô Đơn vị, kể cả mã gộp.
- Để trống 1 trong 2 ô = không gộp. Đổi ô có hiệu lực từ lần Next/Tìm kiếm tiếp theo.

### 2) Mở trang Quản lý media → Hình ảnh

### 3) Next qua từng dòng
- `→` (mũi tên phải) = Next, `←` = Prev. Mỗi bước: chọn Đơn vị → điền Mã KH → bấm Tìm kiếm.
- Hoặc bấm nút **Next → / ← Prev** trong popup.

### 3b) Chấm theo chương trình (tự mở album sau khi Tìm kiếm)
- Trong popup, chọn **Tháng chấm ảnh** (`01`–`12`, mặc định = tháng hiện tại). Tháng này
  quyết định phần `MM` của mã chương trình: tháng `07` → `CTTBGTTQ`**`07`**`26SSML_MCM`,
  tháng `08` → `CTTBGTTQ`**`08`**`26SSML_MCM`. Phần `YY` luôn là **năm hiện tại**.
- Đổi tháng → danh sách chương trình dựng lại theo tháng mới, **giữ nguyên hậu tố đang chọn**
  (đang chọn `...SSML_MCM` tháng 07, đổi sang 08 → tự thành `CTTBGTTQ0826SSML_MCM`).
- Chọn **Chương trình kéo dài** (`1 tháng` / `2 tháng`, mặc định `1 tháng`). Chọn `2 tháng` →
  chương trình có chữ `MCC` (`STTTMCC_*`) ghép thêm tháng kế tiếp vào mã: tháng `09` →
  `CTTBGTTQ`**`0910`**`26STTTMCC_CHS` (tháng `12` → `1201`). Chương trình khác giữ nguyên 1 tháng.
  Đổi lựa chọn này cũng giữ nguyên hậu tố chương trình đang chọn.
- Ở mục **Chấm theo chương trình**, chọn 1 chương trình (vd `CTTBGTTQ0626STNX_KH`).
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

- Header popup hiện bộ đếm `3 / 5 · Đạt 2/2` — vế sau là **số ảnh chấm đạt trong lượt này /
  số ảnh cần đạt** (lấy từ option **Số ảnh cần đạt** trong popup extension). Đủ số → đếm chuyển
  màu xanh.
- **Chỉ tính ảnh chấm `1` trong lượt vào KH hiện tại** (từ lúc sang KH tới lúc rời KH; đóng popup
  bằng nút **✕ Đóng** rồi mở lại cùng KH vẫn giữ). Ảnh đã đạt từ lượt trước (kết quả cũ trên
  server) vẫn hiện ✓ nhưng **không được tính, phải chấm lại** — footer ảnh đó hiện
  `trước: ✓ Đạt` kèm 2 nút chấm. Rời KH rồi quay lại → đếm lại từ 0.
- Bấm **`Esc`** khi đã đủ số ảnh đạt → popup đóng **và tự gán kết quả của phím `A`**
  (bộ 3 `số mặt / Đạt / số ảnh cần đạt`) cho KH hiện tại + copy 3 cột vào clipboard,
  y như bấm `A` thủ công.
- Chưa đủ **nhưng có ảnh đạt** → `Esc` tự gán phím lý do `0 / Không Đạt / Có <n> ảnh đạt`
  đúng số ảnh đã đạt + copy 3 cột: 1 ảnh → **`I`**, 2 ảnh → **`Z`**, 3 ảnh → **`X`**
  (vd chọn "Có 4 ảnh đạt" mà chỉ chấm đạt 3 ảnh → phím `X`).
- Chưa đủ và **0 ảnh đạt trong lượt này** → `Esc` chỉ đóng popup, không gán gì (kể cả KH đã
  đạt từ lượt trước).
- Extension **đợi các lần chấm đang lưu xong rồi mới đếm**: ảnh chấm lỗi bị hoàn tác
  sẽ không được tính là đạt.

Ví dụ: chọn **Số ảnh cần đạt = "Có 2 ảnh đạt"**, chấm `1` cho 2 ảnh rồi bấm `Esc`
→ dòng kết quả tự có `<số mặt>  Đạt  Có 2 ảnh đạt`.
Cũng option đó nhưng chỉ chấm `1` cho 1 ảnh rồi bấm `Esc`
→ dòng kết quả tự có `0  Không Đạt  Có 1 ảnh đạt`.
Chọn **"Có 4 ảnh đạt"**, chấm `1` cho 2 ảnh rồi bấm `Esc`
→ dòng kết quả tự có `0  Không Đạt  Có 2 ảnh đạt`.
KH đã đạt 2 ảnh từ lượt trước, mở lại rồi bấm `Esc` ngay → không lưu gì; phải chấm `1` lại
2 ảnh rồi mới tự lưu `A`.

Phím `Tab` trong popup ảnh và trong ô **Mã KH trùng** **không làm gì** (đóng popup mà không lưu
thì bấm nút **✕ Đóng**).

### 4d2) Popup ảnh — phím `Shift` nhảy tới ảnh đã chấm

Trong popup gallery ảnh, bấm **`Shift`** (bấm riêng, rồi thả) → nhảy tới **ảnh đã chấm kế tiếp**
trong dải thumbnail (ảnh có ✓ hoặc ✕, gồm cả ảnh chấm từ trước trên server):

- Mỗi lần bấm sang ảnh đã chấm tiếp theo; hết thì quay lại ảnh đã chấm đầu tiên.
- Chưa có ảnh nào đã chấm → toast `Chưa có ảnh nào đã chấm`, đứng yên.
- Chỉ nhảy khi **thả** Shift mà không bấm phím nào khác trong lúc giữ: `Shift` + phím khác
  (vd `Shift+B`) vẫn chạy như phím đó, không nhảy ảnh.
- Đang gõ trong ô **Mã KH trùng** → `Shift` không nhảy.

### 4d3) Popup ảnh — phím `` ` `` về ảnh đầu tiên

Trong popup gallery ảnh, bấm **`` ` ``** (phím bên trái số `1`) → nhảy về **ảnh đầu tiên** trong
dải thumbnail (chỉ chuyển ảnh, không chấm, không lưu gì). Nhận theo vị trí phím nên vẫn chạy khi
đang bật bộ gõ tiếng Việt.

### 4e) Trong popup ảnh — phím "Không Đạt" tự chấm ảnh 0

Khi **popup gallery ảnh đang mở**, bấm một phím có cột 4 = `Không Đạt`
(`b c d e f g h i j q w s z x`) sẽ làm 2 việc liền:

1. Lưu bộ 3 giá trị của phím đó cho KH hiện tại + copy 3 cột vào clipboard (như cũ).
2. **Tự chấm ảnh đang xem = Không Đạt**, y như bấm phím `0` — chỉ ảnh đang xem,
   các ảnh khác trong popup giữ nguyên.

Phím `a` (Đạt) không tự chấm gì. Ngoài popup (chấm trực tiếp khung `#divDetail`)
cũng **không** tự chấm — giữ nguyên hành vi cũ.

Nhận diện phím "Không Đạt" dựa trên **cột 4 trong `keymap.js`**, nên thêm lý do mới
vào `TYPE_KEY_MAP` là tự động có tính năng này, không phải sửa `content.js`.

### 4f) Popup ảnh — chấm xong tự sang ảnh của ngày kế tiếp

Trong popup gallery ảnh, chấm 1 ảnh xong (phím `1` / `0`, nút `✓ Đạt` / `✗ Chưa đạt`,
hoặc phím "Không Đạt" ở mục 4e) → tự chuyển sang **ảnh kế tiếp chụp ngày khác**:

- Ngày lấy theo ngày hiện dưới footer popup (`17/09/2026-10:37` → ngày `17/09/2026`).
- Tìm tiếp về phía sau tới ảnh đầu tiên khác ngày với ảnh vừa chấm **mà lượt này chưa chấm**;
  hết thì quay lại đầu danh sách.
- Ảnh ngày khác **đã chấm ở lượt trước vẫn chuyển tới** (phải chấm lại, mục 4d); ảnh đã chấm
  **trong lượt này** thì bỏ qua.
- Ví dụ: ảnh `17/09` ×2, `04/09` ×2, `01/09` ×1 — bấm `1` liên tiếp sẽ chấm lần lượt `17/09` đầu
  → `04/09` đầu → `01/09` → `17/09` thứ hai → `04/09` thứ hai, mỗi ảnh đúng 1 lần.
- Ngày khác không còn ảnh nào lượt này chưa chấm (hoặc mọi ảnh cùng 1 ngày) → chuyển sang **ảnh
  chưa chấm trong lượt này kế tiếp**, gồm cả ảnh đã chấm ở lượt trước. Chấm hết thì đứng yên, bấm
  `Esc` để lưu kết quả.

### 4g) Auto next — lưu xong kết quả tự sang KH tiếp

Tích ô **Auto next** trong popup extension (mặc định tắt). Khi bật:

| Tình huống | Không bật (như cũ) | Bật Auto next |
| --- | --- | --- |
| Popup ảnh: chấm `1` đến khi **đủ số ảnh cần đạt** (đếm trong lượt này, mục 4d) | bấm `Esc` rồi `→` | tự lưu kết quả phím `A` + đóng popup + Next, **không cần `Esc`** |
| Popup ảnh: chưa đủ, bấm `Esc` (tự lưu `Có <n> ảnh đạt`) | bấm `→` | tự Next |
| Popup ảnh: bấm phím gán giá trị (`a b c …`) | đóng popup rồi bấm `→` | tự đóng popup + Next |
| Không có popup: bấm phím gán giá trị | bấm `→` | tự Next |
| `Esc` mà lượt này 0 ảnh đạt / chưa chọn số ảnh, số mặt (không lưu gì) | — | đứng yên, không Next |

- Đủ số ảnh đạt thì Next luôn, các ảnh còn lại **không được chấm**.
- Luôn **đợi các lần chấm ảnh lưu xong** rồi mới Next. Lưu lỗi làm tụt dưới số ảnh cần đạt →
  không tự lưu, chấm tiếp đủ thì tự lưu lại.
- Chỉ Next khi vẫn đang ở đúng KH vừa lưu: bấm `→` tay trong lúc chờ không bị nhảy 2 KH.
- Ngay sau khi tự Next (~0.7 giây), mọi phím 1 ký tự (`a`…`z`, `=`, `0`–`3`) và `←` `→` bị bỏ
  qua (có toast báo), và giữ phím gán giá trị không lặp lại: bấm 2 lần / thói quen bấm `→`
  không ghi nhầm, không gõ lạc vào ô Mã KH, không nhảy qua KH mới.
- Đang mở ô **Mã KH trùng** (`=`) → chờ Enter (lưu) / Esc (bỏ) ô đó xong mới Next, kể cả khi con
  trỏ đã rời ô. Nên làm theo thứ tự `=` → nhập mã → Enter **rồi mới** bấm phím lý do (vd `H`),
  vì phím lý do là Next luôn.
- KH cuối → báo "Đã hết danh sách" như bấm `→`.
- Như cũ (không đổi): `Esc` trong popup tự lưu lại `A` / `Có <n> ảnh đạt` nếu lượt này có ảnh
  đạt, ghi đè phím vừa bấm. Muốn giữ phím lý do thì đóng popup bằng nút **✕ Đóng**.

### 5) Nhập Mã KH trùng (cột 6) — phím `=`
- Bấm `=` để mở ô nhập **Mã KH trùng** cho KH hiện tại.
- **Enter** = lưu, **Esc** = đóng, để trống + Enter = xóa. `Tab` trong ô không làm gì.
- Ô tự đóng khi Next/Prev.
- Dùng được cả khi **popup ảnh đang mở**: ô nhập hiện đè lên popup. Gõ trong ô không bị hiểu
  là phím chấm (`1` `0` `a`…), `3` vẫn paste clipboard; `Esc` trong ô chỉ đóng ô, popup ảnh
  vẫn mở.

Ví dụ: tại `AT1001M1 / 0CP`, bấm `H` rồi bấm `=` nhập `KV3AT1001M1090SM1001163`, dòng kết quả:

```
AT1001M1	0CP	0	Không Đạt	Ảnh trùng với điểm bán khác	KV3AT1001M1090SM1001163
```

### 6) Xuất kết quả
Kết quả mỗi dòng gồm 7 cột: **Đơn vị | Mã KH | val1 | val2 | val3 | Mã KH trùng | Ngày chấm**.

**Ngày chấm** = ngày hiện tại, dạng `dd/mm/yyyy` (vd `28/09/2026`). Mã KH trùng trống vẫn giữ Tab ngăn cột, nên Ngày chấm luôn dán đúng cột 7. Dòng chưa chấm để trống Ngày chấm.

- **Copy đủ 7 cột** — copy toàn bộ 7 cột theo thứ tự danh sách.
- **Copy trừ ĐV+Mã KH** — chỉ copy 5 cột giá trị (val1, val2, val3, Mã KH trùng, Ngày chấm) để dán cạnh danh sách có sẵn.
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

- 1.3.35: popup ảnh chỉ đếm ảnh chấm Đạt **trong lượt vào KH hiện tại** — bộ đếm `Đạt x/y`, Auto next tự lưu `A`, `Esc` tự lưu `A` / `Có <n> ảnh đạt`. Ảnh đạt từ lượt trước vẫn hiện ✓ nhưng phải chấm lại (footer hiện `trước: …` kèm nút chấm; chấm xong tự nhảy tới cả ảnh đó). Chấm xong nhảy sang ngày khác thì bỏ qua ảnh đã chấm trong lượt này. Bỏ phím **`Tab`** đóng popup (giờ `Tab` trong popup và ô Mã KH trùng không làm gì); nút đổi nhãn thành **✕ Đóng**.
- 1.3.34: kết quả thêm cột 7 **Ngày chấm** (ngày hiện tại, `dd/mm/yyyy`) sau Mã KH trùng; Mã KH trùng trống vẫn giữ đúng cột.
- 1.3.33: phím **`` ` ``** trong popup ảnh nhảy về ảnh đầu tiên.
- 1.3.32: phím **`Shift`** (bấm riêng) trong popup ảnh nhảy tới ảnh đã chấm kế tiếp, hết thì quay lại đầu.
- 1.3.31: phím **`Tab`** trong popup ảnh chỉ đóng popup (như nút ✕, không lưu kết quả, không Next). Nút đổi nhãn thành **✕ Đóng (Tab/Esc)**.
- 1.3.30: thêm ô **Đơn vị gốc** cho Gộp đơn vị — chỉ dòng có Đơn vị thuộc Đơn vị gốc mới được lọc gộp; dòng thuộc đơn vị khác lọc như cũ.
- 1.3.29: popup ảnh chấm xong tự sang **ảnh của ngày kế tiếp** (ảnh đầu tiên khác ngày phía sau, kể cả ảnh đã chấm) thay vì ảnh chưa chấm kế tiếp. Chỉ có 1 ngày → sang ảnh chưa chấm kế tiếp như cũ.
- 1.3.28: thêm ô **Gộp đơn vị**. Tìm kiếm chọn thêm các đơn vị gộp cùng đơn vị của dòng; chấm theo chương trình mở hết album khớp (mỗi đơn vị 1 album) và gom ảnh vào 1 popup.
- 1.3.27: thêm ô **Auto next**. Bật → đủ số ảnh cần đạt tự lưu phím `A` + sang KH tiếp (không cần `Esc`); `Esc` hoặc phím gán giá trị lưu xong cũng tự đóng popup ảnh + Next. Tắt → như cũ.
- 1.3.26: bấm `=` được ngay trong popup ảnh (ô Mã KH trùng hiện đè lên popup); gõ trong ô không bị hiểu là phím chấm, `Esc` trong ô chỉ đóng ô.
- 1.3.25: popup ảnh chấm `1` / `0` (hoặc nút ✓/✗, phím Không Đạt) xong tự sang ảnh chưa chấm kế tiếp, quay lại ảnh bị bỏ qua; chấm hết thì đứng yên.
- 1.3.24: thêm option **Chương trình kéo dài** (`1 tháng` / `2 tháng`). `2 tháng` → mã chương trình có chữ `MCC` ghép thêm tháng kế tiếp (tháng `09` → `CTTBGTTQ091026STTTMCC_CHS`); chương trình khác không đổi.
- 1.3.23: thêm option **Có 4 ảnh đạt** cho *Số ảnh cần đạt* + 2 lý do Không Đạt: phím `Z` = `Có 2 ảnh đạt`, `X` = `Có 3 ảnh đạt`. Chấm thiếu số ảnh cần đạt → `Esc` tự lưu lý do `Có <n> ảnh đạt` theo số ảnh đã đạt (1 → `I`, 2 → `Z`, 3 → `X`); 0 ảnh đạt vẫn không tự lưu.
- 1.3.22: thêm option **Tháng chấm ảnh** (`01`–`12`, mặc định tháng hiện tại) quyết định phần `MM` của mã **Chấm theo chương trình**. Đổi tháng thì giữ nguyên hậu tố chương trình đang chọn.
- 1.3.21: trong popup ảnh, bấm phím "Không Đạt" (`b c d e f g h i j q w s`) tự chấm luôn ảnh đang xem = Không Đạt (như bấm phím `0`). Nhận diện theo cột 4 `Không Đạt` trong `keymap.js`.
- 1.3.20: chấm thiếu số ảnh cần đạt nhưng có **đúng 1 ảnh đạt** → bấm `Esc` tự lưu kết quả phím `I` (`0 / Không Đạt / Có 1 ảnh đạt`) thay vì bỏ trống. 0 ảnh đạt vẫn không tự lưu.
- 1.3.19: sửa lỗi bấm `Esc` khi đã đủ số ảnh đạt nhưng không lưu kết quả phím `A` — bộ đếm ảnh đạt tách khỏi `popupApi` (state của popup đang mở), không còn im lặng bỏ qua khi `popupApi` đã bị xóa. Kết quả cũng được chốt theo **KH sở hữu popup ảnh**, nên bấm `Esc` rồi bấm `→` ngay không còn ghi nhầm sang KH kế.
- 1.3.18: popup ảnh đếm "Đạt x/y" theo option **Số ảnh cần đạt**; đủ số thì bấm `Esc` tự lưu kết quả phím `A`.
- 1.2.0: chấm theo chương trình — chọn 1 chương trình trong popup, mỗi lần Tìm kiếm tự bấm album khớp CODE (chống bấm nhầm KH trước bằng cờ stale).
- 1.1.0: chọn Đơn vị (Kendo), nhập 2 cột, bộ 3 giá trị/phím (A–P), cột Mã KH trùng (phím `=`), copy 6 cột / 4 cột.
- 1.0.0: next Mã KH + bấm Tìm kiếm, gán Type đơn, copy TSV.
