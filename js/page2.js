// =====================================================================
//  page2.js — 2페이지 : 지도 + 방문지 입력 (명세서 §5)
// =====================================================================

import { CONFIG } from "../config.js";
import {
  state, TYPES, TYPE_ORDER, placesOf, findPlace, removePlace, commit, isFull
} from "./storage.js";
import { iconSvg, safeIcon } from "./icons.js";
import * as MapView from "./map.js";
import { openPlacePopup, openTransportPopup } from "./popups.js";
import { confirmDialog } from "./modal.js";
import { $, el, toast, comma } from "./ui.js";

let bound = false;
let firstAttach = true;

/* --------------------------------------------------------------------
   진입
   -------------------------------------------------------------------- */
export async function enterPage2() {
  bindOnce();

  const slot = $("#mapSlot2");
  try {
    await MapView.attachTo(slot, state.trip.city);
    if (firstAttach && state.trip.city) {
      MapView.jumpToCity(state.trip.city);
      firstAttach = false;
    }
  } catch (e) {
    console.error("[page2] 지도 준비 실패", e);
    slot.innerHTML = "";
    slot.appendChild(el("p", {
      class: "empty-hint",
      text: e.message || "지도를 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요."
    }));
  }

  await refresh();
}

export function leavePage2() {
  MapView.closePopup();
}

/* --------------------------------------------------------------------
   이벤트 연결 (한 번만)
   -------------------------------------------------------------------- */
function bindOnce() {
  if (bound) return;
  bound = true;

  $("#addBar").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn || btn.disabled) return;

    const kind = btn.getAttribute("data-add");
    if (kind === "transport") {
      openTransportPopup(() => refresh());
      return;
    }
    // 버튼을 누를 때마다 항상 새 항목 팝업이 열립니다 (§5)
    openPlacePopup(kind, null, () => refresh());
  });

  // 지도 마커 팝업의 [수정]
  MapView.setEditHandler((id) => {
    const p = findPlace(id);
    if (!p) return;
    openPlacePopup(p.type, id, () => refresh());
  });

  // 범례 접기/펼치기
  const toggle = $("#legendToggle");
  const legend = $("#legend");
  toggle.addEventListener("click", () => {
    const open = legend.hidden;
    legend.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

/* --------------------------------------------------------------------
   화면 갱신
   -------------------------------------------------------------------- */
export async function refresh() {
  renderBadges();
  renderCards();

  if (MapView.mapExists()) {
    await MapView.setPlaces(state.places, { numbers: false });
    MapView.renderLegend(state.places, { numbers: false });
  }
}

function renderBadges() {
  const total = state.places.length;
  const full = isFull();

  TYPE_ORDER.forEach((t) => {
    const n = placesOf(t).length;
    const badge = $(`#badge-${t}`);
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    const btn = document.querySelector(`[data-add="${t}"]`);
    if (btn) btn.disabled = full;
  });

  $("#placeCount").textContent = String(total);
  $("#placeMax").textContent = String(CONFIG.MAX_PLACES);

  const note = $("#limitNote");
  note.classList.toggle("is-full", full);
  $("#limitWarn").textContent = full
    ? " — 상한에 도달해 더 추가할 수 없습니다. 필요하면 아래에서 삭제해 주세요."
    : "";

  $("#emptyHint").hidden = total > 0;
}

function renderCards() {
  const host = $("#cardList");
  host.innerHTML = "";

  TYPE_ORDER.forEach((type) => {
    const list = placesOf(type);
    if (list.length === 0) return;

    const meta = TYPES[type];
    const group = el("section", { class: "cardgroup", style: { "--gc": meta.color } });

    group.appendChild(el("div", { class: "cardgroup__head" }, [
      el("span", { class: "cardgroup__dot" }),
      el("span", { class: "cardgroup__icon", html: iconSvg(meta.defaultIcon, meta.color, 20) }),
      el("span", { class: "cardgroup__name", text: meta.label }),
      el("span", { class: "cardgroup__count", text: `${list.length}곳` })
    ]));

    list.forEach((p) => group.appendChild(renderCard(p)));
    host.appendChild(group);
  });
}

function renderCard(p) {
  const iconKey = safeIcon(p.type, p.icon);

  const subParts = [];
  if (p.searchedName && p.searchedName !== p.name) subParts.push(p.searchedName);
  if (p.source === "manual") subParts.push("지도에서 직접 지정");
  if (p.address) subParts.push(p.address);

  const body = el("div", { class: "card__body" }, [
    el("div", { class: "card__name", text: p.name }),
    subParts.length ? el("div", { class: "card__sub", text: subParts.join(" · ") }) : null,
    p.priceKRW > 0 ? el("div", { class: "card__price", text: `${comma(p.priceKRW)}원` }) : null
  ]);

  const edit = el("button", { class: "btn btn--sm", type: "button", text: "수정" });
  edit.addEventListener("click", () => openPlacePopup(p.type, p.id, () => refresh()));

  const del = el("button", { class: "btn btn--sm", type: "button", text: "삭제" });
  del.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "삭제할까요?",
      message: `"${p.name}" 을(를) 목록과 지도에서 지웁니다.`,
      okText: "삭제",
      danger: true
    });
    if (!ok) return;
    removePlace(p.id);
    commit("places", true);
    toast("삭제했습니다.");
    refresh();
  });

  const card = el("article", { class: "card", style: { "--pc": p.color } }, [
    el("div", { class: "card__icon", html: iconSvg(iconKey, "#fff", 21) }),
    body,
    el("div", { class: "card__acts" }, [edit, del])
  ]);

  // 카드를 누르면 지도에서 해당 위치로 이동
  card.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    MapView.flyTo(p.coord);
  });

  return card;
}
