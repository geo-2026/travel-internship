// =====================================================================
//  ui.js — 화면 공통 도우미 (토스트 · 진행 표시 · 서식 · DOM 헬퍼)
// =====================================================================

/* --------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------- */
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/**
 * 요소를 만듭니다.
 * el("div", { class:"x", text:"안녕" }, [자식...])
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") { node.textContent = v; continue; }
    if (k === "html") { node.innerHTML = v; continue; }
    if (k === "class") { node.className = v; continue; }
    if (k === "style" && typeof v === "object") {
      // 커스텀 속성(--pc 등)은 setProperty 로만 설정됩니다
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith("--")) node.style.setProperty(prop, val);
        else node.style[prop] = val;
      }
      continue;
    }
    if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
      continue;
    }
    if (v === true) { node.setAttribute(k, ""); continue; }
    node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * 조사 자동 선택 — 받침이 있으면 앞 것, 없으면 뒤 것.
 * 예) josa("숙소", "을", "를") → "를", josa("맛집", "을", "를") → "을"
 */
export function josa(word, withBatchim, withoutBatchim) {
  const s = String(word || "").trim();
  if (!s) return withoutBatchim;
  const code = s.charCodeAt(s.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 ? withBatchim : withoutBatchim;
  }
  return withoutBatchim;
}

/* --------------------------------------------------------------------
   토스트
   -------------------------------------------------------------------- */
export function toast(message, kind = "", ms = 2600) {
  const host = document.getElementById("toastRoot");
  if (!host) return;
  const t = el("div", { class: `toast ${kind ? "toast--" + kind : ""}`, text: message });
  host.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 260);
  }, ms);
}

/* --------------------------------------------------------------------
   진행 표시
   -------------------------------------------------------------------- */
let busyCount = 0;

export function busy(on, text = "잠시만 기다려 주세요…") {
  const box = document.getElementById("busy");
  const label = document.getElementById("busyText");
  if (!box) return;

  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  if (busyCount > 0) {
    if (label) label.textContent = text;
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

/** 진행 표시를 켠 채로 작업을 실행하고 반드시 끕니다 */
export async function withBusy(text, fn) {
  busy(true, text);
  try {
    return await fn();
  } finally {
    busy(false);
  }
}

/* --------------------------------------------------------------------
   숫자 · 금액 서식
   -------------------------------------------------------------------- */

/** 12345 → "12,345" */
export function comma(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR");
}

/** 12345 → "12,345원" */
export function won(n) {
  return `${comma(n)}원`;
}

/** 입력값에서 숫자만 남깁니다 */
export function digitsOnly(s) {
  return String(s == null ? "" : s).replace(/[^0-9]/g, "");
}

/**
 * 가격 입력칸에 "입력 즉시 천 단위 콤마"를 붙입니다 (§6 팝업 공통 동작).
 * 커서 위치를 최대한 유지합니다.
 */
export function attachPriceMask(input) {
  const format = () => {
    const before = input.value;
    const caretFromEnd = before.length - (input.selectionStart ?? before.length);

    const digits = digitsOnly(before).slice(0, 12);
    const next = digits ? comma(digits) : "";
    if (next !== before) {
      input.value = next;
      const pos = Math.max(0, next.length - caretFromEnd);
      try { input.setSelectionRange(pos, pos); } catch (_) { /* 무시 */ }
    }
  };
  input.addEventListener("input", format);
  input.addEventListener("blur", format);
  format();
  return input;
}

/** 가격 입력칸의 현재 값을 숫자로 */
export function priceValue(input) {
  const d = digitsOnly(input.value);
  return d ? Math.min(Number(d), 999_999_999) : 0;
}

/* --------------------------------------------------------------------
   폼 조각 만들기
   -------------------------------------------------------------------- */

/**
 * 라벨 + 입력칸 한 벌
 * @returns {{ wrap:HTMLElement, input:HTMLElement, error:HTMLElement }}
 */
export function field({
  label, id, type = "text", value = "", placeholder = "",
  help = "", required = false, maxlength, inputmode, rows
}) {
  const wrap = el("div", { class: "field" });

  const lab = el("label", { class: "field__label", for: id, text: label });
  if (required) lab.appendChild(el("span", { class: "req", text: "필수" }));
  wrap.appendChild(lab);

  const input = type === "textarea"
    ? el("textarea", { class: "textarea", id, placeholder, rows: rows || 3, maxlength })
    : el("input", { class: "input", id, type, placeholder, maxlength, inputmode });

  input.value = value == null ? "" : String(value);
  wrap.appendChild(input);

  if (help) wrap.appendChild(el("p", { class: "field__help", text: help }));
  const error = el("p", { class: "field__err", hidden: true });
  wrap.appendChild(error);

  return { wrap, input, error };
}

export function showFieldError(errorEl, inputEl, message) {
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    inputEl.classList.add("is-error");
  } else {
    errorEl.hidden = true;
    inputEl.classList.remove("is-error");
  }
}

/* --------------------------------------------------------------------
   기타
   -------------------------------------------------------------------- */
export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** 두 좌표가 사실상 같은 위치인지 (약 15m 이내) */
export function sameSpot(a, b) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 0.00015 && Math.abs(a[1] - b[1]) < 0.00015;
}

/** 파일을 내려받습니다 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}
