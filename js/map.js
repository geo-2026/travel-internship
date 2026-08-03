// =====================================================================
//  map.js — MapLibre GL JS + MapTiler 벡터 타일
//
//  ★ 이 앱에서 지도 인스턴스는 단 1개만 만들어 재사용합니다 (명세서 §2·§10-4).
//    페이지를 옮길 때 지도를 파괴하지 않고, DOM 위치만 옮긴 뒤 resize() 합니다.
//    → MapTiler 무료 플랜의 병목인 "세션 수"를 학생 1명당 1건으로 유지합니다.
//
//  · 마커·경로는 HTML 마커가 아니라 지도 레이어로 그립니다 (§5·§8-2).
//    그래야 PDF 캔버스 캡처에 함께 담깁니다.
//  · 방문 순서 번호는 마커 이미지 안에 직접 그립니다.
//    MapTiler 글리프(text-font) 이름이 어긋나 라벨이 통째로 사라지는 사고를
//    막기 위한 선택입니다 (§5 경고 · §9-9).
// =====================================================================

import { CONFIG, HAS_MAPTILER_KEY } from "../config.js";
import { TYPES, TYPE_ORDER } from "./storage.js";
import { safeIcon, markerImageId, pinImageData, PIN_W, PIN_H } from "./icons.js";

const SRC_PLACES = "places";
const SRC_ROUTE = "route";
const SRC_PREVIEW = "preview";

const LYR_ROUTE = "route-line";
const LYR_ROUTE_DASH = "route-line-dashed";
const LYR_PLACES = "places-layer";
const LYR_PREVIEW = "preview-layer";

let map = null;              // ★ 단 하나의 MapLibre 인스턴스
let creating = null;         // 생성 중 Promise
let styleReady = false;
let libLoaded = null;

const registeredImages = new Set();

let currentSlot = null;
let popup = null;

/* 지도에서 직접 위치 지정(픽 모드) 상태 */
let pickState = null;        // { resolve, coord }

/** 데모 모드: MapTiler 키가 없을 때 (지도 타일 없이 나머지 기능 확인) */
export const isDemo = !HAS_MAPTILER_KEY;

/* --------------------------------------------------------------------
   MapLibre 라이브러리 로드 (2페이지 진입 시점 — §13)
   -------------------------------------------------------------------- */
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (libLoaded) return libLoaded;

  libLoaded = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CONFIG.CDN.MAPLIBRE_JS;
    s.async = true;
    s.onload = () => (window.maplibregl ? resolve(window.maplibregl)
                                        : reject(new Error("MapLibre 로드 실패")));
    s.onerror = () => reject(new Error("지도 라이브러리를 불러오지 못했습니다. 네트워크를 확인해 주세요."));
    document.head.appendChild(s);
  });
  return libLoaded;
}

/* --------------------------------------------------------------------
   스타일
   -------------------------------------------------------------------- */
function maptilerStyleUrl() {
  return `https://api.maptiler.com/maps/${CONFIG.MAPTILER_STYLE}/style.json?key=${CONFIG.MAPTILER_KEY}`;
}

/** 키가 없을 때 쓰는 로컬 스타일 — 외부 요청 0회 */
function demoStyle() {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#e7ecf2" } }
    ]
  };
}

/* --------------------------------------------------------------------
   생성 — 앱 수명 동안 한 번만 실행됩니다
   -------------------------------------------------------------------- */
export function mapExists() {
  return !!map;
}

async function createMap(center, zoom) {
  if (map) return map;
  if (creating) return creating;

  creating = (async () => {
    const maplibregl = await loadMapLibre();

    // 세션 소비를 눈으로 확인할 수 있게 남기는 로그 (키 값은 출력하지 않습니다)
    console.info("[map] 지도 인스턴스 생성 — 앱 수명 동안 1회만 실행됩니다.");

    map = new maplibregl.Map({
      container: "map",
      style: isDemo ? demoStyle() : maptilerStyleUrl(),
      center: center || [126.978, 37.5665],
      zoom: zoom || 11,
      preserveDrawingBuffer: true,   // ★ PDF 지도 캡처용 — 나중에 켤 수 없습니다 (§8-2)
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0
    });

    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right"
    );

    await new Promise((resolve) => {
      if (map.isStyleLoaded()) return resolve();
      map.once("load", resolve);
    });

    initLayers();
    styleReady = true;
    bindMapEvents(maplibregl);
    return map;
  })();

  return creating;
}

/* --------------------------------------------------------------------
   소스 · 레이어 — 한 번만 만들고, 이후에는 setData 로만 갱신합니다 (§5)
   -------------------------------------------------------------------- */
function emptyFc() {
  return { type: "FeatureCollection", features: [] };
}

function initLayers() {
  map.addSource(SRC_ROUTE, { type: "geojson", data: emptyFc() });
  map.addSource(SRC_PLACES, { type: "geojson", data: emptyFc() });
  map.addSource(SRC_PREVIEW, { type: "geojson", data: emptyFc() });

  // 경로 — 실선 (ORS 결과)
  map.addLayer({
    id: LYR_ROUTE,
    type: "line",
    source: SRC_ROUTE,
    filter: ["!=", ["get", "dashed"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#1d4ed8",
      "line-width": 5,
      "line-opacity": 0.85
    }
  });

  // 경로 — 점선 (ORS 실패 시 직선 폴백)
  map.addLayer({
    id: LYR_ROUTE_DASH,
    type: "line",
    source: SRC_ROUTE,
    filter: ["==", ["get", "dashed"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#6b7280",
      "line-width": 4,
      "line-dasharray": [2, 2],
      "line-opacity": 0.9
    }
  });

  // 미리보기 마커 (검색 결과를 고르면 반투명으로 표시)
  map.addLayer({
    id: LYR_PREVIEW,
    type: "circle",
    source: SRC_PREVIEW,
    paint: {
      "circle-radius": 11,
      "circle-color": "#111827",
      "circle-opacity": 0.35,
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 0.9
    }
  });

  // 방문지 마커 — symbol 레이어 (PDF 캡처에 포함됨)
  map.addLayer({
    id: LYR_PLACES,
    type: "symbol",
    source: SRC_PLACES,
    layout: {
      "icon-image": ["get", "iconKey"],
      "icon-size": 0.72,
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "order"]
    }
  });
}

function bindMapEvents(maplibregl) {
  // 마커 탭 → 장소 정보 팝업
  map.on("click", LYR_PLACES, (e) => {
    if (pickState) return;
    const f = e.features && e.features[0];
    if (!f) return;
    showPlacePopup(maplibregl, f);
  });

  map.on("mouseenter", LYR_PLACES, () => {
    if (!pickState) map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", LYR_PLACES, () => {
    if (!pickState) map.getCanvas().style.cursor = "";
  });

  // 픽 모드 — 탭 또는 길게 누르기로 좌표 지정 (§6-2-4)
  map.on("click", (e) => {
    if (!pickState) return;
    setPickCoord([e.lngLat.lng, e.lngLat.lat]);
  });
  map.on("contextmenu", (e) => {
    if (!pickState) return;
    setPickCoord([e.lngLat.lng, e.lngLat.lat]);
  });
}

/* --------------------------------------------------------------------
   장소 팝업
   -------------------------------------------------------------------- */
let onEditRequest = null;
/** 마커 팝업의 [수정] 버튼이 눌렸을 때 호출할 함수를 등록 */
export function setEditHandler(fn) { onEditRequest = fn; }

function showPlacePopup(maplibregl, feature) {
  const p = feature.properties || {};
  const coord = feature.geometry.coordinates.slice();

  if (popup) popup.remove();

  const price = Number(p.priceKRW) > 0
    ? `<div class="mp-price">${Number(p.priceKRW).toLocaleString("ko-KR")}원</div>`
    : "";
  const searched = p.searchedName
    ? `<div class="mp-sub">${escapeHtml(p.searchedName)}</div>`
    : "";

  const html =
    `<div class="mp">` +
      `<div class="mp-head"><span class="mp-dot" style="background:${p.color}"></span>` +
      `<span class="mp-type">${escapeHtml(p.typeLabel)}</span></div>` +
      `<div class="mp-name">${escapeHtml(p.name)}</div>` +
      searched + price +
      `<button type="button" class="mp-edit" data-edit-id="${escapeHtml(p.id)}">수정</button>` +
    `</div>`;

  popup = new maplibregl.Popup({ offset: [0, -PIN_H * 0.72], closeButton: true, maxWidth: "260px" })
    .setLngLat(coord)
    .setHTML(html)
    .addTo(map);

  const el = popup.getElement();
  const btn = el && el.querySelector("[data-edit-id]");
  if (btn) {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit-id");
      popup.remove();
      if (onEditRequest) onEditRequest(id);
    });
  }
}

export function closePopup() {
  if (popup) { popup.remove(); popup = null; }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* --------------------------------------------------------------------
   슬롯 이동 — 지도를 파괴하지 않고 DOM 위치만 옮깁니다
   -------------------------------------------------------------------- */

/**
 * 지도를 지정한 슬롯 안으로 옮기고, 없으면 이때 처음 생성합니다.
 * @param {HTMLElement} slotEl  #mapSlot2 또는 #mapSlot3
 * @param {object|null} city    최초 생성 시의 중심/줌
 */
export async function attachTo(slotEl, city) {
  const host = document.getElementById("mapHost");
  if (!slotEl || !host) return null;

  host.hidden = false;
  if (currentSlot !== slotEl) {
    slotEl.appendChild(host);
    currentSlot = slotEl;
  }

  if (!map) {
    document.getElementById("mapOverlay").hidden = !isDemo;
    await createMap(city && city.center, city && city.zoom);
  }

  // 컨테이너 크기가 바뀌었을 수 있으므로 항상 알려 줍니다
  requestAnimationFrame(() => map && map.resize());
  return map;
}

/** 지도를 화면에서 숨깁니다 (파괴하지 않습니다) */
export function detach() {
  const host = document.getElementById("mapHost");
  if (!host) return;
  closePopup();
  if (host.parentElement && host.parentElement.classList.contains("map-slot")) {
    document.body.appendChild(host);
  }
  host.hidden = true;
  currentSlot = null;
}

/* --------------------------------------------------------------------
   마커 이미지 등록
   -------------------------------------------------------------------- */
async function ensureImage(iconKey, color, num) {
  const id = markerImageId(iconKey, color, num);
  if (registeredImages.has(id)) return id;
  if (map.hasImage(id)) { registeredImages.add(id); return id; }

  const data = await pinImageData(color, iconKey, num, 2);
  if (!map.hasImage(id)) {
    map.addImage(id, data, { pixelRatio: 2 });
  }
  registeredImages.add(id);
  return id;
}

/* --------------------------------------------------------------------
   방문지 표시
   -------------------------------------------------------------------- */

/**
 * 방문지 마커를 갱신합니다. 레이어는 다시 만들지 않고 setData 만 호출합니다(§5).
 * @param {Array} places
 * @param {{ numbers?: boolean }} opts  numbers=true 면 마커에 방문 순서 번호를 그립니다
 */
export async function setPlaces(places, { numbers = false } = {}) {
  if (!map || !styleReady) return;

  const list = [...places].sort((a, b) => (a.order || 0) - (b.order || 0));

  const features = [];
  for (const p of list) {
    const iconKey = safeIcon(p.type, p.icon);
    const num = numbers ? (p.order || 0) : 0;
    let imageId;
    try {
      imageId = await ensureImage(iconKey, p.color, num);
    } catch (e) {
      console.warn("[map] 마커 이미지 생성 실패", e);
      continue;
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.coord },
      properties: {
        id: p.id,
        iconKey: imageId,
        name: p.name,
        searchedName: p.searchedName || "",
        typeLabel: (TYPES[p.type] || {}).label || "",
        color: p.color,
        priceKRW: p.priceKRW || 0,
        order: p.order || 0
      }
    });
  }

  const src = map.getSource(SRC_PLACES);
  if (src) src.setData({ type: "FeatureCollection", features });
}

/** 검색 결과 미리보기 마커 (반투명) */
export function setPreview(coord) {
  if (!map || !styleReady) return;
  const src = map.getSource(SRC_PREVIEW);
  if (!src) return;
  src.setData(
    coord
      ? { type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "Point", coordinates: coord }, properties: {} }] }
      : emptyFc()
  );
}

/* --------------------------------------------------------------------
   경로 표시
   -------------------------------------------------------------------- */

/**
 * @param {object|null} geometry  LineString GeoJSON
 * @param {{ dashed?: boolean }} opts  dashed=true → 점선(직선 폴백)
 */
export function setRoute(geometry, { dashed = false } = {}) {
  if (!map || !styleReady) return;
  const src = map.getSource(SRC_ROUTE);
  if (!src) return;

  if (!geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    src.setData(emptyFc());
    return;
  }
  src.setData({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry, properties: { dashed } }]
  });
}

/* --------------------------------------------------------------------
   카메라
   -------------------------------------------------------------------- */
export function flyTo(coord, zoom) {
  if (!map) return;
  map.flyTo({ center: coord, zoom: zoom || Math.max(map.getZoom(), 14), speed: 1.2 });
}

export function jumpToCity(city) {
  if (!map || !city) return;
  map.jumpTo({ center: city.center, zoom: city.zoom || 11 });
}

/** 모든 방문지가 보이도록 맞춥니다 */
export function fitAll(places, { padding = 60, animate = true } = {}) {
  if (!map || !places || places.length === 0) return false;

  if (places.length === 1) {
    map[animate ? "easeTo" : "jumpTo"]({ center: places[0].coord, zoom: 14 });
    return true;
  }

  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const p of places) {
    minX = Math.min(minX, p.coord[0]); maxX = Math.max(maxX, p.coord[0]);
    minY = Math.min(minY, p.coord[1]); maxY = Math.max(maxY, p.coord[1]);
  }
  map.fitBounds([[minX, minY], [maxX, maxY]], {
    padding: { top: padding + 30, bottom: padding, left: padding, right: padding },
    animate,
    maxZoom: 16
  });
  return true;
}

/* --------------------------------------------------------------------
   지도에서 직접 위치 지정 (§6-2-4)
   -------------------------------------------------------------------- */
function setPickCoord(coord) {
  if (!pickState) return;
  pickState.coord = coord;
  setPreview(coord);
  const btn = document.getElementById("btnPickConfirm");
  if (btn) btn.disabled = false;
}

/**
 * 픽 모드를 시작합니다.
 * @returns {Promise<[number,number]|null>} 확정한 좌표, 취소하면 null
 */
export function startPick() {
  const host = document.getElementById("mapHost");
  const bar = document.getElementById("mapPickBar");
  const confirm = document.getElementById("btnPickConfirm");
  const cancel = document.getElementById("btnPickCancel");
  if (!host || !bar) return Promise.resolve(null);

  closePopup();
  host.classList.add("is-picking");
  bar.hidden = false;
  confirm.disabled = true;

  return new Promise((resolve) => {
    const finish = (coord) => {
      host.classList.remove("is-picking");
      bar.hidden = true;
      confirm.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onNo);
      pickState = null;
      if (!coord) setPreview(null);
      resolve(coord);
    };
    const onOk = () => finish(pickState && pickState.coord);
    const onNo = () => finish(null);

    confirm.addEventListener("click", onOk);
    cancel.addEventListener("click", onNo);
    pickState = { coord: null, cancel: onNo };
  });
}

export function cancelPick() {
  if (pickState && pickState.cancel) pickState.cancel();
}

/* --------------------------------------------------------------------
   범례 (§5) — 색상만으로 구분하지 않도록 아이콘·번호를 함께 표시
   -------------------------------------------------------------------- */
export function renderLegend(places, { numbers = false } = {}) {
  const box = document.getElementById("legend");
  if (!box) return;

  if (!places || places.length === 0) {
    box.innerHTML = `<div class="legend__empty">표시된 방문지가 없습니다</div>`;
    return;
  }

  if (numbers) {
    const rows = [...places]
      .sort((a, b) => a.order - b.order)
      .map((p) =>
        `<div class="legend__row">` +
          `<span class="legend__num">${p.order}</span>` +
          `<span class="legend__dot" style="background:${p.color}"></span>` +
          `<span class="legend__name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>` +
        `</div>`
      ).join("");
    box.innerHTML = rows;
    return;
  }

  const rows = TYPE_ORDER.map((t) => {
    const n = places.filter((p) => p.type === t).length;
    if (!n) return "";
    return `<div class="legend__row">` +
             `<span class="legend__dot" style="background:${TYPES[t].color}"></span>` +
             `<span class="legend__name">${TYPES[t].label}</span>` +
             `<span class="legend__num">${n}</span>` +
           `</div>`;
  }).join("");
  box.innerHTML = rows || `<div class="legend__empty">표시된 방문지가 없습니다</div>`;
}

/* --------------------------------------------------------------------
   PDF 용 캔버스 캡처 (§8-2)
   -------------------------------------------------------------------- */

/**
 * 지도 화면을 PNG dataURL 로 캡처합니다.
 * 필수 조건 4가지를 모두 지킵니다.
 *   1. preserveDrawingBuffer: true  (생성 시점에 지정 — createMap 참고)
 *   2. 마커·경로가 지도 레이어로 그려져 있음
 *   3. fitBounds → "idle" 이벤트로 타일 로딩 완료까지 대기
 *   4. 캡처 직전 컨테이너를 PDF 비율(4:3)로 맞춤
 *
 * @returns {Promise<string|null>} dataURL, 실패하면 null
 */
export async function captureForPdf(places, { timeoutMs = 12000 } = {}) {
  if (!map) return null;

  const host = document.getElementById("mapHost");
  const parent = host.parentElement;
  const next = host.nextSibling;

  closePopup();

  try {
    // 4) 화면 비율을 4:3 으로 (1000×750)
    document.body.appendChild(host);
    host.classList.add("is-capturing");
    map.resize();

    // 3) 전체 방문지가 보이도록 맞춘 뒤 타일 로딩 완료 대기
    if (places && places.length) {
      fitAll(places, { padding: 60, animate: false });
    }
    await waitIdle(timeoutMs);

    // 한 프레임 더 그린 뒤 버퍼를 읽습니다
    map.triggerRepaint();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    return map.getCanvas().toDataURL("image/png");
  } catch (e) {
    console.warn("[map] 캔버스 캡처 실패", e);
    return null;
  } finally {
    host.classList.remove("is-capturing");
    if (parent) parent.insertBefore(host, next);
    map.resize();
  }
}

function waitIdle(timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
    const t = setTimeout(finish, timeoutMs);
    if (map.loaded() && map.areTilesLoaded()) {
      // 이미 준비됐어도 한 번 더 idle 을 기다립니다
      map.once("idle", finish);
      map.triggerRepaint();
    } else {
      map.once("idle", finish);
    }
  });
}

/**
 * §8-3 폴백 — 캔버스 캡처가 실패한 경우에만 MapTiler Static Maps 를 호출합니다.
 * 호출 1건이 MapTiler 요청 한도를 소모하므로 폴백 경로에서만 사용합니다.
 * @returns {Promise<string|null>} dataURL
 */
export async function staticMapFallback(places) {
  if (!HAS_MAPTILER_KEY || !places || !places.length) return null;

  try {
    const markers = places
      .slice(0, 20)
      .map((p) => `${p.coord[0]},${p.coord[1]}`)
      .join("|");

    const url =
      `https://api.maptiler.com/maps/${CONFIG.MAPTILER_STYLE}/static/auto/1000x750@2x.png` +
      `?key=${CONFIG.MAPTILER_KEY}&padding=0.15&markers=${encodeURIComponent(markers)}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("[map] 정적 지도 폴백 실패", e);
    return null;
  }
}

/** 지도 위 저작권 표기가 남아 있는지 확인 (제거 금지 — §5) */
export function getMap() { return map; }
