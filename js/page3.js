// =====================================================================
//  page3.js — 3페이지 : 방문 순서 · 총비용 · 경로 · PDF (명세서 §7)
// =====================================================================

import {
  state, TYPES, orderedPlaces, totalCost, commit, findPlace
} from "./storage.js";
import { iconSvg, safeIcon } from "./icons.js";
import * as MapView from "./map.js";
import {
  computeRouteDebounced, computeRoute, flushRoute,
  formatDistance, formatDuration, isApprox, APPROX_NOTE
} from "./route.js";
import { openPlacePopup } from "./popups.js";
import { alertDialog } from "./modal.js";
import { $, el, toast, won, withBusy } from "./ui.js";

let bound = false;
let routing = false;

/* --------------------------------------------------------------------
   진입
   -------------------------------------------------------------------- */
export async function enterPage3() {
  bindOnce();

  const slot = $("#mapSlot3");
  try {
    await MapView.attachTo(slot, state.trip.city);
  } catch (e) {
    console.error("[page3] 지도 준비 실패", e);
  }

  renderSummary();
  renderOrderList();

  if (MapView.mapExists()) {
    await MapView.setPlaces(state.places, { numbers: true });
    MapView.renderLegend(state.places, { numbers: true });
    MapView.fitAll(state.places, { padding: 50 });
    drawSavedRoute();
  }

  // 이미 계산된 경로가 없으면 한 번 구합니다
  if (state.places.length >= 2 && !state.route) {
    requestRoute();
  }

  // 3페이지에서만 쓰는 무거운 라이브러리·한글 폰트를 미리 받아 둡니다 (§12)
  import("./pdf.js")
    .then((m) => m.preload())
    .catch(() => { /* 실제 저장 시 다시 시도합니다 */ });
}

export function leavePage3() {
  MapView.closePopup();
}

function bindOnce() {
  if (bound) return;
  bound = true;

  $("#btnApplyPdf").addEventListener("click", onApplyPdf);

  MapView.setEditHandler((id) => {
    const p = findPlace(id);
    if (!p) return;
    openPlacePopup(p.type, id, () => {
      renderSummary();
      renderOrderList();
      refreshMap();
      requestRoute();
    });
  });
}

/* --------------------------------------------------------------------
   요약
   -------------------------------------------------------------------- */
function renderSummary() {
  const intl = state.transport.isInternational;
  $("#rowFlight").hidden = !intl;
  $("#sumFlight").textContent = won(state.transport.flightCostKRW);
  $("#sumTotal").textContent = won(totalCost());

  const r = state.route;
  $("#sumRoute").textContent = r
    ? `${formatDistance(r.distanceM)} / ${formatDuration(r.durationS)}`
    : (state.places.length >= 2 ? "계산 중…" : "-");

  renderRouteNote();
}

function renderRouteNote() {
  const note = $("#routeNote");
  const msgs = [];

  if (isApprox(state.transport.localModes)) msgs.push(`⚠ ${APPROX_NOTE} — 실제 지하철·버스 노선과 다릅니다.`);
  if (state.route && state.route.straight) msgs.push("경로를 불러오지 못해 직선(점선)으로 표시했습니다.");

  if (msgs.length === 0) { note.hidden = true; return; }
  note.hidden = false;
  note.innerHTML = msgs.map((m) => `<div>${m}</div>`).join("");
}

/* --------------------------------------------------------------------
   경로
   -------------------------------------------------------------------- */
function drawSavedRoute() {
  const r = state.route;
  if (!r || !r.geometry) { MapView.setRoute(null); return; }
  MapView.setRoute(r.geometry, { dashed: !!r.straight });
}

/** 순서 변경이 멈춘 뒤 800ms 후 1회만 호출됩니다 (§7) */
function requestRoute() {
  const list = orderedPlaces();
  if (list.length < 2) {
    state.route = null;
    commit("route");
    MapView.setRoute(null);
    renderSummary();
    return;
  }

  routing = true;
  $("#sumRoute").textContent = "계산 중…";

  computeRouteDebounced(list, state.transport.localModes, ({ route, error }) => {
    routing = false;
    state.route = route;
    commit("route");
    drawSavedRoute();
    renderSummary();
    if (error) toast(error, "err", 3400);
  });
}

/* --------------------------------------------------------------------
   순서 목록
   -------------------------------------------------------------------- */
function renderOrderList() {
  const host = $("#orderList");
  const list = orderedPlaces();

  host.innerHTML = "";
  $("#orderEmptyHint").hidden = list.length > 0;
  $("#btnApplyPdf").disabled = list.length === 0;

  list.forEach((p, idx) => host.appendChild(renderOrderItem(p, idx, list.length)));
}

function renderOrderItem(p, idx, total) {
  const meta = TYPES[p.type] || {};
  const iconKey = safeIcon(p.type, p.icon);

  const grip = el("button", {
    class: "order__grip", type: "button",
    "aria-label": `${p.name} 순서 옮기기 (끌어서 이동)`,
    html: "⠿"
  });

  const up = el("button", { type: "button", "aria-label": "위로", text: "▲" });
  const down = el("button", { type: "button", "aria-label": "아래로", text: "▼" });
  up.disabled = idx === 0;
  down.disabled = idx === total - 1;
  up.addEventListener("click", () => moveTo(idx, idx - 1));
  down.addEventListener("click", () => moveTo(idx, idx + 1));

  const sel = el("select", { class: "order__select", "aria-label": `${p.name} 방문 순서` });
  for (let i = 1; i <= total; i++) {
    sel.appendChild(el("option", { value: String(i), text: `${i}번째` }));
  }
  sel.value = String(idx + 1);
  sel.addEventListener("change", () => moveTo(idx, Number(sel.value) - 1));

  const item = el("li", {
    class: "order__item",
    style: { "--pc": p.color },
    "data-id": p.id
  }, [
    grip,
    el("span", { class: "order__num", text: String(idx + 1) }),
    el("span", { class: "order__icon", html: iconSvg(iconKey, "#fff", 18) }),
    el("span", { class: "order__name" }, [
      p.name,
      el("span", { class: "order__type", text: ` · ${meta.label || ""}` })
    ]),
    el("span", { class: "order__moves" }, [up, down]),
    sel
  ]);

  attachDrag(item, grip);
  return item;
}

/** from → to 로 옮기고 화면·지도·경로를 갱신합니다 */
function moveTo(from, to) {
  const list = orderedPlaces();
  if (to < 0 || to >= list.length || to === from) return;

  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  list.forEach((p, i) => { p.order = i + 1; });

  commit("order");
  renderOrderList();
  refreshMap();
  requestRoute();
}

async function refreshMap() {
  if (!MapView.mapExists()) return;
  await MapView.setPlaces(state.places, { numbers: true });
  MapView.renderLegend(state.places, { numbers: true });
}

/* --------------------------------------------------------------------
   드래그 앤 드롭 (포인터 이벤트 — 마우스·터치 모두 지원)
   -------------------------------------------------------------------- */
function attachDrag(item, handle) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const host = item.parentElement;
    if (!host) return;

    handle.setPointerCapture(e.pointerId);
    item.classList.add("is-dragging");

    const startY = e.clientY;
    let moved = false;

    const onMove = (ev) => {
      if (!moved && Math.abs(ev.clientY - startY) < 6) return;
      moved = true;

      const siblings = Array.from(host.children).filter((c) => c !== item);
      let placed = false;
      for (const sib of siblings) {
        const r = sib.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) {
          host.insertBefore(item, sib);
          placed = true;
          break;
        }
      }
      if (!placed) host.appendChild(item);
    };

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      item.classList.remove("is-dragging");
      if (!moved) return;

      // 화면에 놓인 순서를 그대로 데이터에 반영합니다
      const ids = Array.from(host.children).map((c) => c.getAttribute("data-id"));
      ids.forEach((id, i) => {
        const p = findPlace(id);
        if (p) p.order = i + 1;
      });

      commit("order");
      renderOrderList();
      refreshMap();
      requestRoute();
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
}

/* --------------------------------------------------------------------
   [적용 · PDF 저장] (§7)
   -------------------------------------------------------------------- */
async function onApplyPdf() {
  // 1) 검증
  if (state.places.length === 0) {
    await alertDialog({
      title: "방문지가 없습니다",
      message: "2단계로 돌아가 방문할 장소를 먼저 추가해 주세요."
    });
    return;
  }
  if (!state.trip.studentId || !state.trip.studentName || !state.trip.title) {
    await alertDialog({
      title: "여행 정보가 비어 있습니다",
      message: "1단계에서 여행 명칭·학번·이름을 먼저 입력해 주세요."
    });
    return;
  }

  await withBusy("PDF를 만드는 중입니다…", async () => {
    // 대기 중인 경로 계산이 있으면 지금 끝냅니다
    flushRoute();
    if (state.places.length >= 2 && (routing || !state.route)) {
      const { route } = await computeRoute(orderedPlaces(), state.transport.localModes);
      state.route = route;
      commit("route", true);
      drawSavedRoute();
      renderSummary();
    }

    try {
      const pdf = await import("./pdf.js");
      await pdf.buildAndSave();
      toast("PDF를 저장했습니다. 수정하려면 이전 버튼으로 돌아갈 수 있습니다.", "ok", 4200);
    } catch (e) {
      console.error("[page3] PDF 생성 실패", e);
      await alertDialog({
        title: "PDF를 만들지 못했습니다",
        message: (e && e.message ? e.message + "\n\n" : "") +
                 "잠시 후 다시 시도하거나, 설정에서 [계획 내보내기]로 내용을 백업해 주세요."
      });
    }
  });
}
