// ui.js — 모달·토스트·입력 포맷 등 화면 공용 부품.

const modalRoot = () => document.getElementById("modal-root");
let openCount = 0;

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v === true ? "" : String(v));
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

export function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── 토스트 ─────────────────────────────────────────────────────────────────

let toastTimer = null;
export function toast(message, ms = 2600) {
  const host = document.getElementById("toast");
  if (!host) return;
  host.textContent = message;
  host.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove("is-visible"), ms);
}

// ── 모달 ───────────────────────────────────────────────────────────────────

/**
 * 팝업을 연다. ESC · 배경 탭 · 안드로이드 뒤로가기(popstate)로 닫힌다(§6 공통 동작).
 * @param {object} opts
 *   title      제목
 *   body       HTMLElement (본문)
 *   applyLabel 적용 버튼 문구 (없으면 적용 버튼 숨김)
 *   onApply    () => boolean|Promise<boolean> — false 를 돌려주면 닫지 않음
 *   isDirty    () => boolean — true 면 닫기 전에 확인창
 * @returns {{close: Function}}
 */
export function openModal(opts) {
  const root = modalRoot();
  const historyPushed = { value: false };

  const backdrop = el("div", { class: "modal-backdrop", role: "presentation" });
  const panel = el("div", {
    class: "modal-panel", role: "dialog", "aria-modal": "true",
    "aria-label": opts.title || "입력"
  });

  const closeBtn = el("button", {
    class: "modal-x", type: "button", "aria-label": "닫기", text: "✕"
  });

  const header = el("div", { class: "modal-header" }, [
    el("h2", { class: "modal-title", text: opts.title || "" }),
    closeBtn
  ]);

  const bodyWrap = el("div", { class: "modal-body" }, [opts.body]);

  const footerButtons = [
    el("button", { class: "btn btn-ghost", type: "button", text: opts.closeLabel || "닫기" })
  ];
  if (opts.applyLabel !== null) {
    footerButtons.push(
      el("button", { class: "btn btn-primary", type: "button", text: opts.applyLabel || "적용" })
    );
  }
  const footer = el("div", { class: "modal-footer" }, footerButtons);

  panel.append(header, bodyWrap, footer);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);
  document.body.classList.add("modal-open");
  openCount++;

  let closed = false;

  function destroy() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("popstate", onPop);
    backdrop.remove();
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.classList.remove("modal-open");
    if (historyPushed.value) {
      historyPushed.value = false;
      history.back();          // 우리가 넣은 항목을 되돌린다
    }
    if (opts.onClose) opts.onClose();
  }

  function requestClose() {
    if (opts.isDirty && opts.isDirty()) {
      if (!confirm("저장하지 않고 닫을까요?")) return;
    }
    destroy();
  }

  async function apply() {
    if (!opts.onApply) return destroy();
    const ok = await opts.onApply();
    if (ok !== false) {
      if (historyPushed.value) {
        // 적용 시에는 dirty 확인 없이 바로 닫는다
        historyPushed.value = false;
        history.back();
      }
      closed = true;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      backdrop.remove();
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.classList.remove("modal-open");
      if (opts.onClose) opts.onClose();
    }
  }

  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); requestClose(); }
  }
  function onPop() {
    historyPushed.value = false;   // 이미 뒤로가기가 소비됨
    destroy();
  }

  closeBtn.addEventListener("click", requestClose);
  footerButtons[0].addEventListener("click", requestClose);
  if (footerButtons[1]) footerButtons[1].addEventListener("click", apply);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) requestClose();
  });
  document.addEventListener("keydown", onKey);

  history.pushState({ modal: true }, "");
  historyPushed.value = true;
  window.addEventListener("popstate", onPop);

  const firstField = panel.querySelector("input, textarea, select, button");
  if (firstField) setTimeout(() => firstField.focus(), 30);

  return { close: destroy, panel };
}

// ── 금액 입력 ──────────────────────────────────────────────────────────────

export function formatKRW(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR");
}

export function parseKRW(text) {
  const digits = String(text || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

/** 숫자만 허용하고 입력 즉시 천 단위 콤마를 넣는다(§6 공통 동작). */
export function bindMoneyInput(input) {
  const reformat = () => {
    const value = parseKRW(input.value);
    input.value = value ? formatKRW(value) : "";
  };
  input.setAttribute("inputmode", "numeric");
  input.addEventListener("input", reformat);
  input.addEventListener("blur", reformat);
  reformat();
  return () => parseKRW(input.value);
}

// ── 폼 필드 헬퍼 ───────────────────────────────────────────────────────────

export function field(label, control, hint) {
  const id = control.id || `f_${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return el("div", { class: "field" }, [
    el("label", { class: "field-label", for: id, text: label }),
    control,
    hint ? el("p", { class: "field-hint", text: hint }) : null
  ]);
}

export function textInput(value, placeholder, maxlength) {
  return el("input", {
    class: "input", type: "text", value: value || "",
    placeholder: placeholder || "", maxlength: maxlength || null
  });
}

export function textArea(value, placeholder, maxlength, rows) {
  const t = el("textarea", {
    class: "input textarea", placeholder: placeholder || "",
    maxlength: maxlength || null, rows: rows || 3
  });
  t.value = value || "";
  return t;
}
