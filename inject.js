// inject.js — chạy trong MAIN world của trang (có quyền truy cập window.jQuery / window.kendo)
// Nhiệm vụ: nhận message từ content script qua window.postMessage, rồi set giá trị
// cho ô "Đơn vị" (Kendo MultiSelect #shop) bằng API chính thức của Kendo.
//
// Vì sao cần file riêng ở main world?
//   - Content script chạy ở "isolated world", KHÔNG đọc được window.jQuery / kendo của trang.
//   - Dùng <script src=...> (web_accessible_resource) thay vì inline để tránh bị CSP chặn.

(function () {
  if (window.__KH_INJECT_INSTALLED__) return;
  window.__KH_INJECT_INSTALLED__ = true;

  function getJQ() {
    return (
      window.jQuery ||
      window.$ ||
      (window.kendo && window.kendo.jQuery) ||
      null
    );
  }

  // Tìm value (theo dataValueField) của một đơn vị dựa trên TEXT hiển thị (vd "AT1001M1")
  function resolveValueByText(ms, text) {
    var want = String(text || "").trim().toLowerCase();
    if (!want) return null;

    // 1) Ưu tiên dò trong dataSource của widget (chuẩn nhất)
    try {
      var tf = (ms.options && ms.options.dataTextField) || "text";
      var vf = (ms.options && ms.options.dataValueField) || "value";
      var data = ms.dataSource.data();
      for (var i = 0; i < data.length; i++) {
        var it = data[i];
        var t = it[tf] != null ? String(it[tf]).trim().toLowerCase() : "";
        if (t === want) return it[vf];
      }
    } catch (e) {}

    // 2) Fallback: dò trực tiếp <option> của phần tử gốc #shop
    try {
      var el = document.getElementById("shop");
      if (el && el.options) {
        for (var j = 0; j < el.options.length; j++) {
          var o = el.options[j];
          if ((o.text || "").trim().toLowerCase() === want) return o.value;
        }
      }
    } catch (e) {}

    return null;
  }

  function setShop(text) {
    var jq = getJQ();
    if (!jq) return { ok: false, error: "Không tìm thấy jQuery của trang" };

    var ms = jq("#shop").data("kendoMultiSelect");
    if (!ms) return { ok: false, error: "Không tìm thấy widget kendoMultiSelect #shop" };

    var val = resolveValueByText(ms, text);
    if (val == null) {
      return { ok: false, error: "Đơn vị không khớp option: " + text };
    }

    // value([...]) thay thế toàn bộ lựa chọn hiện tại bằng đúng 1 đơn vị
    ms.value([val]);
    ms.trigger("change");
    return { ok: true, value: val };
  }

  // ====== Bắt response /images/get-images-for-popup để dựng popup gallery riêng ======
  // Content script ở isolated world không patch được fetch/XHR của trang -> làm ở main world này.
  var POPUP_API = /\/images\/get-images-for-popup/i;

  function emitPopupImages(text) {
    try {
      // Server id là Java Long (~18 chữ số) > Number.MAX_SAFE_INTEGER, nên JSON.parse
      // sẽ làm tròn mất chính xác (vd ...895 -> ...900). Quote số nguyên >=16 chữ số
      // thành string TRƯỚC khi parse để giữ nguyên id. Chỉ khớp giá trị đứng sau ':'
      // và trước ',' '}' ']' -> không đụng số nằm trong chuỗi (urlImage...).
      var safe = text.replace(/:(\s*)(-?\d{16,})(\s*[,}\]])/g, ':$1"$2"$3');
      var json = JSON.parse(safe);
      window.postMessage(
        { source: "KH_AUTO_NEXT_PAGE", type: "POPUP_IMAGES", data: json },
        "*",
      );
    } catch (e) {}
  }

  // Patch XMLHttpRequest (jQuery/EasyUI ajax dùng XHR)
  (function patchXHR() {
    var XHR = window.XMLHttpRequest;
    if (!XHR || !XHR.prototype || XHR.prototype.__kh_patched__) return;
    var open = XHR.prototype.open;
    var send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__kh_url = url;
      return open.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      var self = this;
      if (self.__kh_url && POPUP_API.test(String(self.__kh_url))) {
        self.addEventListener("load", function () {
          emitPopupImages(self.responseText);
        });
      }
      return send.apply(this, arguments);
    };
    XHR.prototype.__kh_patched__ = true;
  })();

  // Patch fetch (phòng khi trang dùng fetch)
  (function patchFetch() {
    if (!window.fetch || window.fetch.__kh_patched__) return;
    var orig = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var p = orig.apply(this, arguments);
      if (POPUP_API.test(String(url))) {
        p.then(function (res) {
          res
            .clone()
            .text()
            .then(emitPopupImages)
            .catch(function () {});
        }).catch(function () {});
      }
      return p;
    };
    window.fetch.__kh_patched__ = true;
  })();

  // Đóng fancybox gốc -> reset cờ "dialog đang mở" của trang để lần sau còn gọi lại API
  function closeFancybox() {
    try {
      var jq = getJQ();
      if (!jq || !jq.fancybox) return;
      var fb = jq.fancybox;
      if (typeof fb.close === "function") fb.close(true);
      if (typeof fb.getInstance === "function") {
        var inst = fb.getInstance();
        if (inst && typeof inst.close === "function") inst.close(true);
      }
    } catch (e) {}
  }

  // Gọi API chấm kết quả ảnh (POST /images/updateResult) bằng session/cookie của trang
  function updateResult(d) {
    var res = { source: "KH_AUTO_NEXT_PAGE", type: "UPDATE_RESULT_RESULT", reqId: d.reqId };
    var body =
      "id=" + encodeURIComponent(d.id) +
      "&resultImg=" + encodeURIComponent(d.resultImg) +
      "&isInspect=1&numberProduct=&strPOSM=&strNoted=" +
      "&token=" + encodeURIComponent(d.token || "");
    // Dùng XHR (giống jQuery.ajax của trang) thay vì fetch, để WAF/proxy không chặn 404.
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/images/updateResult", true);
      xhr.withCredentials = true;
      xhr.setRequestHeader(
        "Content-Type",
        "application/x-www-form-urlencoded; charset=UTF-8",
      );
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.setRequestHeader("Accept", "application/json, text/javascript, */*; q=0.01");
      xhr.onload = function () {
        res.status = xhr.status;
        res.ok = xhr.status === 200; // chỉ 200 mới coi là thành công
        res.text = xhr.responseText;
        try {
          var j = JSON.parse(xhr.responseText);
          if (j && j.error === true) res.ok = false;
          if (j && j.token) res.token = j.token; // token xoay vòng cho lần chấm tiếp
        } catch (e) {}
        window.postMessage(res, "*");
      };
      xhr.onerror = function () {
        res.ok = false;
        res.error = "network error";
        window.postMessage(res, "*");
      };
      xhr.send(body);
    } catch (e) {
      res.ok = false;
      res.error = String(e);
      window.postMessage(res, "*");
    }
  }

  window.addEventListener(
    "message",
    function (ev) {
      var d = ev.data;
      if (!d || d.source !== "KH_AUTO_NEXT") return;

      if (d.type === "CLOSE_FANCYBOX") {
        closeFancybox();
        return;
      }

      if (d.type === "UPDATE_RESULT") {
        updateResult(d);
        return;
      }

      if (d.type !== "SET_SHOP") return;

      var res = { source: "KH_AUTO_NEXT_PAGE", reqId: d.reqId };
      try {
        var r = setShop(d.text);
        res.ok = r.ok;
        res.error = r.error;
        res.value = r.value;
      } catch (e) {
        res.ok = false;
        res.error = String(e);
      }
      window.postMessage(res, "*");
    },
    false,
  );

  console.log("[KH Auto Next] inject.js (main world) loaded");
})();
