// popup.js - Xử lý UI và logic của popup

const $ = (id) => document.getElementById(id);

const elKhList = $("khList");
const elCurrent = $("currentKH");
const elProgress = $("progressInfo");
const elStatus = $("status");
const btnStart = $("btnStart");
const btnNext = $("btnNext");
const btnPrev = $("btnPrev");
const btnReset = $("btnReset");
const elProgram = $("programSelect");
const elSoAnh = $("soAnhSelect");
const elSoMat = $("soMatSelect");
const elResultsView = $("resultsView");
const elResultsCount = $("resultsCount");
const btnCopyTsv = $("btnCopyTsv");
const btnCopyTypeCol = $("btnCopyTypeCol");
const btnClearResults = $("btnClearResults");

// State được lưu vào chrome.storage để giữ giữa các lần đóng/mở popup
async function getState() {
  const data = await chrome.storage.local.get([
    "khArr",
    "unitArr",
    "khFullArr",
    "idx",
    "rawList",
    "results",
    "dups",
    "program",
    "soAnh",
    "soMat",
  ]);
  return {
    khArr: data.khArr || [],
    unitArr: data.unitArr || [],
    khFullArr: data.khFullArr || [],
    idx: typeof data.idx === "number" ? data.idx : -1,
    rawList: data.rawList || "",
    results: data.results || {},
    dups: data.dups || {},
    program: data.program || "",
    soAnh: data.soAnh || "",
    soMat: data.soMat || "",
  };
}

// Dựng <option> cho 1 <select> từ mảng giá trị (value = text).
function fillSelect(sel, options) {
  sel.replaceChildren();
  for (const v of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
}

// Mã chương trình = "CTTBGTTQ" + MMYY (tháng+năm hiện tại) + hậu tố.
// MMYY động theo thời gian: tháng 7/2026 => "0726", sang tháng 8 => "0826".
const PROGRAM_PREFIX = "CTTBGTTQ";
const PROGRAM_SUFFIXES = [
  "_SDDCOLOS",
  "SSML_MCM",
  "STBBS_KH",
  "STNX_KH",
  "STNX_MCM",
  "STTTMCC_CHS",
  "STTTMCC_TAPHOA",
  "STTTMCC_MB",
  "STTTMCC_MM",
];

// Format MMYY từ ngày hiện tại: MM (2 chữ số) + YY (2 chữ số cuối của năm).
function currentMMYY(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return mm + yy;
}

// Build các <option> chương trình vào #programSelect (giữ nguyên option rỗng đầu tiên).
function buildProgramOptions() {
  const mmYY = currentMMYY();
  for (const suffix of PROGRAM_SUFFIXES) {
    const val = PROGRAM_PREFIX + mmYY + suffix;
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    elProgram.appendChild(opt);
  }
}

// Khóa duy nhất theo cặp (Đơn vị + Mã KH) — phải khớp với content.js
function rowKey(unit, code) {
  return (unit || "") + "\u0001" + (code || "");
}

// Lấy bộ 3 giá trị Type cho 1 khóa (an toàn với dữ liệu cũ dạng chuỗi)
function typeTriple(results, key) {
  const v = results[key];
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return [arr[0] || "", arr[1] || "", arr[2] || ""];
}

// Build TSV theo thứ tự khArr (giữ thứ tự đúng với Sheets).
//   typeColOnly=false -> 6 cột: Đơn vị | Mã KH | val1 | val2 | val3 | Mã KH trùng
//   typeColOnly=true  -> 4 cột: val1 | val2 | val3 | Mã KH trùng (bỏ Đơn vị + Mã KH)
function buildTsv(khArr, unitArr, results, dups, typeColOnly = false) {
  return khArr
    .map((code, i) => {
      const unit = unitArr[i] || "";
      const key = rowKey(unit, code);
      const triple = typeTriple(results, key);
      const dup = (dups && dups[key]) || "";
      if (typeColOnly) return [...triple, dup].join("\t");
      return [unit, code, ...triple, dup].join("\t");
    })
    .join("\n");
}

function renderResults(state) {
  const { khArr, unitArr = [], results, dups = {} } = state;
  let count = 0;
  const lines = [];
  khArr.forEach((code, i) => {
    const unit = unitArr[i] || "";
    const key = rowKey(unit, code);
    if (!results[key] && !dups[key]) return;
    count++;
    lines.push([unit, code, ...typeTriple(results, key), dups[key] || ""].join("\t"));
  });
  elResultsCount.textContent = String(count);
  elResultsView.value = lines.join("\n");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
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

async function setState(partial) {
  await chrome.storage.local.set(partial);
}

function setStatus(msg, type = "") {
  elStatus.textContent = msg;
  elStatus.className = "status " + type;
}

function render(state) {
  const { khArr, unitArr = [], idx } = state;
  if (khArr.length === 0) {
    elCurrent.textContent = "—";
    elProgress.textContent = "Chưa có danh sách";
    btnNext.disabled = true;
    btnPrev.disabled = true;
    return;
  }
  if (idx < 0) {
    elCurrent.textContent = "Sẵn sàng";
    elProgress.textContent = `0 / ${khArr.length} — bấm Next để bắt đầu`;
    btnNext.disabled = false;
    btnPrev.disabled = true;
    return;
  }
  if (idx >= khArr.length) {
    elCurrent.textContent = "✓ Hoàn thành";
    elProgress.textContent = `Đã xong ${khArr.length}/${khArr.length}`;
    btnNext.disabled = true;
    btnPrev.disabled = false;
    return;
  }
  const kh = khArr[idx];
  const unit = unitArr[idx] || "";
  elCurrent.textContent = unit ? `${unit} / ${kh}` : kh;
  elProgress.textContent = `${idx + 1} / ${khArr.length}`;
  btnNext.disabled = false;
  btnPrev.disabled = idx <= 0;
}

// Parse danh sách 2 cột theo từng dòng: cột 1 = Đơn vị, cột 2 = Mã KH.
// Tách trong dòng bằng Tab / khoảng trắng / phẩy / chấm phẩy.
// Dòng chỉ có 1 token => coi như chỉ có Mã KH (Đơn vị rỗng) để tương thích cũ.
function parseList(raw) {
  const units = [];
  const khs = [];
  const fulls = []; // cột 3: Mã KH 23 ký tự (tùy chọn)
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const parts = t
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) continue;
    if (parts.length >= 2) {
      units.push(parts[0]);
      khs.push(parts[1]);
      fulls.push(parts[2] || "");
    } else {
      units.push("");
      khs.push(parts[0]);
      fulls.push("");
    }
  }
  return { units, khs, fulls };
}

// Gửi message sang content script trên tab đang active để chọn Đơn vị + điền KH + click
async function sendFillAndSearch(khCode, unit) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("Không tìm thấy tab");

  // Inject content script lần nữa cho chắc (trường hợp tab cũ chưa load)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["keymap.js", "content.js"],
    });
  } catch (e) {
    // Có thể fail nếu là trang chrome:// — bỏ qua, message vẫn sẽ thử
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id,
      { action: "fillAndSearch", khCode, unit },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.ok) {
          resolve(response);
        } else {
          reject(new Error((response && response.error) || "Không phản hồi"));
        }
      },
    );
  });
}

async function gotoIndex(newIdx) {
  const state = await getState();
  if (state.khArr.length === 0) {
    setStatus("Chưa có danh sách KH", "error");
    return;
  }
  if (newIdx < 0 || newIdx >= state.khArr.length) {
    if (newIdx >= state.khArr.length) {
      await setState({ idx: state.khArr.length });
      render({ ...state, idx: state.khArr.length });
      setStatus("Đã hết danh sách", "success");
    }
    return;
  }

  const khCode = state.khArr[newIdx];
  const unit = state.unitArr[newIdx] || "";
  setStatus(`Đang điền: ${unit ? unit + " / " : ""}${khCode}...`);
  try {
    const resp = await sendFillAndSearch(khCode, unit);
    await setState({ idx: newIdx });
    render({ ...state, idx: newIdx });
    let msg = `✓ Đã điền ${unit ? unit + " / " : ""}${khCode}`;
    if (unit && resp && resp.shop && resp.shop.ok === false) {
      msg += " (⚠ Đơn vị không khớp)";
    }
    setStatus(msg, "success");
  } catch (err) {
    setStatus(`Lỗi: ${err.message}`, "error");
  }
}

btnStart.addEventListener("click", async () => {
  const raw = elKhList.value;
  const { units, khs, fulls } = parseList(raw);
  if (khs.length === 0) {
    setStatus("Danh sách trống", "error");
    return;
  }
  await setState({ khArr: khs, unitArr: units, khFullArr: fulls, idx: -1, rawList: raw });
  render({ khArr: khs, unitArr: units, idx: -1, rawList: raw });
  setStatus(`Đã nạp ${khs.length} dòng. Bấm Next để bắt đầu.`, "success");
});

elProgram.addEventListener("change", async () => {
  await setState({ program: elProgram.value });
  setStatus(
    elProgram.value
      ? `Chấm theo chương trình: ${elProgram.value}`
      : "Tắt chấm theo chương trình",
    "success",
  );
});

elSoAnh.addEventListener("change", async () => {
  await setState({ soAnh: elSoAnh.value });
  renderKeyLegend();
  setStatus(`Số ảnh cần đạt: ${elSoAnh.value}`, "success");
});

elSoMat.addEventListener("change", async () => {
  await setState({ soMat: elSoMat.value });
  renderKeyLegend();
  setStatus(`Số mặt: ${elSoMat.value}`, "success");
});

btnNext.addEventListener("click", async () => {
  const state = await getState();
  await gotoIndex(state.idx + 1);
});

btnPrev.addEventListener("click", async () => {
  const state = await getState();
  await gotoIndex(state.idx - 1);
});

btnReset.addEventListener("click", async () => {
  if (!confirm("Reset toàn bộ danh sách, tiến độ và kết quả Type?")) return;
  await chrome.storage.local.clear();
  elKhList.value = "";
  elProgram.value = "";
  elSoAnh.value = (window.SO_ANH_OPTIONS || [])[0] || "";
  elSoMat.value = (window.SO_MAT_OPTIONS || [])[0] || "";
  await setState({ soAnh: elSoAnh.value, soMat: elSoMat.value });
  render({ khArr: [], unitArr: [], idx: -1 });
  renderResults({ khArr: [], results: {} });
  renderKeyLegend();
  setStatus("Đã reset", "");
});

btnCopyTsv.addEventListener("click", async () => {
  const state = await getState();
  if (state.khArr.length === 0) {
    setStatus("Chưa có danh sách KH", "error");
    return;
  }
  const tsv = buildTsv(state.khArr, state.unitArr, state.results, state.dups, false);
  const ok = await copyToClipboard(tsv);
  setStatus(
    ok
      ? `✓ Đã copy ${state.khArr.length} dòng (đủ 6 cột)`
      : "Copy thất bại",
    ok ? "success" : "error",
  );
});

btnCopyTypeCol.addEventListener("click", async () => {
  const state = await getState();
  if (state.khArr.length === 0) {
    setStatus("Chưa có danh sách KH", "error");
    return;
  }
  const tsv = buildTsv(state.khArr, state.unitArr, state.results, state.dups, true);
  const ok = await copyToClipboard(tsv);
  setStatus(
    ok
      ? `✓ Đã copy ${state.khArr.length} dòng (trừ Đơn vị + Mã KH)`
      : "Copy thất bại",
    ok ? "success" : "error",
  );
});

btnClearResults.addEventListener("click", async () => {
  if (!confirm("Xóa toàn bộ kết quả đã gán (gồm cả Mã KH trùng)?")) return;
  await chrome.storage.local.set({ results: {}, dups: {} });
  const state = await getState();
  renderResults(state);
  setStatus("Đã xóa kết quả", "");
});

// Tự refresh khi storage thay đổi (do content script ghi vào)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.results || changes.khArr || changes.dups) {
    (async () => {
      const state = await getState();
      renderResults(state);
    })();
  }
  if (changes.idx || changes.khArr || changes.unitArr) {
    (async () => {
      const state = await getState();
      render(state);
    })();
  }
});

// Render bảng phím tắt gán giá trị từ TYPE_KEY_MAP (keymap.js) — luôn đồng bộ
function renderKeyLegend() {
  const host = $("keyLegend");
  if (!host || !window.TYPE_KEY_MAP) return;
  host.replaceChildren();
  for (const [key, vals0] of Object.entries(window.TYPE_KEY_MAP)) {
    // Phím "a" (Đạt) hiển thị theo lựa chọn hiện tại: cột3 = số mặt, cột5 = số ảnh.
    const vals =
      key === "a" && window.passTriple
        ? window.passTriple(elSoMat.value, elSoAnh.value)
        : vals0;
    const fail = /không/i.test(vals[1] || "");
    const row = document.createElement("div");
    row.className = "kl-row";

    const kbd = document.createElement("span");
    kbd.className = "kl-key " + (fail ? "fail" : "pass");
    kbd.textContent = key.toUpperCase();

    const score = document.createElement("span");
    score.className = "kl-score";
    score.textContent = vals[0];

    const desc = document.createElement("span");
    desc.className = "kl-desc";
    desc.textContent = vals[2];
    desc.title = vals[1] + " — " + vals[2];

    row.appendChild(kbd);
    row.appendChild(score);
    row.appendChild(desc);
    host.appendChild(row);
  }
}

// Init khi mở popup
(async function init() {
  const state = await getState();
  elKhList.value = state.rawList;
  buildProgramOptions();
  elProgram.value = state.program;
  fillSelect(elSoAnh, window.SO_ANH_OPTIONS || []);
  fillSelect(elSoMat, window.SO_MAT_OPTIONS || []);
  elSoAnh.value = state.soAnh || (window.SO_ANH_OPTIONS || [])[0] || "";
  elSoMat.value = state.soMat || (window.SO_MAT_OPTIONS || [])[0] || "";
  // Lưu lại giá trị mặc định để content.js luôn có dữ liệu cho phím "a".
  await setState({ soAnh: elSoAnh.value, soMat: elSoMat.value });
  render(state);
  renderResults(state);
  renderKeyLegend();
})();
