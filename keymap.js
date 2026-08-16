// keymap.js - Single source of truth cho map phím -> [cột3, cột4, cột5].
// Dùng `var` (không `const`) để biến thành global, chia sẻ giữa content.js,
// popup.js và on-page legend. Đổi ở đây là tất cả nơi tự cập nhật theo.
var TYPE_KEY_MAP = {
  // Phím "a" = Đạt. Giá trị ĐỘNG theo 2 lựa chọn trong popup:
  //   cột3 = "chọn số mặt", cột5 = "số ảnh cần đạt" (xem passTriple() + content.js).
  //   Chuỗi dưới chỉ là nhãn placeholder hiển thị trong bảng phím tắt.
  a: ["số mặt", "Đạt", "số ảnh cần đạt"],
  b: ["0", "Không Đạt", "Sai đối tượng (cây cối, nhà,...)"],
  c: ["0", "Không Đạt", "Sai vị trí TB"],
  d: ["0", "Không Đạt", "Hình đen, hình mờ, không rõ sản phẩm"],
  e: ["0", "Không Đạt", "Không đủ số mặt TB"],
  f: ["0", "Không Đạt", "Không chụp ảnh TB"],
  g: ["0", "Không Đạt", "Ảnh giả, chụp thông qua thiết bị khác"],
  h: ["0", "Không Đạt", "Ảnh trùng với điểm bán khác"],
  i: ["0", "Không Đạt", "Có 1 ảnh đạt"],
  j: ["0", "Không Đạt", "Sai loại hàng TB"],
  q: ["0", "Không Đạt", "Không đầy 1 ngăn tủ TB"],
  w: ["0", "Không Đạt", "Sai vị trí TB, không xác định được loại tủ TB"],
  s: ["0", "Không Đạt", "TB không đủ 100% diện tích kệ"],
};

// Lựa chọn cho 2 dropdown chấm "Đạt" (popup.js dựng <option> từ đây).
var SO_ANH_OPTIONS = ["Có 1 ảnh đạt", "Có 2 ảnh đạt"];
var SO_MAT_OPTIONS = ["1", "4", "6", "8", "10", "12", "16"];

// Bộ 3 giá trị cho phím "a" (Đạt): cột3 = số mặt, cột4 = "Đạt", cột5 = số ảnh cần đạt.
function passTriple(soMat, soAnh) {
  return [String(soMat || ""), "Đạt", String(soAnh || "")];
}

// Gắn lên window để chắc chắn truy cập được từ content script (isolated world)
// và từ popup.js — top-level `var` không phải lúc nào cũng đính kèm window.
if (typeof window !== "undefined") {
  window.TYPE_KEY_MAP = TYPE_KEY_MAP;
  window.SO_ANH_OPTIONS = SO_ANH_OPTIONS;
  window.SO_MAT_OPTIONS = SO_MAT_OPTIONS;
  window.passTriple = passTriple;
}
