// content.js - Chạy trên trang Quản lý media
// Nhiệm vụ:
//   1) Nhận message từ popup -> chọn Đơn vị + điền Mã KH + click "Tìm kiếm"
//   2) Lắng nghe phím tắt ArrowRight / ArrowLeft để Next/Prev
//   3) Lắng nghe phím A-M để gán Type cho KH hiện tại + copy sang clipboard

(function () {
  // Tránh inject nhiều lần
  if (window.__KH_AUTO_NEXT_INSTALLED__) return;
  window.__KH_AUTO_NEXT_INSTALLED__ = true;

  // ====== Map phím -> bộ 3 giá trị [cột3, cột4, cột5] ======
  // Định nghĩa trong keymap.js (load trước content.js). Reference global ở đây.
  const TYPE_KEY_MAP = window.TYPE_KEY_MAP || {};
  const passTriple =
    window.passTriple ||
    ((m, a) => [String(m || ""), "Đạt", String(a || "")]);

  // ====== Nạp script chạy ở MAIN world để điều khiển Kendo MultiSelect (ô Đơn vị) ======
  function injectMainWorldScript() {
    if (document.getElementById("__kh_inject_script__")) return;
    try {
      const s = document.createElement("script");
      s.id = "__kh_inject_script__";
      s.src = chrome.runtime.getURL("inject.js");
      s.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {
      console.warn("[KH Auto Next] Không inject được inject.js:", e);
    }
  }
  injectMainWorldScript();

  // ====== Gửi yêu cầu chọn Đơn vị sang main world, đợi phản hồi ======
  // `units` = the row's unit first, then the "Gộp đơn vị" units (see inject.js setShop).
  function setDonVi(units) {
    return new Promise((resolve) => {
      if (units.length === 0) {
        resolve({ ok: true, skipped: true });
        return;
      }
      const reqId = Math.random().toString(36).slice(2);

      function onMsg(ev) {
        const d = ev.data;
        if (!d || d.source !== "KH_AUTO_NEXT_PAGE" || d.reqId !== reqId) return;
        window.removeEventListener("message", onMsg);
        clearTimeout(timer);
        resolve(d);
      }
      window.addEventListener("message", onMsg);

      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "Hết thời gian chờ chọn Đơn vị" });
      }, 1500);

      // `text` too: an inject.js loaded before an extension reload stays in the page
      // (its install guard) and only reads `text`.
      window.postMessage(
        { source: "KH_AUTO_NEXT", type: "SET_SHOP", text: units[0], texts: units, reqId },
        "*",
      );
    });
  }

  // ====== Tìm ô input KH ======
  // Chiến lược: thử nhiều cách phổ biến, lấy cái nào match
  function findKhInput() {
    // 0) Ưu tiên id quen thuộc trên trang quản lý media
    const byId = document.getElementById("customerCode");
    if (byId && byId.tagName === "INPUT") return byId;

    // 1) Tìm theo <label> có text chính xác là "KH" / "KH:"
    const labels = Array.from(document.querySelectorAll("label"));
    for (const lb of labels) {
      const text = (lb.textContent || "").trim();
      if (text !== "KH" && text !== "KH:") continue;

      // 1a) Theo for=id
      const forId = lb.getAttribute("for");
      if (forId) {
        const target = document.getElementById(forId);
        if (target && target.tagName === "INPUT") return target;
      }

      // 1b) Input gần nhất ở các sibling kế tiếp (cùng cha)
      let next = lb.nextElementSibling;
      while (next) {
        if (
          next.matches &&
          next.matches("input[type='text'], input:not([type])")
        ) {
          return next;
        }
        const inner =
          next.querySelector &&
          next.querySelector("input[type='text'], input:not([type])");
        if (inner) return inner;
        next = next.nextElementSibling;
      }

      // 1c) Fallback: input đầu tiên trong cùng container với label
      const parent = lb.parentElement;
      if (parent) {
        const inp = parent.querySelector(
          "input[type='text'], input:not([type])",
        );
        if (inp) return inp;
      }
    }

    // 2) Tìm theo placeholder "Mã KH" (đặc trưng của trang này)
    const byPlaceholder = document.querySelector(
      "input[placeholder='Mã KH'], input[placeholder*='Mã KH']",
    );
    if (byPlaceholder) return byPlaceholder;

    // 3) Tìm theo attribute name/id/ng-model chứa "kh" như từ riêng
    const candidates = Array.from(
      document.querySelectorAll("input[type='text'], input:not([type])"),
    );
    for (const inp of candidates) {
      const attrs = [
        inp.name,
        inp.id,
        inp.getAttribute("data-name"),
        inp.getAttribute("ng-model"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (/(^|[^a-z])kh([^a-z]|$)/.test(attrs)) {
        return inp;
      }
    }

    return null;
  }

  // ====== Tìm button "Tìm kiếm" ======
  function findSearchButton() {
    // 0) Ưu tiên id quen thuộc trên trang
    const byId = document.getElementById("btnSearch");
    if (byId) return byId;

    // 1) <button> hoặc <input type=submit/button> có text/value "Tìm kiếm"
    const all = Array.from(
      document.querySelectorAll(
        "button, input[type='submit'], input[type='button'], a",
      ),
    );
    for (const b of all) {
      const text = (b.textContent || b.value || "").trim().toLowerCase();
      if (text === "tìm kiếm" || text === "tim kiem" || text === "search") {
        return b;
      }
    }
    // 2) Bất kỳ element nào có text chứa "Tìm kiếm" và clickable
    for (const b of all) {
      const text = (b.textContent || b.value || "").trim().toLowerCase();
      if (text.includes("tìm kiếm")) return b;
    }
    return null;
  }

  // ====== Chấm theo chương trình: tự bấm album khớp CODE sau khi Tìm kiếm ======
  // Mỗi album result là <a onclick="Images.showAlbumDetail(id,'CODE')"> trong #imageContent.
  // Kết quả load async sau khi click Tìm kiếm, nên phải poll chờ DOM mới.
  // Để tránh bấm nhầm kết quả của KH trước (DOM cũ còn sót lúc chuyển), ta đánh dấu
  // các album hiện có là "stale" NGAY TRƯỚC khi search, rồi chỉ bấm album CHƯA stale.

  function normCode(s) {
    return String(s || "").trim().toLowerCase();
  }

  // Lấy CODE chương trình từ thuộc tính onclick (showAlbumDetail(id,'CODE'))
  function albumCodeOf(a) {
    const oc = a.getAttribute("onclick") || "";
    const m = oc.match(/showAlbumDetail\s*\([^,]*,\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    return (a.textContent || "").trim();
  }

  function albumLinks(includeStale) {
    const sel = includeStale
      ? '#imageContent a[onclick*="showAlbumDetail"]'
      : '#imageContent a[onclick*="showAlbumDetail"]:not([data-kh-stale])';
    return Array.from(document.querySelectorAll(sel));
  }

  // Đánh dấu album hiện tại là cũ trước khi search lại
  function markAlbumsStale() {
    albumLinks(true).forEach((a) => a.setAttribute("data-kh-stale", "1"));
  }

  // Tìm 1 album (chưa stale) khớp CODE chương trình; ưu tiên link có text (Text1Style)
  function findAlbumLink(programCode) {
    const want = normCode(programCode);
    if (!want) return null;
    const links = albumLinks(false).filter((a) => normCode(albumCodeOf(a)) === want);
    if (links.length === 0) return null;
    return links.find((a) => (a.textContent || "").trim() !== "") || links[0];
  }

  // Album id = first argument of showAlbumDetail(id,'CODE'); the thumbnail and the
  // title link of one album share it.
  function albumIdOf(a) {
    const oc = a.getAttribute("onclick") || "";
    const m = oc.match(/showAlbumDetail\s*\(\s*['"]?([^,'"]*)/);
    return m ? m[1].trim() : "";
  }

  // One link per album matching CODE (with "Gộp đơn vị" each unit has its own album),
  // preferring the titled link like findAlbumLink.
  function findAlbumLinksPerAlbum(programCode) {
    const want = normCode(programCode);
    const byAlbum = new Map();
    for (const a of albumLinks(false)) {
      if (normCode(albumCodeOf(a)) !== want) continue;
      const id = albumIdOf(a);
      const kept = byAlbum.get(id);
      if (!kept || (!(kept.textContent || "").trim() && (a.textContent || "").trim())) {
        byAlbum.set(id, a);
      }
    }
    return [...byAlbum.values()];
  }

  // Poll chờ kết quả mới rồi bấm album khớp CODE. Không thấy sau timeout -> bỏ qua.
  // `mergeAlbums` ("Gộp đơn vị" is set): several matching albums are all opened and
  // their images shown in one popup. `seq` = navSeq of the search that started it.
  function autoClickProgram(programCode, mergeAlbums, seq, attempt) {
    if (!programCode) return;
    attempt = attempt || 0;
    if (mergeAlbums) {
      const links = findAlbumLinksPerAlbum(programCode);
      if (links.length > 1) {
        openMergedAlbums(links, programCode, seq);
        return;
      }
    }
    const a = findAlbumLink(programCode);
    if (a) {
      // Ảnh chi tiết cũ (album trước) -> stale, để autoClickFirstImage chỉ bấm ảnh MỚI
      markDetailImagesStale();
      a.click(); // trigger Images.showAlbumDetail(...)
      toast("📂 Mở chương trình: " + programCode);
      // Album detail load async -> poll rồi tự bấm ảnh đầu tiên (kích hoạt API popup)
      autoClickFirstImage();
      return;
    }
    if (attempt < 24) {
      // poll ~6s (24 * 250ms) chờ AJAX trả kết quả
      setTimeout(
        () => autoClickProgram(programCode, mergeAlbums, seq, attempt + 1),
        250,
      );
    } else {
      toast("Không thấy chương trình: " + programCode);
    }
  }

  // ====== Tự bấm ảnh đầu tiên trong album detail (trigger get-images-for-popup) ======
  // Album detail là <ul id="albumContentDetail"> chứa các <li><a onclick="Images.showDialogFancy(id,...)">.
  // Bấm ảnh đầu -> trang POST /images/get-images-for-popup -> inject.js bắt response -> ta dựng popup.
  function detailImageLinks(includeStale) {
    const sel = includeStale
      ? '#albumContentDetail a[onclick*="showDialogFancy"]'
      : '#albumContentDetail a[onclick*="showDialogFancy"]:not([data-kh-img-stale])';
    return Array.from(document.querySelectorAll(sel));
  }

  function markDetailImagesStale() {
    detailImageLinks(true).forEach((a) => a.setAttribute("data-kh-img-stale", "1"));
  }

  function autoClickFirstImage(attempt) {
    attempt = attempt || 0;
    const fresh = detailImageLinks(false);
    if (fresh.length) {
      fresh[0].click(); // trigger Images.showDialogFancy(...) -> API popup
      toast("🖼 Mở ảnh đầu tiên");
      return;
    }
    if (attempt < 24) {
      setTimeout(() => autoClickFirstImage(attempt + 1), 250);
    } else {
      toast("Không thấy ảnh trong chương trình");
    }
  }

  // ====== Gộp đơn vị: open every matching album, show all their images in one popup ======
  // While set, a POPUP_IMAGES response resolves this instead of building a popup.
  let albumImagesWaiter = null;

  function cancelAlbumImagesWait() {
    if (albumImagesWaiter) albumImagesWaiter.resolve(null);
  }

  function waitForPopupImages(timeoutMs) {
    return new Promise((resolve) => {
      const waiter = {
        resolve(data) {
          clearTimeout(timer);
          if (albumImagesWaiter === waiter) albumImagesWaiter = null;
          resolve(data);
        },
      };
      const timer = setTimeout(() => waiter.resolve(null), timeoutMs);
      albumImagesWaiter = waiter;
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForFreshDetailImage() {
    for (let attempt = 0; attempt <= 24; attempt++) {
      const fresh = detailImageLinks(false);
      if (fresh.length) return fresh[0];
      await delay(250);
    }
    return null;
  }

  // The popup keeps the last response's token: updateResult tokens rotate, so the most
  // recently issued one is the one the server expects next.
  function mergeAlbumImages(responses) {
    const seen = new Set();
    const lstImage = [];
    for (const res of responses) {
      for (const it of (res && res.lstImage) || []) {
        if (it && it.id != null) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
        }
        lstImage.push(it);
      }
    }
    return { ...responses[responses.length - 1], lstImage };
  }

  // Albums are opened one at a time: the page shows one album detail at once and its
  // fancybox guard must be reset before the next image click calls the API again.
  async function openMergedAlbums(links, programCode, seq) {
    toast(`📂 Gộp ${links.length} album: ${programCode}`);
    const responses = [];
    for (const link of links) {
      markDetailImagesStale();
      link.click(); // trigger Images.showAlbumDetail(...)
      const img = await waitForFreshDetailImage();
      if (seq !== navSeq) return;
      if (!img) continue;
      const response = waitForPopupImages(8000);
      img.click(); // trigger Images.showDialogFancy(...) -> API popup
      const data = await response;
      if (seq !== navSeq) return;
      if (data) responses.push(data);
      await delay(500); // same wait as buildImagePopup before closing the fancybox
      closeNativeFancybox();
    }
    if (seq !== navSeq) return;
    if (responses.length === 0) {
      toast("Không lấy được ảnh của các album gộp");
      return;
    }
    buildImagePopup(mergeAlbumImages(responses));
  }

  // ====== Popup gallery: dựng từ response /images/get-images-for-popup ======
  // urlImage trong response là path tương đối (vd "/mc/ms/image/.../full_...jpg").
  // Base ảnh = phần đứng trước "/mc/ms/image" trong data-original của thumbnail trên trang
  // (vd "https://mocchau.dmsone.vn:8441/dmsone/"), fallback hardcode nếu không dò được.
  function detectImgBase() {
    const imgs = document.querySelectorAll(
      'img[data-original*="/mc/ms/image"], img[src*="/mc/ms/image"]',
    );
    for (const im of imgs) {
      const u = im.getAttribute("data-original") || im.src || "";
      const idx = u.indexOf("/mc/ms/image");
      if (idx > 0) return u.substring(0, idx);
    }
    return "https://mocchau.dmsone.vn:8441/dmsone/";
  }

  // API điều khiển slide của popup đang mở (để keydown gọi prev/next/score). null khi đóng.
  let popupApi = null;
  // Mã KH 23 ký tự của KH hiện tại (hiện trên header popup + copy khi bấm phím "2").
  let currentKhFull = "";
  // Token của lần get-images-for-popup hiện tại (cần để gọi updateResult).
  // Single-use: mỗi updateResult 200 trả token mới -> ghi đè vào đây.
  let popupToken = null;
  // Hàng đợi chấm điểm: chạy tuần tự để token xoay vòng không bị dùng trùng.
  let scoreQueue = Promise.resolve();
  // Danh sách ảnh của popup gần nhất. Sống LÂU HƠN popupApi: Esc phải đếm số ảnh đạt
  // SAU khi popup đã đóng, mà closeImagePopup() thì xóa popupApi. Chỉ reset khi dựng
  // popup mới hoặc chuyển sang KH khác.
  let popupItems = [];
  // KH sở hữu popupItems ({code, unit}), chốt lúc dựng popup. Esc lưu kết quả cho
  // ĐÚNG KH của mấy tấm ảnh vừa chấm, không đọc lại `idx` (idx có thể đã nhảy).
  let popupKh = null;
  // Auto next runs after awaits (storage, the score queue), so it cannot trust that
  // the KH it saved is still current. navSeq is bumped synchronously when any KH
  // navigation starts; an auto next captured before a manual → (or before another
  // auto next) sees it changed and gives up instead of skipping a KH.
  let navSeq = 0;
  // Bumped whenever a result is assigned, so a pending auto pass notices a result the
  // user assigned by hand while it waited and does not overwrite it with key "a".
  let saveSeq = 0;
  // When the last auto next navigated (performance.now(): monotonic). A second press
  // of the key that triggered it (or a habitual → from before Auto next) lands on the
  // next KH within milliseconds, long before its images are even shown — or, while
  // fillAndSearch holds focus on the Mã KH input, is typed into the search code — so
  // keys are ignored for a short while.
  let autoNavAt = -Infinity;
  const AUTO_NAV_GUARD_MS = 700;

  function countPassed(items) {
    return (items || []).filter((x) => x && x.result === 1).length;
  }

  // ====== Số ảnh đạt -> Esc tự lưu kết quả ======
  // "Số ảnh cần đạt" is stored as its display string ("Có 2 ảnh đạt"), so the
  // number is pulled with a regex instead of comparing hard-coded strings.
  function requiredPassCount(soAnh) {
    const m = String(soAnh || "").match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  // A key is a "fail" key purely by its column-4 label, so adding a new reason row
  // to TYPE_KEY_MAP is enough to make it auto-score its image — no list to update here.
  const FAIL_LABEL = "Không Đạt";
  function isFailKey(k) {
    return (TYPE_KEY_MAP[k] || [])[1] === FAIL_LABEL;
  }

  // Fail key saved when the scoring fell short of "số ảnh cần đạt". Its reason
  // "Có <n> ảnh đạt" states how many images did pass, so it is found by that label
  // rather than a hard-coded key. No matching row (e.g. 0 passed) -> undefined.
  function partialPassKey(passed) {
    const reason = `Có ${passed} ảnh đạt`;
    return Object.keys(TYPE_KEY_MAP).find(
      (k) => isFailKey(k) && TYPE_KEY_MAP[k][2] === reason,
    );
  }

  // Gọi khi đóng popup ảnh bằng Esc. Đợi hàng đợi chấm điểm xong trước khi đếm,
  // vì lần chấm thất bại sẽ hoàn tác `result` -> đếm sớm sẽ ra số sai.
  // Returns the KH it saved a result for ({code, unit}), or undefined when it saved none.
  async function autoAssignPassOnEsc() {
    // Chốt ảnh + KH NGAY (đồng bộ, trước await đầu tiên): scoreQueue chờ tới 8s,
    // trong lúc đó người dùng bấm → sang KH khác thì popupItems/popupKh/idx đã đổi hết.
    const items = popupItems;
    const target = popupKh;
    const log = (why, extra) =>
      console.log("[KH Esc]", why, {
        items: items.length,
        target,
        ...(extra || {}),
      });

    await scoreQueue;
    const { soAnh } = await chrome.storage.local.get(["soAnh"]);
    const need = requiredPassCount(soAnh);
    if (!need) {
      log("bỏ qua: chưa chọn 'Số ảnh cần đạt'", { soAnh });
      toast("Esc: chưa chọn 'Số ảnh cần đạt' trong extension → không tự lưu");
      return;
    }
    if (items.length === 0) {
      log("bỏ qua: không còn dữ liệu ảnh", { soAnh, need });
      toast("Esc: mất dữ liệu ảnh để đếm — mở lại popup ảnh rồi bấm Esc");
      return;
    }
    const got = countPassed(items);
    if (got < need) {
      const partialKey = partialPassKey(got);
      if (partialKey) {
        const label = TYPE_KEY_MAP[partialKey][2];
        log(`tự gán phím ${partialKey}`, { need, got });
        toast(
          `Mới ${got}/${need} ảnh đạt → tự lưu kết quả phím ${partialKey.toUpperCase()} (${label})`,
        );
        return assignTypeKey(partialKey, target);
      }
      log("bỏ qua: chưa đủ ảnh đạt", {
        need,
        got,
        results: items.map((x) => x && x.result),
      });
      toast(`Esc: mới ${got}/${need} ảnh đạt → không tự lưu`);
      return;
    }
    log("tự gán phím A", { need, got });
    toast(`Đủ ${got}/${need} ảnh đạt → tự lưu kết quả phím A`);
    return assignTypeKey("a", target);
  }

  // Scores queued while waiting are waited for too: moving to the next KH first would
  // let an old image's score spend the token of the next KH's popup.
  async function drainScoreQueue() {
    let q;
    do {
      q = scoreQueue;
      await q;
    } while (q !== scoreQueue);
  }

  // Auto next: once a result is saved for `saved` ({code, unit}), close the image
  // popup and go to the next KH. `seq` is navSeq when the save was triggered.
  async function autoNextAfterSave(seq, saved) {
    if (!saved) return;
    const { autoNext } = await chrome.storage.local.get(["autoNext"]);
    if (!autoNext) return;
    // The popup can still be open here, so a score queued during the storage read is
    // drained again before leaving.
    let data;
    for (;;) {
      await drainScoreQueue();
      const q = scoreQueue;
      data = await chrome.storage.local.get(["khArr", "unitArr", "idx"]);
      if (q === scoreQueue) break;
    }
    // No await from here to gotoIndex's navSeq bump, so two auto nexts that both
    // reach this point cannot both pass the check.
    if (seq !== navSeq) return;
    const idx = typeof data.idx === "number" ? data.idx : -1;
    const arr = data.khArr || [];
    const units = data.unitArr || [];
    if (rowKey(units[idx], arr[idx]) !== rowKey(saved.unit, saved.code)) return;
    // Leaving now would hide the Mã KH trùng box and drop what is being typed, so
    // wait until it is closed (see the dupInput keydown handler).
    // The Enter / Esc the toast asks for is handled even with focus outside the box
    // (top of the keydown handler); the box is not re-focused, as that would pull a
    // stray scoring key into the code being typed.
    if (dupBox && dupBox.style.display !== "none") {
      pendingAutoNext = () => autoNextAfterSave(seq, saved);
      toast("Auto next: Enter / Esc ô Mã KH trùng xong sẽ sang KH tiếp");
      return;
    }
    closeImagePopup(); // gotoIndex does not close it at the end of the list
    closeNativeFancybox();
    if (idx + 1 < arr.length) autoNavAt = performance.now();
    gotoIndex(data, idx + 1);
  }

  // Auto next: the pass that reaches "số ảnh cần đạt" saves key "a" and moves on,
  // so Esc is not needed. Returns false when it did not act and may be tried again:
  // the option is off, or a failed save reverted an image and the count fell short.
  // "Số ảnh cần đạt" is re-read rather than taken from the popup, since it may have
  // changed since the popup opened, and key "a" is saved from that same read: reading
  // it again after the drain could save a label the count was not checked against.
  async function autoPassWhenEnough(items) {
    const seq = navSeq;
    const saves = saveSeq;
    const target = popupKh;
    const { autoNext, soAnh, soMat } = await chrome.storage.local.get([
      "autoNext",
      "soAnh",
      "soMat",
    ]);
    if (!autoNext) return false;
    await drainScoreQueue();
    if (seq !== navSeq || popupItems !== items || saves !== saveSeq) return true;
    const need = requiredPassCount(soAnh);
    const got = countPassed(items);
    if (!need || got < need) return false;
    closeImagePopup();
    closeNativeFancybox();
    console.log("[KH Auto next] đủ ảnh đạt -> tự gán phím A", { need, got, target });
    toast(`Đủ ${got}/${need} ảnh đạt → tự lưu kết quả phím A + Next`);
    // No soMat -> no preset, so tripleForKey shows its usual "chọn số mặt" toast.
    const preset = soMat ? passTriple(soMat, soAnh) : null;
    const saved = await assignTypeKey("a", target, preset);
    await autoNextAfterSave(seq, saved);
    return true;
  }

  function closeImagePopup() {
    const el = document.getElementById("__kh_img_popup__");
    if (el) el.remove();
    popupApi = null;
  }

  // Gọi API chấm kết quả ảnh qua main world (để dùng cookie/session của trang)
  function updateResultApi(id, resultImg) {
    return new Promise((resolve) => {
      const reqId = Math.random().toString(36).slice(2);
      function onMsg(ev) {
        const d = ev.data;
        if (
          !d ||
          d.source !== "KH_AUTO_NEXT_PAGE" ||
          d.type !== "UPDATE_RESULT_RESULT" ||
          d.reqId !== reqId
        )
          return;
        window.removeEventListener("message", onMsg);
        clearTimeout(timer);
        resolve(d);
      }
      window.addEventListener("message", onMsg);
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "Hết thời gian chờ updateResult" });
      }, 8000);
      window.postMessage(
        { source: "KH_AUTO_NEXT", type: "UPDATE_RESULT", reqId, id, resultImg, token: popupToken },
        "*",
      );
    });
  }

  // Yêu cầu main world đóng fancybox gốc -> reset cờ "dialog đang mở" của trang,
  // nếu không showDialogFancy lần sau (KH khác) bị guard chặn, KHÔNG gọi lại API.
  function closeNativeFancybox() {
    window.postMessage({ source: "KH_AUTO_NEXT", type: "CLOSE_FANCYBOX" }, "*");
  }

  function buildImagePopup(data) {
    // Chỉ lấy ảnh trưng bày (lstImage), bỏ ảnh selfie (lstImageSelfie)
    const all = ((data && data.lstImage) || []).filter((x) => x && x.urlImage);
    if (all.length === 0) {
      toast("Không có ảnh trong popup");
      return;
    }

    closeImagePopup(); // tránh chồng popup khi mở nhiều lần
    popupItems = all; // nguồn đếm "ảnh đạt" cho Esc, sống lâu hơn popupApi
    popupKh = null; // set lại bên dưới sau khi đọc storage
    popupToken = (data && data.token) || null; // token để gọi updateResult
    const base = detectImgBase();
    const ver = Date.now();
    let cur = 0; // slide hiện tại
    let need = 0; // số ảnh cần đạt (option trong popup extension), 0 = chưa chọn
    let autoPassArmed = false; // one auto pass per popup, re-armed if it did not act

    const overlay = document.createElement("div");
    overlay.id = "__kh_img_popup__";
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.9);
      z-index: 1000002;
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;
    // Click nền (ngoài ảnh/nút) để đóng
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeImagePopup();
    });

    // Header: tiêu đề + counter + nút đóng
    const header = document.createElement("div");
    header.style.cssText = `
      flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; color: #fff; gap: 12px;
    `;
    const first = all[0] || {};
    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = "flex:1 1 auto;display:flex;flex-direction:column;gap:2px;min-width:0;";

    const title = document.createElement("div");
    title.style.cssText = "font-size:14px;font-weight:600;line-height:1.3;";
    // Merged albums ("Gộp đơn vị") can hold several units' images.
    const shops = [...new Set(all.map((x) => x.shopCode).filter(Boolean))].join(" + ");
    title.textContent = `${shops} · ${first.customerName || ""} (${first.customerCode || ""})`;

    // Dòng Mã KH 23 ký tự — điền async từ storage (khFullArr[idx]); phím "2" để copy.
    const codeEl = document.createElement("div");
    codeEl.style.cssText =
      "font-family:'SF Mono',Menlo,monospace;font-size:13px;font-weight:700;color:#fbbf24;word-break:break-all;";
    chrome.storage.local
      .get(["khFullArr", "khArr", "unitArr", "idx", "soAnh"])
      .then(({ khFullArr, khArr, unitArr, idx, soAnh }) => {
        const full = (khFullArr || [])[idx] || "";
        currentKhFull = full;
        codeEl.textContent = full ? `Mã KH: ${full}  (phím 2 để copy)` : "";
        const code = (khArr || [])[idx];
        if (code) popupKh = { code, unit: (unitArr || [])[idx] || "" };
        need = requiredPassCount(soAnh);
        console.log("[KH Esc] popup dựng xong", {
          anh: all.length,
          idx,
          popupKh,
          soAnh,
          need,
        });
        render();
      });

    titleWrap.appendChild(title);
    titleWrap.appendChild(codeEl);

    const counter = document.createElement("div");
    counter.style.cssText =
      "flex:0 0 auto;font-size:13px;font-weight:600;color:#cbd5e1;";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ Đóng (Tab/Esc)";
    closeBtn.style.cssText = `
      flex: 0 0 auto; cursor: pointer; border: none; border-radius: 6px;
      background: #ef4444; color: #fff; font-size: 13px; font-weight: 600;
      padding: 8px 14px;
    `;
    closeBtn.addEventListener("click", closeImagePopup);

    header.appendChild(titleWrap);
    header.appendChild(counter);
    header.appendChild(closeBtn);

    // Sân khấu: 1 ảnh + nút ‹ ›
    const stage = document.createElement("div");
    stage.style.cssText = `
      flex: 1 1 auto; position: relative; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      padding: 8px 72px;
    `;

    const img = document.createElement("img");
    img.style.cssText =
      "max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;background:#222;cursor:zoom-in;";
    img.title = "Bấm để mở ảnh gốc";

    function navBtn(symbol, side) {
      const b = document.createElement("button");
      b.textContent = symbol;
      b.style.cssText = `
        position: absolute; top: 50%; transform: translateY(-50%); ${side}: 14px;
        width: 52px; height: 52px; border-radius: 50%; border: none;
        background: rgba(255,255,255,0.15); color: #fff; font-size: 32px; line-height: 1;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      `;
      return b;
    }
    const prevBtn = navBtn("‹", "left");
    const nextBtn = navBtn("›", "right");
    prevBtn.addEventListener("click", () => go(-1));
    nextBtn.addEventListener("click", () => go(1));

    stage.appendChild(prevBtn);
    stage.appendChild(img);
    stage.appendChild(nextBtn);

    // Footer: ngày + trạng thái/nút chấm cho ảnh hiện tại
    const footer = document.createElement("div");
    footer.style.cssText = `
      flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 16px; color: #e5e7eb; font-size: 13px;
    `;
    const dateEl = document.createElement("span");
    const rightBox = document.createElement("div");
    rightBox.style.cssText = "display:flex;align-items:center;gap:8px;";
    footer.appendChild(dateEl);
    footer.appendChild(rightBox);

    // Dải thumbnail bên dưới slide: bấm để nhảy tới ảnh đó
    const thumbBar = document.createElement("div");
    thumbBar.style.cssText = `
      flex: 0 0 auto; display: flex; gap: 8px; overflow-x: auto;
      padding: 8px 16px 12px; background: rgba(0,0,0,0.3);
    `;
    // Mỗi thumbnail = wrapper (giữ viền trạng thái + icon ở giữa) bọc <img>.
    // Trạng thái/icon set trong render() vì có thể đổi khi chấm điểm tại chỗ.
    const thumbEls = all.map((it, i) => {
      const wrap = document.createElement("div");
      wrap.style.cssText = `
        position: relative; flex: 0 0 auto; width: 96px; height: 64px;
        border-radius: 4px; cursor: pointer; background: #222; overflow: hidden;
        border: 3px solid transparent; opacity: 0.6; transition: opacity .1s;
        box-sizing: border-box;
      `;
      const t = document.createElement("img");
      t.src = base + (it.urlThum || it.urlImage) + "?v=" + ver;
      t.loading = "lazy";
      t.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";

      const icon = document.createElement("span");
      icon.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
        width: 30px; height: 30px; border-radius: 50%;
        align-items: center; justify-content: center;
        font-size: 20px; font-weight: 900; line-height: 1;
        background: rgba(0,0,0,0.5); pointer-events: none; display: none;
      `;

      wrap.appendChild(t);
      wrap.appendChild(icon);
      wrap.addEventListener("click", () => {
        cur = i;
        render();
      });
      thumbBar.appendChild(wrap);
      return { wrap, icon };
    });

    function render() {
      const it = all[cur];
      const url = base + it.urlImage + "?v=" + ver;
      img.src = url;
      img.onclick = () => window.open(url, "_blank");

      const passedCount = countPassed(all);
      counter.textContent = need
        ? `${cur + 1} / ${all.length} · Đạt ${passedCount}/${need}`
        : `${cur + 1} / ${all.length}`;
      counter.style.color = need && passedCount >= need ? "#4ade80" : "#cbd5e1";
      dateEl.textContent = it.createDateStr || it.dmyDate || "";

      const single = all.length <= 1;
      prevBtn.style.display = single ? "none" : "flex";
      nextBtn.style.display = single ? "none" : "flex";
      prevBtn.disabled = cur === 0;
      nextBtn.disabled = cur === all.length - 1;
      prevBtn.style.opacity = cur === 0 ? "0.35" : "1";
      nextBtn.style.opacity = cur === all.length - 1 ? "0.35" : "1";

      // Viền + icon trạng thái từng thumbnail; ảnh chưa chấm giữ nguyên như cũ.
      thumbEls.forEach((el, i) => {
        const on = i === cur;
        const iti = all[i];
        const isScored = iti.isInSpected != null || iti.result != null;
        const isPassed = iti.result === 1;
        el.wrap.style.opacity = on ? "1" : "0.6";
        if (isPassed) {
          el.wrap.style.borderColor = "#4ade80"; // xanh lá — Đạt
          el.icon.textContent = "✓";
          el.icon.style.color = "#4ade80";
          el.icon.style.display = "flex";
        } else if (isScored) {
          el.wrap.style.borderColor = "#f87171"; // đỏ — Chưa đạt
          el.icon.textContent = "✕";
          el.icon.style.color = "#f87171";
          el.icon.style.display = "flex";
        } else {
          // Chưa chấm: viền xanh dương khi đang chọn, còn lại trong suốt, không icon
          el.wrap.style.borderColor = on ? "#3b82f6" : "transparent";
          el.icon.style.display = "none";
        }
        // Ảnh đã chấm vẫn cần thấy cái đang chọn -> thêm vòng xanh dương
        el.wrap.style.outline = on && isScored ? "2px solid #3b82f6" : "none";
        el.wrap.style.outlineOffset = "1px";
      });
      if (thumbEls[cur]) {
        thumbEls[cur].wrap.scrollIntoView({ block: "nearest", inline: "center" });
      }

      // Trạng thái chấm
      rightBox.replaceChildren();
      const scored = it.isInSpected != null || it.result != null;
      const passed = it.result === 1;
      if (scored) {
        const badge = document.createElement("span");
        badge.style.cssText = `font-weight:700;font-size:14px;color:${passed ? "#4ade80" : "#f87171"};`;
        badge.textContent = passed ? "✓ Đạt" : "✗ Chưa đạt";
        rightBox.appendChild(badge);
      } else {
        rightBox.appendChild(
          makeScoreBtn("✓ Đạt", "#16a34a", () => score(it, true)),
        );
        rightBox.appendChild(
          makeScoreBtn("✗ Chưa đạt", "#dc2626", () => score(it, false)),
        );
      }
    }

    function go(delta) {
      const n = cur + delta;
      if (n < 0 || n >= all.length) return;
      cur = n;
      render();
    }

    // Jump to the next image with no score yet (same test render() uses for the ✓/✕
    // badge), wrapping to the start so a skipped image is not missed; stays put once
    // every image is scored. It runs before the save resolves: a failed save makes
    // its image unscored again, so a later jump lands on it.
    function goToNextUnscored() {
      for (let step = 1; step < all.length; step++) {
        const i = (cur + step) % all.length;
        if (all[i].isInSpected == null && all[i].result == null) {
          cur = i;
          return;
        }
      }
    }

    // Day part of the date shown in the footer ("17/09/2026-10:37" -> "17/09/2026").
    function dayOf(it) {
      const s = it.createDateStr || it.dmyDate || "";
      const m = s.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      return m ? m[0] : s;
    }

    // After scoring, jump to the next image taken on another day, even an already scored
    // one (wrapping to the start). With a single day there is no other day to jump to,
    // so fall back to the next unscored image.
    function goToNextDay() {
      const day = dayOf(all[cur]);
      for (let step = 1; step < all.length; step++) {
        const i = (cur + step) % all.length;
        if (dayOf(all[i]) !== day) {
          cur = i;
          return;
        }
      }
      goToNextUnscored();
    }

    // Chấm 1 ảnh: optimistic -> gọi API; nếu KHÔNG phải 200 thì hoàn tác lại trạng thái cũ.
    // Token single-use: mỗi lần 200 server trả token mới -> rotate cho lần sau.
    // Các lần chấm chạy TUẦN TỰ (queue) để không 2 request dùng chung 1 token.
    function score(it, pass) {
      if (!it || it.id == null) {
        toast("Thiếu id ảnh để chấm");
        return;
      }
      const resultImg = pass ? 1 : 0;
      const prev = { isInSpected: it.isInSpected, result: it.result };

      // Optimistic ngay (UI mượt)
      it.isInSpected = 1;
      it.result = resultImg;
      goToNextDay();
      render();
      toast((pass ? "✓ Đạt" : "✗ Chưa đạt") + " — đang lưu...");

      if (pass && need && !autoPassArmed && countPassed(all) >= need) {
        autoPassArmed = true;
        autoPassWhenEnough(all).then((acted) => {
          if (!acted) autoPassArmed = false;
        });
      }

      // Nối vào hàng đợi: chạy sau khi lần chấm trước xong + đã rotate token
      scoreQueue = scoreQueue.then(async () => {
        if (!popupToken) {
          it.isInSpected = prev.isInSpected;
          it.result = prev.result;
          render();
          toast("Thiếu token — mở lại ảnh để lấy token");
          return;
        }
        const res = await updateResultApi(it.id, resultImg);
        if (res && res.ok && res.status === 200) {
          if (res.token) popupToken = res.token; // rotate token
          toast((pass ? "✓ Đạt" : "✗ Chưa đạt") + " — đã lưu");
        } else {
          // Hoàn tác trạng thái cũ khi lưu thất bại
          it.isInSpected = prev.isInSpected;
          it.result = prev.result;
          render();
          const code = res && res.status != null ? res.status : "?";
          const why = res && res.error ? " — " + res.error : "";
          toast(`Lưu thất bại (HTTP ${code})${why} — đã hoàn tác`);
        }
      }).catch(() => {});
    }

    // Cho keydown handler điều khiển slide + chấm khi popup mở
    popupApi = {
      prev: () => go(-1),
      next: () => go(1),
      scoreCurrent: (pass) => score(all[cur], pass),
    };

    overlay.appendChild(header);
    overlay.appendChild(stage);
    if (all.length > 1) overlay.appendChild(thumbBar);
    overlay.appendChild(footer);
    document.body.appendChild(overlay);
    render();
    toast(`🖼 ${all.length} ảnh — ◄ ► ▲ ▼ để xem`);

    // Đợi fancybox gốc mở xong rồi đóng nó -> reset cờ để KH sau còn gọi lại API
    setTimeout(closeNativeFancybox, 500);
  }

  // Nút chấm trong popup
  function makeScoreBtn(label, bg, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `
      cursor: pointer; border: none; border-radius: 5px; color: #fff;
      font-size: 12px; font-weight: 600; padding: 4px 8px; background: ${bg};
    `;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onClick();
    });
    return b;
  }

  // Ẩn fancybox gốc của trang (lightbox mặc định khi bấm showDialogFancy) để dùng popup của ta
  (function hideNativeFancybox() {
    if (document.getElementById("__kh_hide_fancybox__")) return;
    const st = document.createElement("style");
    st.id = "__kh_hide_fancybox__";
    st.textContent =
      ".fancybox-overlay,.fancybox-wrap,#fancybox-overlay,#fancybox-wrap,#fancybox-loading{display:none!important;}";
    (document.head || document.documentElement).appendChild(st);
  })();

  // Nhận response ảnh từ inject.js (main world) -> dựng popup
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "KH_AUTO_NEXT_PAGE" || d.type !== "POPUP_IMAGES") return;
    if (albumImagesWaiter) {
      albumImagesWaiter.resolve(d.data);
      return;
    }
    buildImagePopup(d.data);
  });

  // ====== Điền giá trị + trigger events (để framework như React/Angular nhận biết) ======
  function setInputValue(input, value) {
    input.focus();

    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) {
      setter.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  // ====== Chọn Album (select#lstAlbum) ======
  // Native <select>: set value rồi dispatch change để onchange của trang chạy.
  function setAlbum(value) {
    const sel = document.getElementById("lstAlbum");
    if (!sel) return false;
    if (sel.value !== String(value)) {
      sel.value = String(value);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return sel.value === String(value);
  }

  // ====== Thực hiện: chọn Đơn vị -> điền Mã KH -> click search ======
  // "Đơn vị gốc" / "Gộp đơn vị" text from the popup -> unit codes, split like the KH list.
  function parseUnitList(raw) {
    return String(raw || "").split(/[\s,;]+/).filter(Boolean);
  }

  // Only a row whose unit is one of the "Đơn vị gốc" gets the "Gộp đơn vị" units.
  function mergeUnitsFor(unitText, cfg) {
    const unit = normCode(unitText);
    if (!unit) return [];
    const isBase = parseUnitList(cfg.mergeBaseUnits).some((u) => normCode(u) === unit);
    return isBase ? parseUnitList(cfg.mergeUnits) : [];
  }

  async function fillAndSearch(khCode, unitText) {
    const seq = ++navSeq; // before any await: see navSeq
    pendingAutoNext = null; // it belongs to the KH being left
    cancelAlbumImagesWait(); // its response would be the next KH's popup
    // Dọn popup + reset fancybox của KH trước trước khi sang KH mới
    closeImagePopup();
    popupItems = []; // ảnh của KH cũ không được tính cho KH mới
    popupKh = null;
    closeNativeFancybox();

    // Chương trình đang chấm (nếu có) -> sau khi search sẽ tự bấm album khớp
    const cfg = await chrome.storage.local.get(["program", "mergeBaseUnits", "mergeUnits"]);
    const program = cfg.program || "";
    const mergeUnits = mergeUnitsFor(unitText, cfg);

    // 1) Chọn Đơn vị (Kendo MultiSelect) trước, đợi main world xử lý xong
    const shopRes = await setDonVi(unitText ? [unitText, ...mergeUnits] : []);

    // 2) Điền Mã KH
    const input = findKhInput();
    if (!input) {
      return { ok: false, error: "Không tìm thấy ô KH trên trang", shop: shopRes };
    }
    setInputValue(input, khCode || "");

    // 3) Đợi 1 chút để framework cập nhật rồi mới click search
    setTimeout(() => {
      // Chọn Album = "Trưng bày theo chương trình" (value=2) trước khi tìm kiếm
      setAlbum("2");

      // Đánh dấu kết quả cũ là stale TRƯỚC khi search (tránh bấm nhầm KH trước)
      if (program) markAlbumsStale();

      const btn = findSearchButton();
      if (btn) {
        btn.click();
      }
      // Bỏ focus khỏi input để phím tắt ArrowLeft/Right hoạt động ngay
      try {
        input.blur();
      } catch (_) {}

      // 4) Chờ kết quả mới rồi tự bấm album của chương trình đã chọn
      if (program) autoClickProgram(program, mergeUnits.length > 0, seq);
    }, 150);

    return { ok: true, shop: shopRes };
  }

  // ====== Phím tắt: đọc state từ storage và tự gọi fillAndSearch ======
  async function shortcutGoto(delta) {
    const data = await chrome.storage.local.get(["khArr", "unitArr", "idx"]);
    const idx = typeof data.idx === "number" ? data.idx : -1;
    await gotoIndex(data, idx + delta);
  }

  // `data` = storage snapshot holding khArr + unitArr. Reaches fillAndSearch without
  // awaiting, so a caller that checked navSeq just before stays race-free.
  async function gotoIndex(data, newIdx) {
    hideDupBox();
    const arr = data.khArr || [];
    const units = data.unitArr || [];
    if (arr.length === 0) {
      toast("Chưa có danh sách KH. Mở extension để nạp.");
      return;
    }
    if (newIdx < 0) {
      toast("Đã ở đầu danh sách");
      return;
    }
    if (newIdx >= arr.length) {
      toast("✓ Đã hết danh sách");
      await chrome.storage.local.set({ idx: arr.length });
      return;
    }
    const code = arr[newIdx];
    const unit = units[newIdx] || "";
    const res = await fillAndSearch(code, unit);
    if (res.ok) {
      await chrome.storage.local.set({ idx: newIdx });
      let warn = "";
      if (unit && res.shop && res.shop.ok === false) warn = " ⚠ Đơn vị?";
      const missing = (res.shop && res.shop.missing) || [];
      if (missing.length) warn += ` ⚠ Không có ĐV gộp: ${missing.join(", ")}`;
      toast(
        `${newIdx + 1}/${arr.length}: ${unit ? unit + " / " : ""}${code}${warn}`,
      );
    } else {
      toast("Lỗi: " + res.error);
    }
  }

  // ====== Khóa duy nhất theo cặp (Đơn vị + Mã KH) ======
  function rowKey(unit, code) {
    return (unit || "") + "\u0001" + (code || "");
  }

  // Copy text vào clipboard (fallback execCommand khi Clipboard API bị chặn)
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (_) {
        return false;
      }
    }
  }

  // Paste nội dung clipboard vào ô input/textarea đang focus (như Cmd+V) + báo framework.
  async function pasteIntoFocused(el) {
    if (!el) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch (_) {
      toast("Không đọc được clipboard (cấp quyền cho extension)");
      return;
    }
    if (!text) {
      toast("Clipboard trống");
      return;
    }
    if (el.isContentEditable) {
      el.focus();
      document.execCommand("insertText", false, text);
      toast("📋 Đã paste");
      return;
    }
    const start = el.selectionStart != null ? el.selectionStart : el.value.length;
    const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, next);
    else el.value = next;
    const pos = start + text.length;
    try {
      el.setSelectionRange(pos, pos);
    } catch (_) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    toast("📋 Đã paste: " + text);
  }

  // ====== Gán Type (bộ 3 giá trị) cho KH + copy 3 cột vào clipboard ======
  // `target` ({code, unit}) = KH đã chốt sẵn từ trước (Esc trong popup ảnh). Không có
  // target thì mới lấy KH hiện tại theo `idx`.
  // Returns the KH written to ({code, unit}), or undefined when nothing was saved.
  async function setTypeForCurrent(typeArr, target) {
    const data = await chrome.storage.local.get([
      "khArr",
      "unitArr",
      "idx",
      "results",
    ]);
    const arr = data.khArr || [];
    const units = data.unitArr || [];
    let code, unit;
    if (target && target.code) {
      code = target.code;
      unit = target.unit || "";
    } else {
      const idx = typeof data.idx === "number" ? data.idx : -1;
      if (arr.length === 0) {
        toast("Chưa có danh sách KH. Mở extension để nạp.");
        return;
      }
      if (idx < 0 || idx >= arr.length) {
        toast("Chưa chọn KH nào. Bấm → để bắt đầu.");
        return;
      }
      code = arr[idx];
      unit = units[idx] || "";
    }
    const key = rowKey(unit, code);
    const results = data.results || {};
    results[key] = typeArr; // [cột3, cột4, cột5]
    await chrome.storage.local.set({ results });

    // Copy 3 cột giá trị (ngăn nhau bằng Tab) để paste 1 lần vào 3 ô Sheets
    const clip = typeArr.join("\t");
    const copied = await copyText(clip);

    toast(
      `${code} → ${typeArr.join(" / ")}${copied ? " (đã copy 3 cột, Ctrl+V vào Sheets)" : ""}`,
    );
    return { code, unit };
  }

  // Lấy bộ 3 giá trị cho 1 phím. Phím "a" (Đạt) ĐỘNG theo 2 lựa chọn số mặt + số ảnh
  // trong extension; các phím khác lấy tĩnh từ TYPE_KEY_MAP.
  async function tripleForKey(k) {
    if (k === "a") {
      const { soMat, soAnh } = await chrome.storage.local.get(["soMat", "soAnh"]);
      if (!soMat || !soAnh) {
        toast("Chọn 'số mặt' + 'số ảnh cần đạt' trong extension trước");
        return null;
      }
      return passTriple(soMat, soAnh);
    }
    return TYPE_KEY_MAP[k] || null;
  }

  // Returns what setTypeForCurrent returns: the KH saved to, or undefined.
  // `preset` = triple already read by the caller (see autoPassWhenEnough).
  async function assignTypeKey(k, target, preset) {
    // A late save aimed at an earlier popup's KH (Esc waiting on a slow image save)
    // must not cancel the auto pass of the popup open now: see saveSeq.
    if (!target || target === popupKh) saveSeq++; // before any await
    const triple = preset || (await tripleForKey(k));
    if (triple) return setTypeForCurrent(triple, target);
  }

  // ====== Ô nhập "Mã KH trùng" (hiện khi bấm phím =) ======
  let dupBox = null;
  let dupInput = null;
  let dupLabel = null;
  // Auto next held back while the box was open (see autoNextAfterSave); runs once the
  // box is closed with Enter or Esc.
  let pendingAutoNext = null;

  function runPendingAutoNext() {
    const run = pendingAutoNext;
    pendingAutoNext = null;
    if (run) run();
  }

  function buildDupBox() {
    if (dupBox) return;
    dupBox = document.createElement("div");
    dupBox.id = "__kh_dup_box__";
    // z-index above the image popup overlay (1000002): "=" also opens this box over it.
    dupBox.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 20px;
      width: 340px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      padding: 12px;
      z-index: 1000003;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: none;
    `;

    dupLabel = document.createElement("div");
    dupLabel.style.cssText =
      "font-size:12px;font-weight:600;color:#0f4c81;margin-bottom:6px;";
    dupLabel.textContent = "Nhập Mã KH trùng";

    dupInput = document.createElement("input");
    dupInput.type = "text";
    dupInput.placeholder = "VD: KV3AT1001M1090SM1001163";
    dupInput.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-family: "SF Mono", Menlo, monospace;
      font-size: 13px;
      box-sizing: border-box;
    `;

    const hint = document.createElement("div");
    hint.style.cssText =
      "font-size:11px;color:#6b7280;margin-top:6px;line-height:1.4;";
    hint.innerHTML =
      "Enter = lưu &nbsp; • &nbsp; Esc = đóng &nbsp; • &nbsp; để trống + Enter = xóa";

    dupBox.appendChild(dupLabel);
    dupBox.appendChild(dupInput);
    dupBox.appendChild(hint);
    document.body.appendChild(dupBox);

    // Phím trong ô nhập: Enter lưu, Esc đóng (chặn lan ra handler toàn cục)
    dupInput.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        const key = dupBox.dataset.key || "";
        const code = dupBox.dataset.code || "";
        saveDup(key, code, dupInput.value.trim());
        hideDupBox();
        runPendingAutoNext();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        hideDupBox();
        runPendingAutoNext();
      }
    });
  }

  function hideDupBox() {
    if (dupBox) dupBox.style.display = "none";
  }

  function showDupInput(key, code, unit, current) {
    buildDupBox();
    dupBox.dataset.key = key;
    dupBox.dataset.code = code;
    dupLabel.textContent = `Mã KH trùng cho: ${unit ? unit + " / " : ""}${code}`;
    dupInput.value = current || "";
    dupBox.style.display = "block";
    dupInput.focus();
    dupInput.select();
  }

  async function saveDup(key, code, value) {
    const data = await chrome.storage.local.get(["dups"]);
    const dups = data.dups || {};
    if (value) dups[key] = value;
    else delete dups[key];
    await chrome.storage.local.set({ dups });
    toast(`${code} ⟶ KH trùng: ${value || "(đã xóa)"}`);
  }

  async function promptDupForCurrent() {
    const data = await chrome.storage.local.get([
      "khArr",
      "unitArr",
      "idx",
      "dups",
    ]);
    const arr = data.khArr || [];
    const idx = typeof data.idx === "number" ? data.idx : -1;
    if (arr.length === 0) {
      toast("Chưa có danh sách KH. Mở extension để nạp.");
      return;
    }
    if (idx < 0 || idx >= arr.length) {
      toast("Chưa chọn KH nào. Bấm → để bắt đầu.");
      return;
    }
    const code = arr[idx];
    const unit = (data.unitArr || [])[idx] || "";
    const key = rowKey(unit, code);
    const dups = data.dups || {};
    showDupInput(key, code, unit, dups[key] || "");
  }

  // ====== Chấm "Đạt trưng bày" / "Không đạt" + auto bấm Lưu ======
  // LƯU Ý: Trang có thể có NHIỀU phần tử cùng id="divDetail" (mỗi ảnh/panel 1 cái),
  // nên KHÔNG dùng document.getElementById (chỉ trả cái đầu tiên, thường không có value).
  // Thay vào đó: quét tất cả [id="divDetail"], chọn panel có value & đang hiển thị,
  // rồi tìm radio/nút Lưu BÊN TRONG đúng panel đó.

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    return el.getClientRects && el.getClientRects().length > 0;
  }

  // Gom tất cả divDetail ở document chính + các iframe cùng nguồn
  function collectDetails() {
    const list = Array.from(document.querySelectorAll('[id="divDetail"]'));
    const frames = Array.from(document.querySelectorAll("iframe, frame"));
    for (const fr of frames) {
      try {
        const doc = fr.contentDocument;
        if (doc) {
          list.push(...Array.from(doc.querySelectorAll('[id="divDetail"]')));
        }
      } catch (_) {
        // iframe khác nguồn -> bỏ qua
      }
    }
    return list;
  }

  // Chọn panel divDetail đang dùng: ưu tiên có value không rỗng + đang hiển thị
  function findActiveDetail() {
    const all = collectDetails();
    const withValue = all.filter((el) => {
      const v = el.getAttribute("value");
      return v != null && String(v).trim() !== "";
    });
    if (withValue.length === 0) return null;
    return withValue.find(isVisible) || withValue[0];
  }

  function markDisplayResult(pass) {
    const all = collectDetails();
    if (all.length === 0) {
      toast("Không tìm thấy ô chấm (#divDetail)");
      return;
    }

    const detail = findActiveDetail();
    if (!detail) {
      toast("Ảnh này chưa có value — bỏ qua");
      return;
    }

    // Tìm radio TRONG đúng panel (tránh nhầm panel khác cùng id)
    const radioId = pass ? "chkResult" : "chkNotResult";
    const radio =
      detail.querySelector('[id="' + radioId + '"]') ||
      detail.querySelector(
        'input[name="resultDisplay"]' +
          (pass ? ":not(:first-of-type)" : ":first-of-type"),
      );
    if (!radio) {
      toast("Không tìm thấy nút " + (pass ? "Đạt trưng bày" : "Không đạt"));
      return;
    }

    // click radio -> trigger Images.changeCheckDisplay(this)
    radio.click();

    // đợi 1 chút cho trang cập nhật trạng thái rồi mới bấm Lưu
    setTimeout(() => {
      const btn = detail.querySelector('[id="btnSaveDetail"]');
      if (!btn) {
        toast("Không tìm thấy nút Lưu (#btnSaveDetail)");
        return;
      }
      btn.click(); // trigger Images.updateResult()
      toast((pass ? "✓ Đạt trưng bày" : "✗ Không đạt") + " → đã bấm Lưu");
    }, 100);
  }

  // ====== Xác nhận hộp thoại EasyUI messager (Đồng ý / Hủy bỏ) ======
  // Trang có nhiều nút "Đồng ý" ở các chỗ khác nhau, nên CHỈ bắt đúng cấu trúc
  // hộp thoại messager:  div.messager-body > div.messager-button > a.l-btn > span.l-btn-text
  // và chỉ lấy hộp thoại ĐANG HIỂN THỊ.
  //   confirm=true  -> bấm "Đồng ý"
  //   confirm=false -> bấm "Hủy bỏ"
  function findVisibleMessager() {
    const bodies = Array.from(document.querySelectorAll(".messager-body"));
    const candidates = bodies.filter(
      (b) => b.querySelector(".messager-button a.l-btn") && isVisible(b),
    );
    if (candidates.length === 0) return null;
    // nếu có nhiều, lấy cái mở sau cùng (thường nằm trên cùng)
    return candidates[candidates.length - 1];
  }

  function clickMessagerButton(confirm) {
    const body = findVisibleMessager();
    if (!body) {
      toast("Không thấy hộp thoại xác nhận");
      return;
    }

    const wantText = confirm ? "đồng ý" : "hủy bỏ";
    const btns = Array.from(body.querySelectorAll(".messager-button a.l-btn"));

    // ưu tiên khớp theo text trong .l-btn-text
    let target = btns.find((a) => {
      const span = a.querySelector(".l-btn-text") || a;
      return (span.textContent || "").trim().toLowerCase() === wantText;
    });

    // fallback theo vị trí: nút đầu = Đồng ý, nút cuối = Hủy bỏ
    if (!target && btns.length) {
      target = confirm ? btns[0] : btns[btns.length - 1];
    }

    if (!target) {
      toast("Không thấy nút " + (confirm ? "Đồng ý" : "Hủy bỏ"));
      return;
    }

    target.click();
    toast(confirm ? "✓ Đồng ý" : "✗ Hủy bỏ");
  }

  // ====== Toast nhỏ hiển thị tiến độ trên trang ======
  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById("__kh_auto_next_toast__");
    if (!el) {
      el = document.createElement("div");
      el.id = "__kh_auto_next_toast__";
      el.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(15, 76, 129, 0.95);
        color: white;
        padding: 10px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        pointer-events: none;
        transition: opacity 0.2s;
      `;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.style.opacity = "0";
    }, 2000);
  }

  // ====== Bảng legend (cheat sheet) các phím -> giá trị + nút switch bật/tắt ======
  let legendBox = null;
  let legendToggle = null;
  let legendOn = false;

  function isFail(statusCol) {
    return /không/i.test(statusCol || "");
  }

  function buildLegend() {
    if (legendBox) return;
    legendBox = document.createElement("div");
    legendBox.id = "__kh_legend_box__";
    legendBox.style.cssText = `
      position: fixed;
      top: 56px;
      right: 20px;
      width: 360px;
      max-height: 70vh;
      overflow-y: auto;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      padding: 10px 12px;
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: none;
    `;

    const title = document.createElement("div");
    title.style.cssText =
      "font-size:13px;font-weight:700;color:#0f4c81;margin-bottom:8px;";
    title.textContent = "Phím tắt chấm điểm";
    legendBox.appendChild(title);

    for (const [key, vals] of Object.entries(TYPE_KEY_MAP)) {
      const fail = isFail(vals[1]);
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid #f1f5f9;";

      const chip = document.createElement("span");
      chip.textContent = key.toUpperCase();
      chip.style.cssText = `
        flex:0 0 auto;
        display:inline-flex;align-items:center;justify-content:center;
        width:22px;height:22px;border-radius:5px;
        font-family:"SF Mono", Menlo, monospace;font-size:12px;font-weight:700;
        background:${fail ? "#fee2e2" : "#dcfce7"};
        color:${fail ? "#b91c1c" : "#15803d"};
      `;

      const score = document.createElement("span");
      score.textContent = vals[0];
      score.style.cssText =
        "flex:0 0 28px;text-align:right;font-size:12px;font-weight:600;color:#374151;";

      const desc = document.createElement("span");
      desc.textContent = vals[2];
      desc.style.cssText =
        "flex:1 1 auto;font-size:12px;color:#374151;line-height:1.3;";
      desc.title = vals[1] + " — " + vals[2];

      row.appendChild(chip);
      row.appendChild(score);
      row.appendChild(desc);
      legendBox.appendChild(row);
    }

    document.body.appendChild(legendBox);
  }

  function setLegend(on) {
    buildLegend();
    legendOn = on;
    legendBox.style.display = on ? "block" : "none";
    if (legendToggle) {
      legendToggle.style.background = on ? "#0f4c81" : "#9ca3af";
      legendToggle.dataset.on = on ? "1" : "0";
      const knob = legendToggle.querySelector("span");
      if (knob) knob.style.left = on ? "22px" : "2px";
    }
    chrome.storage.local.set({ legendOn: on });
  }

  function toggleLegend() {
    setLegend(!legendOn);
  }

  function buildLegendToggle() {
    if (legendToggle) return;
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000001;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;

    legendToggle = document.createElement("div");
    legendToggle.dataset.on = "0";
    legendToggle.title = "Bật/tắt bảng phím tắt";
    legendToggle.style.cssText = `
      position: relative;
      width: 42px;height: 24px;border-radius: 12px;
      background:#9ca3af;cursor:pointer;transition:background .15s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    `;
    const knob = document.createElement("span");
    knob.style.cssText = `
      position:absolute;top:2px;left:2px;
      width:20px;height:20px;border-radius:50%;
      background:white;transition:left .15s;
    `;
    legendToggle.appendChild(knob);

    const label = document.createElement("span");
    label.textContent = "Phím tắt";
    label.style.cssText =
      "font-size:12px;font-weight:600;color:#0f4c81;background:white;padding:3px 8px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.15);cursor:pointer;";

    wrap.appendChild(legendToggle);
    wrap.appendChild(label);
    document.body.appendChild(wrap);

    legendToggle.addEventListener("click", toggleLegend);
    label.addEventListener("click", toggleLegend);
  }

  // Tạo nút switch + khôi phục trạng thái đã lưu
  (async function initLegend() {
    buildLegendToggle();
    const { legendOn: saved } = await chrome.storage.local.get(["legendOn"]);
    setLegend(!!saved);
  })();

  // ====== Listen message từ popup ======
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "fillAndSearch") {
      fillAndSearch(msg.khCode, msg.unit).then((res) => sendResponse(res));
      return true; // async response
    }
  });

  // ====== Listen phím tắt ======
  document.addEventListener(
    "keydown",
    (e) => {
      // Popup ảnh đang mở (chế độ slide):
      //   Esc -> close popup + reset fancybox; auto-assign "a" when "số ảnh cần đạt"
      //          is met, else the "Có <n> ảnh đạt" fail key (see partialPassKey)
      //   With Auto next on, a saved result (Esc or a type key) also moves to the
      //   next KH, and reaching "số ảnh cần đạt" saves "a" without Esc (see score()).
      //   ← / ↓ -> ảnh trước ; → / ↑ -> ảnh sau
      //   1 -> chấm Đạt ; 0 -> chấm Chưa đạt (ảnh hiện tại)
      //   phím gán Type -> lưu kết quả KH; phím "Không Đạt" chấm luôn ảnh hiện tại = 0
      //   = -> open the Mã KH trùng box over the popup
      //   phím khác -> bỏ qua
      // An auto next is waiting on the Mã KH trùng box and its toast asks for Enter /
      // Esc: act on the box even with focus outside it, rather than letting the popup
      // Esc below run, which would overwrite the result just saved.
      if (
        (e.key === "Enter" || e.key === "Escape") &&
        pendingAutoNext &&
        e.target !== dupInput &&
        dupBox.style.display !== "none"
      ) {
        e.preventDefault();
        if (e.key === "Enter") {
          saveDup(
            dupBox.dataset.key || "",
            dupBox.dataset.code || "",
            dupInput.value.trim(),
          );
        }
        hideDupBox();
        runPendingAutoNext();
        return;
      }

      // Right after an auto next (see autoNavAt). Checked before the "3" paste and the
      // editable early return: fillAndSearch focuses the Mã KH input for ~150ms, and a
      // key let through there is typed into the search code.
      if (
        performance.now() - autoNavAt < AUTO_NAV_GUARD_MS &&
        e.target !== dupInput &&
        !document.getElementById("__kh_img_popup__") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key.length === 1 || e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        toast("Auto next vừa sang KH mới — bỏ qua phím vừa bấm");
        return;
      }

      // Keys typed into that box skip this branch, so they reach the input like they
      // do without the popup (plain text, "3" pastes) instead of scoring images.
      if (document.getElementById("__kh_img_popup__") && e.target !== dupInput) {
        if (e.key === "Escape") {
          e.preventDefault();
          // Đếm từ popupItems, KHÔNG qua popupApi: popupApi có thể đã bị xóa
          // (reload extension để lại overlay cũ, close/rebuild...) trong khi
          // overlay vẫn còn trong DOM -> trước đây Esc im lặng không lưu gì.
          console.log("[KH Esc] Esc trong popup ảnh -> đóng + xét tự gán A");
          const seq = navSeq;
          closeImagePopup();
          closeNativeFancybox();
          autoAssignPassOnEsc().then((saved) => autoNextAfterSave(seq, saved));
        } else if (e.key === "Tab") {
          // Same as the ✕ button: close only, unlike Esc it saves no result.
          e.preventDefault();
          closeImagePopup();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          if (popupApi) popupApi.prev();
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          if (popupApi) popupApi.next();
        } else if (e.key === "1") {
          e.preventDefault();
          if (popupApi) popupApi.scoreCurrent(true);
        } else if (e.key === "0") {
          e.preventDefault();
          if (popupApi) popupApi.scoreCurrent(false);
        } else if (e.key === "2") {
          // Copy Mã KH 23 ký tự của KH hiện tại
          e.preventDefault();
          if (currentKhFull) {
            copyText(currentKhFull).then((ok) =>
              toast(ok ? "📋 Đã copy Mã KH: " + currentKhFull : "Copy thất bại"),
            );
          } else {
            toast("KH này không có Mã KH 23 ký tự");
          }
        } else if (e.key === "=") {
          e.preventDefault();
          promptDupForCurrent();
        } else {
          // Phím gán Type (a, b, c, ...) vẫn chạy được khi popup đang mở.
          // Phím "Không Đạt" gán xong thì tự chấm 0 cho ảnh đang xem (như bấm phím 0).
          const k = (e.key || "").toLowerCase();
          if (TYPE_KEY_MAP[k]) {
            e.preventDefault();
            // A held key would re-save once per repeat, and with Auto next each repeat
            // can land on the following KH.
            if (e.repeat) return;
            // Capture the api now: assignTypeKey awaits storage + clipboard, and the
            // popup can be closed (popupApi nulled) before it resolves.
            const api = popupApi;
            const seq = navSeq;
            assignTypeKey(k).then((saved) => {
              if (isFailKey(k) && api) api.scoreCurrent(false);
              autoNextAfterSave(seq, saved);
            });
          }
        }
        return;
      }

      // Phím "3" khi đang focus 1 ô input/textarea = paste clipboard vào ô đó (như Cmd+V).
      // Không focus ô nào -> rơi xuống hành vi cũ (Hủy bỏ) bên dưới.
      if (e.key === "3" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target;
        const tg = ((t && t.tagName) || "").toLowerCase();
        if (tg === "input" || tg === "textarea" || (t && t.isContentEditable)) {
          e.preventDefault();
          pasteIntoFocused(t);
          return;
        }
      }

      const tag = (e.target.tagName || "").toLowerCase();
      const editable =
        tag === "input" || tag === "textarea" || e.target.isContentEditable;
      if (editable) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        shortcutGoto(+1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        shortcutGoto(-1);
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Phím "=" -> mở ô nhập Mã KH trùng cho KH hiện tại
      if (e.key === "=") {
        e.preventDefault();
        promptDupForCurrent();
        return;
      }

      // Phím "1" -> Đạt trưng bày + Lưu ; "0" -> Không đạt + Lưu
      if (e.key === "1") {
        e.preventDefault();
        markDisplayResult(true);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        markDisplayResult(false);
        return;
      }

      // Phím "2" -> bấm "Đồng ý" ; "3" -> bấm "Hủy bỏ" trên hộp thoại messager
      if (e.key === "2") {
        e.preventDefault();
        clickMessagerButton(true);
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        clickMessagerButton(false);
        return;
      }

      const k = (e.key || "").toLowerCase();
      if (TYPE_KEY_MAP[k]) {
        e.preventDefault();
        if (e.repeat) return; // see the popup branch
        const seq = navSeq;
        assignTypeKey(k).then((saved) => autoNextAfterSave(seq, saved));
      }
    },
    true,
  );

  console.log("[KH Auto Next] Content script loaded");
})();
