// app.js — 페이지 라우팅과 1·2·3페이지 화면 구성.

import { CONFIG, hasToken, isLocalPreview, initConfig, RUNTIME } from "../config.js";
import { TYPES, TYPE_ORDER, colorOf, inlineSvg, iconLabel } from "./icons.js";
import * as Store from "./storage.js";
import * as MapView from "./map.js";
import * as Route from "./route.js";
import { geocodeCity, debounce, RateLimitError, MIN_QUERY_LENGTH } from "./search.js";
import { openPlacePopup, openTransportPopup } from "./placeform.js";
import { el, toast, formatKRW, escapeHtml, openModal } from "./ui.js";

let cities = [];
let currentPage = 1;
let mapHost = null;      // 지도 컨테이너 (앱 전체에서 하나)
let routeState = null;   // 마지막 경로 계산 결과

// ── 부팅 ───────────────────────────────────────────────────────────────────

export async function boot() {
  // 로컬 미리보기라면 config.local.js 의 토큰으로 갈아끼운다.
  // 지도·검색보다 먼저 끝나야 하므로 부팅 첫 줄에서 기다린다.
  await initConfig();

  document.title = CONFIG.APP_TITLE;

  const hadSaved = Store.hasSavedState();
  Store.load();
  if (hadSaved) {
    const state = Store.getState();
    const label = state.trip.title || "이전에 입력한 내용";
    if (!confirm(`이 기기에 저장된 「${label}」이(가) 있습니다.\n이어서 작업할까요?\n\n[취소]를 누르면 저장된 내용은 그대로 두고 처음 화면부터 다시 볼 수 있습니다.`)) {
      // 데이터를 지우지는 않는다 — 학생이 실수로 눌렀을 때 복구 가능해야 한다.
      toast("저장된 내용은 그대로 있습니다. 입력을 이어가면 덮어써집니다.");
    }
  }

  try {
    const res = await fetch("data/cities.json");
    cities = await res.json();
  } catch (err) {
    console.warn("도시 목록을 읽지 못했습니다.", err);
    cities = [];
  }

  mapHost = el("div", { id: "map", class: "map-host" });
  buildLegend();

  if (!hasToken()) showTokenBanner();
  else if (isLocalPreview() && !RUNTIME.localTokenApplied) showLocalPreviewBanner();

  wireChrome();
  renderPage1();
  renderPage2();
  renderPage3();
  goTo(1, true);
}

function wireChrome() {
  document.querySelectorAll("[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => goTo(Number(btn.dataset.step)));
  });
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => goTo(currentPage + Number(btn.dataset.nav)));
  });
  document.getElementById("btn-settings").addEventListener("click", openSettings);
}

function showTokenBanner() {
  const banner = el("div", { class: "token-banner" }, [
    el("strong", { text: "Mapbox 토큰이 아직 설정되지 않았습니다. " }),
    el("span", { text: "config.js 의 MAPBOX_TOKEN 한 줄을 교사 계정의 public 토큰으로 바꾸면 지도·검색·경로가 동작합니다. (README 2장 참고)" })
  ]);
  document.querySelector(".app-main").prepend(banner);
}

// 로컬에서 열었는데 로컬용 토큰 파일이 없을 때. 배포 주소에서는 뜨지 않는다.
function showLocalPreviewBanner() {
  const banner = el("div", { class: "token-banner" }, [
    el("strong", { text: "로컬 미리보기 — 지도가 표시되지 않습니다. " }),
    el("span", { text: "배포용 토큰은 배포 주소에서만 쓸 수 있게 잠겨 있습니다. 이 폴더에 config.local.js 를 만들고 제한 없는 테스트 토큰을 넣으면 지도가 뜹니다. (config.local.example.js 참고)" })
  ]);
  document.querySelector(".app-main").prepend(banner);
}

// ── 라우팅 ─────────────────────────────────────────────────────────────────

function page1Complete() {
  const t = Store.getState().trip;
  return Boolean(t.title && t.studentId && t.studentName && t.city);
}

export function goTo(page, silent) {
  const target = Math.min(3, Math.max(1, page));
  if (target > 1 && !page1Complete()) {
    if (!silent) toast("1페이지의 필수 항목을 먼저 입력해 주세요.");
    return;
  }
  currentPage = target;

  document.querySelectorAll(".page").forEach((sec) => {
    sec.classList.toggle("is-active", Number(sec.dataset.page) === target);
  });
  document.querySelectorAll("[data-step]").forEach((btn) => {
    const n = Number(btn.dataset.step);
    btn.classList.toggle("is-current", n === target);
    btn.setAttribute("aria-current", n === target ? "step" : "false");
  });
  updateNav();

  if (target === 2) enterPage2();
  if (target === 3) enterPage3();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── 1페이지 ────────────────────────────────────────────────────────────────

function renderPage1() {
  const trip = Store.getState().trip;
  const root = document.querySelector('[data-page="1"] .page-body');
  root.innerHTML = "";

  const mk = (label, key, opts = {}) => {
    const input = el("input", {
      class: "input", type: opts.type || "text", value: trip[key] || "",
      placeholder: opts.placeholder || "", maxlength: opts.max || null,
      inputmode: opts.inputmode || null
    });
    const error = el("p", { class: "field-error" });
    input.addEventListener("input", () => {
      trip[key] = opts.digits ? input.value.replace(/[^\d]/g, "") : input.value;
      if (opts.digits) input.value = trip[key];
      error.textContent = trip[key].trim() ? "" : `${label}을(를) 입력해 주세요.`;
      Store.saveDebounced();
      refreshPage1();
    });
    return el("div", { class: "field" }, [
      el("label", { class: "field-label", text: label + " *" }),
      input, error
    ]);
  };

  root.append(
    mk("여행 명칭", "title", { max: 40, placeholder: "예) 나의 오사카 미식 여행" }),
    mk("학번", "studentId", { max: 5, placeholder: "예) 10105", inputmode: "numeric", digits: true }),
    mk("이름", "studentName", { max: 20, placeholder: "예) 홍길동" }),
    buildCityPicker()
  );

  root.append(
    el("p", { class: "privacy-note", text: "입력한 내용은 사용 중인 기기에만 저장되며 서버로 전송되지 않습니다." })
  );

  refreshPage1();
}

function buildCityPicker() {
  const trip = Store.getState().trip;
  const wrap = el("div", { class: "field" });
  const chosen = el("div", { class: "chosen-city" });
  const filterInput = el("input", {
    class: "input", type: "search", placeholder: "도시 이름을 한글로 입력해 보세요 (예: 오사카)",
    autocomplete: "off"
  });
  const list = el("div", { class: "city-list", role: "listbox" });
  const searchStatus = el("p", { class: "search-status" });
  const searchBtn = el("button", {
    class: "link-btn", type: "button", text: "목록에 없나요? 직접 검색하기"
  });

  function paintChosen() {
    chosen.innerHTML = "";
    if (!trip.city) {
      chosen.append(el("p", { class: "field-error", text: "도시를 선택해 주세요." }));
      return;
    }
    chosen.append(
      el("span", { class: "chip", text: `${trip.city.nameKo} · ${trip.city.country}` }),
      el("button", {
        class: "link-btn", type: "button", text: "변경",
        onclick: () => { trip.city = null; Store.save(); paintChosen(); paintList(filterInput.value); refreshPage1(); }
      })
    );
  }

  function pick(city) {
    trip.city = {
      nameKo: city.nameKo, nameEn: city.nameEn, country: city.country,
      center: city.center, zoom: city.zoom || 11, bbox: city.bbox
    };
    Store.getState().transport.isInternational = city.country !== "대한민국";
    Store.save();
    paintChosen();
    paintList("");
    filterInput.value = "";
    refreshPage1();
    toast(`${city.nameKo}을(를) 선택했습니다.`);
  }

  function paintList(query) {
    list.innerHTML = "";
    if (trip.city) return;
    const q = (query || "").trim();
    const matched = q
      ? cities.filter((c) =>
          c.nameKo.includes(q) ||
          c.nameEn.toLowerCase().includes(q.toLowerCase()) ||
          c.country.includes(q))
      : cities;
    if (!matched.length) {
      list.append(el("p", { class: "search-status", text: "목록에 없습니다. 아래 [직접 검색하기]를 눌러 보세요." }));
      return;
    }
    matched.slice(0, 60).forEach((c) => {
      const btn = el("button", { class: "city-item", type: "button", role: "option" }, [
        el("span", { class: "city-name", text: c.nameKo }),
        el("span", { class: "city-country", text: c.country })
      ]);
      btn.addEventListener("click", () => pick(c));
      list.appendChild(btn);
    });
  }

  filterInput.addEventListener("input", () => paintList(filterInput.value));

  // 내장 목록에 없을 때만 네트워크를 쓴다(§4-1).
  const runSearch = debounce(async (q) => {
    searchStatus.textContent = "검색 중…";
    try {
      const results = await geocodeCity(q);
      list.innerHTML = "";
      if (!results.length) {
        searchStatus.textContent = "검색 결과가 없습니다. 철자를 바꿔 보세요.";
        return;
      }
      searchStatus.textContent = "";
      results.forEach((c) => {
        const btn = el("button", { class: "city-item", type: "button", role: "option" }, [
          el("span", { class: "city-name", text: c.nameKo }),
          el("span", { class: "city-country", text: c.country || c.placeName })
        ]);
        btn.addEventListener("click", () => pick(c));
        list.appendChild(btn);
      });
    } catch (err) {
      searchStatus.textContent = err instanceof RateLimitError
        ? "잠시 후 다시 검색해 주세요."
        : "검색에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    }
  });

  let searchMode = false;
  searchBtn.addEventListener("click", () => {
    searchMode = !searchMode;
    searchBtn.textContent = searchMode ? "내장 도시 목록으로 돌아가기" : "목록에 없나요? 직접 검색하기";
    filterInput.placeholder = searchMode
      ? "검색할 도시 이름 (두 글자 이상)"
      : "도시 이름을 한글로 입력해 보세요 (예: 오사카)";
    filterInput.value = "";
    searchStatus.textContent = "";
    paintList("");
    filterInput.focus();
  });

  filterInput.addEventListener("input", () => {
    if (!searchMode) return;
    const q = filterInput.value.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      searchStatus.textContent = q.length ? "두 글자 이상 입력해 주세요." : "";
      return;
    }
    runSearch(q);
  });

  wrap.append(
    el("label", { class: "field-label", text: "여행할 도시 *" }),
    chosen, filterInput, searchStatus, list, searchBtn
  );
  paintChosen();
  paintList("");
  return wrap;
}

/** 하단 이동 버튼 상태 — 1페이지 필수값이 비면 [다음]을 막는다(§4). */
function updateNav() {
  document.querySelector('[data-nav="-1"]').disabled = currentPage === 1;
  document.querySelector('[data-nav="1"]').disabled =
    currentPage === 3 || (currentPage === 1 && !page1Complete());
}

function refreshPage1() {
  updateNav();
}

// ── 2페이지 ────────────────────────────────────────────────────────────────

function renderPage2() {
  const root = document.querySelector('[data-page="2"] .page-body');
  root.innerHTML = "";

  const mapSlot = el("div", { class: "map-slot", id: "map-slot-2" });
  const toolbar = el("div", { class: "type-toolbar", id: "type-toolbar" });
  const cardList = el("div", { class: "card-list", id: "card-list" });

  root.append(
    mapSlot,
    el("p", { class: "map-hint", text: "지도를 길게 누르면 검색 없이 위치를 직접 지정할 수 있습니다. 한글 라벨이 없는 지역은 현지어로 표시되는 것이 정상입니다." }),
    toolbar,
    cardList
  );
}

async function enterPage2() {
  const state = Store.getState();
  const slot = document.getElementById("map-slot-2");
  slot.appendChild(mapHost);
  paintToolbar();
  paintCards();

  try {
    await MapView.ensureMap(mapHost, state.trip.city);
  } catch (err) {
    console.error(err);
    toast("지도를 불러오지 못했습니다. 네트워크를 확인해 주세요.");
    return;
  }
  MapView.attachTo(slot);
  MapView.setPlaceClickHandler(handleMarkerClick);
  await MapView.whenReady();
  await MapView.renderPlaces(state.places, false);
  MapView.renderRoute(null, false);
}

function paintToolbar() {
  const state = Store.getState();
  const bar = document.getElementById("type-toolbar");
  bar.innerHTML = "";

  const transportBtn = el("button", { class: "tool-btn tool-transport", type: "button" }, [
    el("span", { text: "이동방법" }),
    state.transport.localModes.length || state.transport.cautions || state.transport.flightCostKRW
      ? el("span", { class: "badge badge-check", text: "✓" })
      : null
  ]);
  transportBtn.addEventListener("click", () => openTransportPopup(() => { paintToolbar(); }));
  bar.appendChild(transportBtn);

  const full = state.places.length >= CONFIG.MAX_PLACES;
  TYPE_ORDER.forEach((type) => {
    const def = TYPES[type];
    const count = state.places.filter((p) => p.type === type).length;
    const btn = el("button", {
      class: "tool-btn", type: "button", disabled: full || null,
      style: `--type-color:${colorOf(type, "base")}`
    }, [
      el("span", { class: "tool-dot" }),
      el("span", { text: `+ ${def.label}` }),
      count ? el("span", { class: "badge", text: String(count) }) : null
    ]);
    btn.addEventListener("click", () => {
      openPlacePopup(type, null, afterPlacesChanged);
    });
    bar.appendChild(btn);
  });

  if (full) {
    bar.appendChild(el("p", {
      class: "field-hint",
      text: `방문지는 최대 ${CONFIG.MAX_PLACES}곳까지 등록할 수 있습니다. (경로 계산 API 의 경유지 제약)`
    }));
  }
}

async function paintCards() {
  const state = Store.getState();
  const host = document.getElementById("card-list");
  host.innerHTML = "";

  if (!state.places.length) {
    host.append(el("p", {
      class: "empty-note",
      text: "아직 등록한 방문지가 없습니다. 위 버튼으로 숙소·관광명소·맛집·엑티비티를 추가해 보세요."
    }));
    return;
  }

  for (const type of TYPE_ORDER) {
    const def = TYPES[type];
    const items = state.places.filter((p) => p.type === type);
    if (!items.length) continue;

    const group = el("section", { class: "card-group" });
    group.append(el("h3", { class: "card-group-title" }, [
      el("span", { class: "group-dot", style: `background:${colorOf(type, "base")}` }),
      el("span", { text: `${def.label} (${items.length})` })
    ]));

    for (const p of items) {
      const svg = await inlineSvg(p.icon, colorOf(p.type, p.shade || "base"));
      const card = el("article", { class: "place-card" }, [
        el("span", { class: "place-icon", html: svg }),
        el("div", { class: "place-main" }, [
          el("p", { class: "place-name", text: p.name }),
          el("p", { class: "place-sub", text: `${iconLabel(p.type, p.icon)} · ${formatKRW(p.priceKRW)}원` })
        ]),
        el("div", { class: "place-actions" }, [
          el("button", {
            class: "btn btn-ghost btn-sm", type: "button", text: "수정",
            onclick: () => openPlacePopup(p.type, p, afterPlacesChanged)
          }),
          el("button", {
            class: "btn btn-ghost btn-sm btn-danger", type: "button", text: "삭제",
            onclick: () => {
              if (!confirm(`「${p.name}」을(를) 삭제할까요?`)) return;
              Store.removePlace(p.id);
              afterPlacesChanged();
              toast("삭제했습니다.");
            }
          })
        ])
      ]);
      group.appendChild(card);
    }
    host.appendChild(group);
  }
}

function afterPlacesChanged() {
  const state = Store.getState();
  paintToolbar();
  paintCards();
  MapView.renderPlaces(state.places, currentPage === 3);
  if (state.places.length) {
    const last = state.places[state.places.length - 1];
    if (currentPage === 2) MapView.flyTo(last.coord);
  }
  if (currentPage === 3) {
    paintOrderList();
    recomputeRoute();
  }
}

async function handleMarkerClick(placeId, lngLat) {
  const place = Store.getState().places.find((p) => p.id === placeId);
  if (!place) return;
  const svg = await inlineSvg(place.icon, colorOf(place.type, place.shade || "base"));
  const html = `
    <div class="marker-popup">
      <div class="marker-popup-head">
        <span class="marker-popup-icon">${svg}</span>
        <div>
          <p class="marker-popup-name">${escapeHtml(place.name)}</p>
          <p class="marker-popup-meta">${escapeHtml(TYPES[place.type].label)} · ${formatKRW(place.priceKRW)}원</p>
        </div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-edit="${escapeHtml(place.id)}">수정</button>
    </div>`;
  const popup = MapView.popupAt(lngLat, html);
  setTimeout(() => {
    const btn = document.querySelector(`[data-edit="${CSS.escape(place.id)}"]`);
    if (btn) btn.addEventListener("click", () => {
      popup.remove();
      openPlacePopup(place.type, place, afterPlacesChanged);
    });
  }, 0);
}

// ── 범례 ───────────────────────────────────────────────────────────────────

function buildLegend() {
  const legend = el("div", { class: "legend", id: "legend" });
  const toggle = el("button", {
    class: "legend-toggle", type: "button", "aria-expanded": "true", text: "범례 ▾"
  });
  const body = el("div", { class: "legend-body" });
  TYPE_ORDER.forEach((type) => {
    body.append(el("div", { class: "legend-row" }, [
      el("span", { class: "legend-dot", style: `background:${colorOf(type, "base")}` }),
      el("span", { text: TYPES[type].label })
    ]));
  });
  toggle.addEventListener("click", () => {
    const open = legend.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", open ? "false" : "true");
    toggle.textContent = open ? "범례 ▸" : "범례 ▾";
  });
  legend.append(toggle, body);
  mapHost.appendChild(legend);
}

// ── 3페이지 ────────────────────────────────────────────────────────────────

function renderPage3() {
  const root = document.querySelector('[data-page="3"] .page-body');
  root.innerHTML = "";
  root.append(
    el("div", { class: "map-slot", id: "map-slot-3" }),
    el("p", { class: "map-hint", id: "transit-notice" }),
    el("div", { class: "summary", id: "summary" }),
    el("div", { class: "order-list", id: "order-list" }),
    el("div", { class: "apply-row" }, [
      el("button", {
        class: "btn btn-primary btn-lg", type: "button", id: "btn-apply",
        text: "적용 · PDF 저장"
      }),
      el("p", { class: "field-hint", text: "PDF 파일은 이 기기의 다운로드 폴더에 저장됩니다." })
    ])
  );
  document.getElementById("btn-apply").addEventListener("click", handleApply);
}

async function enterPage3() {
  const state = Store.getState();
  const slot = document.getElementById("map-slot-3");
  slot.appendChild(mapHost);
  paintOrderList();
  paintSummary();
  recomputeRoute(0);

  try {
    await MapView.ensureMap(mapHost, state.trip.city);
  } catch (err) {
    console.error(err);
    return;
  }
  MapView.attachTo(slot);
  MapView.setLongPressEnabled(false);
  await MapView.whenReady();
  await MapView.renderPlaces(state.places, true);
  MapView.fitToPlaces(state.places);
}

/** 경로 요약 문구. 경로 API 가 실패했을 때는 직선 근사임을 분명히 밝힌다. */
function describeRoute(r) {
  if (!r) return "계산 중…";
  if (r.fallback) return `${Route.formatDistance(r.distanceM)} (직선 기준 근사)`;
  return `${Route.formatDistance(r.distanceM)} / ${Route.formatDuration(r.durationS)}`;
}

function paintSummary() {
  const state = Store.getState();
  const host = document.getElementById("summary");
  const t = state.transport;
  const rows = [];

  if (t.isInternational) {
    rows.push(["왕복 항공료", `${formatKRW(t.flightCostKRW)}원`]);
  }
  rows.push(["총 이용 비용", `${formatKRW(Store.totalPlaceCost())}원 (항공료 제외)`]);
  rows.push(["총 이동 거리", describeRoute(routeState)]);

  host.innerHTML = "";
  rows.forEach(([label, value]) => {
    host.append(el("div", { class: "summary-row" }, [
      el("span", { class: "summary-label", text: label }),
      el("span", { class: "summary-value", text: value })
    ]));
  });

  const notice = document.getElementById("transit-notice");
  notice.textContent = Route.needsTransitNotice(t.localModes)
    ? `※ ${Route.TRANSIT_NOTICE} — Mapbox 경로 API 에는 대중교통 전용 경로가 없어 자동차 경로로 근사했습니다. 실제 지하철·버스 노선과 다릅니다.`
    : "";
  notice.classList.toggle("is-warn", Boolean(notice.textContent));
}

function paintOrderList() {
  const state = Store.getState();
  const host = document.getElementById("order-list");
  host.innerHTML = "";

  if (!state.places.length) {
    host.append(el("p", { class: "empty-note", text: "2페이지에서 방문지를 먼저 추가해 주세요." }));
    return;
  }

  state.places.forEach((p, index) => {
    const row = el("div", {
      class: "order-row", "data-id": p.id, draggable: "false"
    });

    const handle = el("button", {
      class: "drag-handle", type: "button", "aria-label": `${p.name} 순서 옮기기`, text: "☰"
    });

    const select = el("select", { class: "order-select", "aria-label": `${p.name} 방문 순서` });
    state.places.forEach((_, i) => {
      select.appendChild(el("option", { value: String(i + 1), text: `${i + 1}번째` }));
    });
    select.value = String(index + 1);
    select.addEventListener("change", () => moveTo(p.id, Number(select.value) - 1));

    row.append(
      handle,
      el("span", {
        class: "order-num",
        style: `background:${colorOf(p.type, p.shade || "base")}`,
        text: String(index + 1)
      }),
      el("div", { class: "order-main" }, [
        el("p", { class: "place-name", text: p.name }),
        el("p", { class: "place-sub", text: `${TYPES[p.type].label} · ${formatKRW(p.priceKRW)}원` })
      ]),
      el("div", { class: "order-actions" }, [
        el("button", {
          class: "btn btn-ghost btn-sm", type: "button", text: "▲", "aria-label": "위로",
          disabled: index === 0 || null,
          onclick: () => moveTo(p.id, index - 1)
        }),
        el("button", {
          class: "btn btn-ghost btn-sm", type: "button", text: "▼", "aria-label": "아래로",
          disabled: index === state.places.length - 1 || null,
          onclick: () => moveTo(p.id, index + 1)
        }),
        select
      ])
    );

    installDrag(row, handle, host);
    host.appendChild(row);
  });
}

function moveTo(id, targetIndex) {
  const state = Store.getState();
  const ids = state.places.map((p) => p.id);
  const from = ids.indexOf(id);
  if (from < 0) return;
  const clamped = Math.min(state.places.length - 1, Math.max(0, targetIndex));
  ids.splice(clamped, 0, ids.splice(from, 1)[0]);
  Store.reorderPlaces(ids);
  afterOrderChanged();
}

/** 포인터 기반 드래그 — 마우스와 터치를 함께 지원한다(§7). */
function installDrag(row, handle, host) {
  let dragging = false;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    row.classList.add("is-dragging");
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rows = Array.from(host.querySelectorAll(".order-row"));
    const target = rows.find((r) => {
      if (r === row) return false;
      const rect = r.getBoundingClientRect();
      return e.clientY >= rect.top && e.clientY <= rect.bottom;
    });
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    host.insertBefore(row, after ? target.nextSibling : target);
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    row.classList.remove("is-dragging");
    const ids = Array.from(host.querySelectorAll(".order-row")).map((r) => r.dataset.id);
    Store.reorderPlaces(ids);
    afterOrderChanged();
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

function afterOrderChanged() {
  const state = Store.getState();
  paintOrderList();
  paintSummary();
  MapView.renderPlaces(state.places, true);
  recomputeRoute();
}

function recomputeRoute(delay) {
  const state = Store.getState();
  if (state.places.length < 2) {
    routeState = { distanceM: 0, durationS: 0, geometry: null, fallback: false };
    state.route = null;
    Store.save();
    MapView.renderRoute(null, false);
    paintSummary();
    return;
  }
  Route.scheduleRoute(state.places, state.transport.localModes, (result) => {
    routeState = result;
    state.route = {
      profile: result.profile,
      distanceM: result.distanceM,
      durationS: result.durationS,
      fallback: result.fallback,
      geometry: result.geometry
    };
    Store.save();
    MapView.renderRoute(result.geometry, result.fallback);
    paintSummary();
    if (result.fallback) toast("경로를 불러오지 못해 직선으로 표시했습니다.");
  }, delay == null ? 800 : delay);
}

// ── 적용 · PDF ─────────────────────────────────────────────────────────────

async function handleApply() {
  const state = Store.getState();
  if (!state.places.length) {
    toast("방문지를 한 곳 이상 등록해 주세요.");
    return;
  }
  const btn = document.getElementById("btn-apply");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "PDF 만드는 중…";

  try {
    // jsPDF 와 한글 폰트는 이 시점에 처음 내려받는다(§12).
    const { generatePdf } = await import("./pdf.js");
    await generatePdf(state, routeState);
    toast("PDF를 저장했습니다. 수정하려면 이전 버튼으로 돌아갈 수 있습니다.", 4000);
  } catch (err) {
    console.error(err);
    alert("PDF를 만들지 못했습니다.\n" + (err && err.message ? err.message : ""));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── 설정 ───────────────────────────────────────────────────────────────────

function openSettings() {
  const body = el("div", { class: "place-form" }, [
    el("p", { class: "field-hint", text: "입력한 내용은 이 기기에만 저장됩니다. 공용 기기를 쓴다면 수업이 끝난 뒤 [입력 내용 전체 삭제]를 눌러 주세요." }),
    el("div", { class: "settings-row" }, [
      el("button", {
        class: "btn btn-ghost", type: "button", text: "계획 내보내기 (JSON)",
        onclick: () => {
          const blob = new Blob([Store.exportJSON()], { type: "application/json" });
          const a = el("a", {
            href: URL.createObjectURL(blob),
            download: `travel_internship_${Store.getState().trip.studentId || "plan"}.json`
          });
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast("계획 파일을 저장했습니다.");
        }
      }),
      el("label", { class: "btn btn-ghost file-btn" }, [
        el("span", { text: "계획 불러오기 (JSON)" }),
        el("input", {
          type: "file", accept: "application/json,.json", hidden: true,
          onchange: async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
              Store.importJSON(await file.text());
              toast("계획을 불러왔습니다.");
              location.reload();
            } catch (err) {
              alert("불러오지 못했습니다.\n" + err.message);
            }
          }
        })
      ])
    ]),
    el("hr", { class: "divider" }),
    el("button", {
      class: "btn btn-danger", type: "button", text: "입력 내용 전체 삭제",
      onclick: () => {
        if (!confirm("이 기기에 저장된 여행 계획을 모두 지웁니다.\n되돌릴 수 없습니다. 계속할까요?")) return;
        Store.clearAll();
        location.reload();
      }
    }),
    el("hr", { class: "divider" }),
    el("p", { class: "field-hint", text: "지도 데이터 © Mapbox © OpenStreetMap" })
  ]);

  openModal({ title: "설정", body, applyLabel: null, closeLabel: "닫기" });
}
