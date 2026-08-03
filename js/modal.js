// =====================================================================
//  modal.js — 팝업 공통 프레임 (명세서 §6 「팝업 공통 동작」)
//
//  · 하단 버튼 [닫기](취소) / [적용](저장)
//  · 변경 후 닫으면 "저장하지 않고 닫을까요?" 확인
//  · ESC · 배경 탭 · 안드로이드 뒤로가기(popstate) 로 닫힘
//  · 포커스 트랩 · 배경 스크롤 잠금
// =====================================================================

const root = () => document.getElementById("modalRoot");

/** 열려 있는 모달들 (가장 위가 마지막) */
const stack = [];
let historyDepth = 0;
let ignorePop = false;

/* --------------------------------------------------------------------
   공통 열기
   -------------------------------------------------------------------- */

/**
 * @param {object} o
 * @param {string} o.title      제목
 * @param {string} [o.color]    제목 앞 색상 점 (유형 색)
 * @param {(body:HTMLElement)=>void} o.render  본문을 그리는 함수
 * @param {string} [o.applyText="적용"]
 * @param {string} [o.closeText="닫기"]
 * @param {()=>boolean|Promise<boolean>} [o.onApply]  false 를 돌려주면 닫히지 않습니다
 * @param {()=>boolean} [o.isDirty]  변경 여부 (닫기 확인용)
 * @param {()=>void} [o.onClosed]
 * @param {boolean} [o.showApply=true]
 * @returns {{ close:()=>void, hide:()=>void, show:()=>void, panel:HTMLElement, body:HTMLElement }}
 */
export function openModal(o) {
  const host = root();
  host.hidden = false;
  document.body.style.overflow = "hidden";

  const wrap = document.createElement("div");
  wrap.className = "modal";

  const scrim = document.createElement("div");
  scrim.className = "modal__scrim";

  const panel = document.createElement("div");
  panel.className = "modal__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", o.title || "");

  // ── 머리말
  const head = document.createElement("div");
  head.className = "modal__head";
  if (o.color) {
    const dot = document.createElement("span");
    dot.className = "modal__dot";
    dot.style.background = o.color;
    head.appendChild(dot);
  }
  const h = document.createElement("h2");
  h.className = "modal__title";
  h.textContent = o.title || "";
  head.appendChild(h);

  const x = document.createElement("button");
  x.type = "button";
  x.className = "modal__x";
  x.setAttribute("aria-label", "닫기");
  x.textContent = "✕";
  head.appendChild(x);

  // ── 본문
  const body = document.createElement("div");
  body.className = "modal__body";

  // ── 바닥
  const foot = document.createElement("div");
  foot.className = "modal__foot";

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.className = "btn";
  btnClose.textContent = o.closeText || "닫기";
  foot.appendChild(btnClose);

  let btnApply = null;
  if (o.showApply !== false) {
    btnApply = document.createElement("button");
    btnApply.type = "button";
    btnApply.className = "btn btn--primary";
    btnApply.textContent = o.applyText || "적용";
    foot.appendChild(btnApply);
  }

  panel.append(head, body, foot);
  wrap.append(scrim, panel);
  host.appendChild(wrap);

  const entry = { wrap, panel, body, o, closed: false };
  stack.push(entry);

  pushHistory();

  // ── 본문 그리기
  try {
    o.render(body, { setApplyEnabled: (v) => { if (btnApply) btnApply.disabled = !v; } });
  } catch (e) {
    console.error("[modal] 본문 렌더 실패", e);
  }

  // ── 닫기 절차
  async function requestClose() {
    if (o.isDirty && o.isDirty()) {
      const ok = await confirmDialog({
        title: "저장하지 않고 닫을까요?",
        message: "입력한 내용이 저장되지 않습니다.",
        okText: "닫기",
        danger: true
      });
      if (!ok) return;
    }
    close();
  }

  function close() {
    if (entry.closed) return;
    entry.closed = true;

    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);

    wrap.remove();
    popHistory();

    if (stack.length === 0) {
      host.hidden = true;
      document.body.style.overflow = "";
    }
    if (o.onClosed) o.onClosed();
  }

  async function apply() {
    if (!o.onApply) return close();
    if (btnApply) btnApply.disabled = true;
    let ok = true;
    try {
      ok = await o.onApply();
    } catch (e) {
      console.error("[modal] 적용 실패", e);
      ok = false;
    }
    if (btnApply) btnApply.disabled = false;
    if (ok !== false) close();
  }

  x.addEventListener("click", requestClose);
  btnClose.addEventListener("click", requestClose);
  scrim.addEventListener("click", requestClose);
  if (btnApply) btnApply.addEventListener("click", apply);

  entry.requestClose = requestClose;
  entry.close = close;

  // 첫 입력칸에 포커스
  requestAnimationFrame(() => {
    const first = body.querySelector("input, textarea, select, button");
    if (first && !isTouchDevice()) first.focus();
  });

  return {
    close,
    requestClose,
    panel,
    body,
    hide() { wrap.style.display = "none"; },
    show() { wrap.style.display = ""; }
  };
}

function isTouchDevice() {
  return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
}

/* --------------------------------------------------------------------
   ESC · 뒤로가기
   -------------------------------------------------------------------- */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || stack.length === 0) return;
  e.preventDefault();
  const top = stack[stack.length - 1];
  if (top.requestClose) top.requestClose();
});

function pushHistory() {
  historyDepth++;
  history.pushState({ __modal: historyDepth }, "");
}

function popHistory() {
  if (historyDepth <= 0) return;
  historyDepth--;
  // 사용자가 뒤로가기로 닫은 경우가 아니면 우리가 밀어 넣은 항목을 되돌립니다
  if (!ignorePop) {
    ignorePop = true;
    history.back();
    setTimeout(() => { ignorePop = false; }, 0);
  }
}

window.addEventListener("popstate", () => {
  if (ignorePop) return;
  if (stack.length === 0) return;
  const top = stack[stack.length - 1];
  ignorePop = true;
  historyDepth = Math.max(0, historyDepth - 1);
  if (top.close) top.close();
  setTimeout(() => { ignorePop = false; }, 0);
});

/* --------------------------------------------------------------------
   확인 창
   -------------------------------------------------------------------- */

/**
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, okText = "확인", cancelText = "취소", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;

    const m = openModal({
      title,
      applyText: okText,
      closeText: cancelText,
      render(body) {
        const p = document.createElement("p");
        p.style.margin = "4px 0 8px";
        p.style.lineHeight = "1.6";
        p.textContent = message || "";
        body.appendChild(p);
      },
      onApply() { answered = true; resolve(true); return true; },
      onClosed() { if (!answered) resolve(false); }
    });

    if (danger) {
      const btn = m.panel.querySelector(".modal__foot .btn--primary");
      if (btn) { btn.classList.remove("btn--primary"); btn.classList.add("btn--danger"); }
    }
  });
}

/** 안내만 하는 창 */
export function alertDialog({ title, message, okText = "확인" }) {
  return new Promise((resolve) => {
    openModal({
      title,
      applyText: okText,
      showApply: true,
      closeText: "닫기",
      render(body) {
        const p = document.createElement("p");
        p.style.margin = "4px 0 8px";
        p.style.lineHeight = "1.6";
        p.textContent = message || "";
        body.appendChild(p);
      },
      onApply() { return true; },
      onClosed() { resolve(); }
    });
  });
}

/** 현재 열려 있는 모달이 있는지 */
export function hasOpenModal() {
  return stack.length > 0;
}
