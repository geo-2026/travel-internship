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

// 안드로이드 뒤로가기로 팝업을 닫을 수 있도록 history 항목을 하나 넣어 둔다.
//
// ⚠ 예전에는 팝업마다 pushState 와 history.back() 을 짝지어 불렀다. 그런데
//    history.back() 은 **비동기**라서, 팝업을 닫자마자 다른 팝업을 열면
//    뒤늦게 도착한 popstate 가 방금 연 팝업을 즉시 닫아 버렸다.
//    (증상: "팝업이 저절로 닫힌다 / 이상하게 동작한다")
//
//    그래서 history 항목은 **팝업이 하나라도 열려 있는 동안 딱 하나만** 두고,
//    우리가 직접 부른 back() 이 만들어 낸 popstate 는 selfBack 으로 세어 무시한다.
//
// ⚠⚠ 그리고 더 고약한 것: 크롬은 **뒤로가기 이동이 대기 중일 때 들어온
//    pushState 를 그냥 버린다.** 그래서 "팝업을 닫자마자 다른 팝업 열기" 를 하면
//    새 팝업은 자기 history 항목이 있다고 착각한 채 열리고, 닫을 때 부른
//    history.back() 이 **앱 자체를 빠져나가** 학생이 빈 페이지로 튕겨 나갔다.
//    (실측: pushState len=3 → 항목이 늘지 않음 → 닫을 때 back() 이 앱 밖으로)
//
//    그래서 아래 두 곳에서 매번 "지금 정말 우리 항목 위에 서 있는지"를 확인한다.
//      · disarm 할 때  — 우리 항목이 아니면 back() 을 아예 부르지 않는다.
//      · pop 을 삼킬 때 — 팝업이 남아 있는데 항목이 사라졌으면 다시 넣는다.
const MODAL_STATE = "tiModal";
const modalStack = [];
let selfBack = 0;
let popstateBound = false;

/** 지금 브라우저가 서 있는 history 항목이 우리가 넣은 것인지. */
function onModalEntry() {
  return Boolean(history.state && history.state[MODAL_STATE]);
}

function bindPopstate() {
  if (popstateBound) return;
  popstateBound = true;
  window.addEventListener("popstate", () => {
    if (selfBack > 0) {
      selfBack--;                                  // 우리가 부른 back() — 무시
      // 팝업이 아직 남아 있는데 항목이 사라졌다면(위 크롬 동작) 다시 넣어 준다.
      if (modalStack.length && !onModalEntry()) armHistory();
      return;
    }
    const top = modalStack[modalStack.length - 1];  // 브라우저 뒤로가기 = 팝업 닫기
    if (top) top.closeFromBack();
  });
}

function armHistory() {
  bindPopstate();
  if (onModalEntry()) return;                       // 이미 우리 항목 위에 있다
  history.pushState({ [MODAL_STATE]: true }, "");
}

function disarmHistory() {
  if (!onModalEntry()) return;   // 우리 항목이 아니면 back() 은 앱을 빠져나간다
  selfBack++;
  history.back();
}

/** 지도에서 위치를 고르는 동안처럼, 팝업이 열려 있어도 배경을 만져야 할 때. */
export function setBackdropScrollLock(on) {
  document.body.classList.toggle("modal-open", Boolean(on));
}

// ── 팝업 옮기기 ────────────────────────────────────────────────────────────
//
// 팝업이 지도를 가려서 "지도를 보면서 입력" 이 안 된다는 요청으로 넣었다.
// 제목 줄을 잡고 끌면 팝업이 따라 움직인다.
//
// · 한 번이라도 옮기면 배경(어두운 막)을 투명하게 바꾸고 `pointer-events: none`
//   으로 만든다. 그래야 팝업 옆의 **지도를 그대로 보고 만질 수 있다.**
//   이때 "배경 탭 = 닫기" 는 자연히 없어지는데, 지도를 만지다가 입력하던 내용이
//   날아가지 않으므로 오히려 낫다. 닫기는 ✕·닫기 버튼·ESC 로 한다.
// · 화면 밖으로 끌어내면 되돌릴 수 없으므로 항상 가장자리에서 묶는다(clamp).
// · 마우스가 없는 환경을 위해 손잡이 버튼에서 방향키로도 옮길 수 있다.
const DRAG_KEEP_VISIBLE = 120;   // 화면 안에 반드시 남겨 둘 팝업 너비(px)
const DRAG_KEEP_HEADER = 56;     // 제목 줄이 화면 아래로 사라지지 않게

// 옮겨진 팝업이 몇 개인지. 하나라도 있으면 배경이 클릭을 통과시키므로,
// 그동안에는 뒤쪽에서 **지도만** 만질 수 있게 body 에 표시를 남긴다.
// (그러지 않으면 팝업을 열어 둔 채 [다음]·[+ 숙소] 가 눌려 화면이 바뀐다.)
let movedCount = 0;
function setMovedCount(delta) {
  movedCount = Math.max(0, movedCount + delta);
  document.body.classList.toggle("modal-moved", movedCount > 0);
}

function makeDraggable(panel, header, backdrop, handleBtn) {
  let dx = 0, dy = 0;                       // 원래 위치에서 옮긴 거리
  let dragging = false, sx = 0, sy = 0, bx = 0, by = 0;
  let counted = false;

  const apply = () => {
    const moved = dx !== 0 || dy !== 0;
    panel.style.transform = moved ? `translate(${dx}px, ${dy}px)` : "";
    backdrop.classList.toggle("is-moved", moved);
    if (moved !== counted) {
      counted = moved;
      setMovedCount(moved ? 1 : -1);
    }
  };

  /** 팝업이 화면 밖으로 나가지 않도록 이동량을 묶는다. */
  function clamp(nx, ny) {
    const r = panel.getBoundingClientRect();
    const left = r.left - dx;               // transform 을 뺀 원래(레이아웃) 위치
    const top = r.top - dy;
    const minX = DRAG_KEEP_VISIBLE - r.width - left;
    const maxX = window.innerWidth - DRAG_KEEP_VISIBLE - left;
    const minY = -top;
    const maxY = window.innerHeight - DRAG_KEEP_HEADER - top;
    return [
      Math.min(Math.max(nx, minX), maxX),
      Math.min(Math.max(ny, minY), maxY)
    ];
  }

  const move = (nx, ny) => { [dx, dy] = clamp(nx, ny); apply(); };
  const reset = () => { dx = 0; dy = 0; apply(); };

  // 이동·놓기는 window 에서 받는다. 제목 줄에만 걸어 두면 커서가 팝업 밖으로
  // 조금만 나가도 드래그가 끊긴다(setPointerCapture 는 실패할 수 있어 못 믿는다).
  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    // 닫기 버튼 등에서 시작한 눌림은 드래그로 삼키지 않는다(손잡이는 예외).
    const btn = e.target.closest && e.target.closest("button");
    if (btn && btn !== handleBtn) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY; bx = dx; by = dy;
    header.classList.add("is-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    move(bx + e.clientX - sx, by + e.clientY - sy);
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    header.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }

  const ARROWS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
  };
  function onHandleKey(e) {
    if (e.key === "Home") { e.preventDefault(); reset(); return; }
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? 48 : 16;
    move(dx + dir[0] * step, dy + dir[1] * step);
  }

  const onResize = () => { if (dx || dy) move(dx, dy); };

  header.addEventListener("pointerdown", onDown);
  header.addEventListener("dblclick", reset);   // 두 번 누르면 제자리로
  handleBtn.addEventListener("keydown", onHandleKey);
  window.addEventListener("resize", onResize);

  return () => {                                 // 팝업이 닫힐 때 정리
    onUp();
    if (counted) { counted = false; setMovedCount(-1); }
    window.removeEventListener("resize", onResize);
  };
}

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

  const backdrop = el("div", { class: "modal-backdrop", role: "presentation" });
  const panel = el("div", {
    class: "modal-panel", role: "dialog", "aria-modal": "true",
    "aria-label": opts.title || "입력"
  });

  const closeBtn = el("button", {
    class: "modal-x", type: "button", "aria-label": "닫기", text: "✕"
  });

  const dragBtn = el("button", {
    class: "modal-drag", type: "button",
    title: "제목 줄을 끌면 팝업을 옮길 수 있습니다 (두 번 누르면 제자리로)",
    "aria-label": "팝업 위치 옮기기. 방향키로 옮기고 Home 키로 제자리에 놓습니다."
  }, [
    el("span", { class: "modal-drag-grip", "aria-hidden": "true", text: "⠿" }),
    el("span", { class: "modal-drag-text", text: "끌어서 이동" })
  ]);

  const header = el("div", { class: "modal-header" }, [
    el("h2", { class: "modal-title", text: opts.title || "" }),
    dragBtn,
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
  const entry = { closeFromBack: () => destroy() };
  modalStack.push(entry);
  armHistory();

  const undrag = makeDraggable(panel, header, backdrop, dragBtn);

  function destroy() {
    if (closed) return;
    closed = true;
    undrag();
    document.removeEventListener("keydown", onKey);
    const at = modalStack.indexOf(entry);
    if (at >= 0) modalStack.splice(at, 1);
    backdrop.remove();
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.classList.remove("modal-open");
    if (!modalStack.length) disarmHistory();
    if (opts.onClose) opts.onClose();
  }

  function requestClose() {
    if (opts.isDirty && opts.isDirty()) {
      if (!confirm("저장하지 않고 닫을까요?")) return;
    }
    destroy();
  }

  // 적용은 dirty 확인 없이 바로 닫는다. onApply 가 false 를 돌려주면 열어 둔다.
  async function apply() {
    if (!opts.onApply) return destroy();
    const ok = await opts.onApply();
    if (ok !== false) destroy();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); requestClose(); }
  }

  closeBtn.addEventListener("click", requestClose);
  footerButtons[0].addEventListener("click", requestClose);
  if (footerButtons[1]) footerButtons[1].addEventListener("click", apply);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) requestClose();
  });
  document.addEventListener("keydown", onKey);

  // 손잡이 버튼은 건너뛴다 — 예전과 같은 자리(✕ 또는 첫 입력칸)에 초점이 가야 한다.
  const firstField = panel.querySelector("input, textarea, select, button:not(.modal-drag)");
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
