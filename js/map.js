// map.js — 앱 전체에서 지도 인스턴스를 **하나만** 만들어 재사용한다.
// 페이지를 옮길 때는 지도를 파괴하지 않고 컨테이너 DOM 노드만 이동시킨다
// (map load 과금 단위 절감, §2).
//
// 마커는 mapboxgl.Marker(HTML) 가 아니라 symbol layer 로 그린다. 그래야
// PDF 캔버스 캡처에 마커와 경로가 함께 찍힌다(§5, §8-2).

import { CONFIG, hasToken } from "../config.js";
import { TYPES, colorOf, loadSvgAsImage, iconKeyOf } from "./icons.js";

const SRC_PLACES = "places";
const SRC_ROUTE = "route";
const SRC_PREVIEW = "preview";
const LAYER_PLACES = "places-layer";
const LAYER_ROUTE = "route-layer";
const LAYER_ROUTE_DASH = "route-dashed-layer";
const LAYER_PREVIEW = "preview-layer";

let map = null;
let ready = false;
const readyWaiters = [];
const registeredImages = new Set();

let onPlaceClick = null;      // (placeId) => void
let onLongPress = null;       // ([lon,lat]) => void
let longPressEnabled = false;

export function getMap() {
  return map;
}

export function isReady() {
  return ready;
}

/** 지도가 스타일 로딩까지 끝나기를 기다린다. */
export function whenReady() {
  if (ready) return Promise.resolve(map);
  return new Promise((resolve) => readyWaiters.push(resolve));
}

// mapbox-gl 은 1.8MB 라 1페이지에서는 내려받지 않는다. 수업 시작 직후 접속이
// 몰리는 상황을 고려한 것(§13) — 2페이지에 처음 들어올 때만 가져온다.
let glPromise = null;
function loadMapboxGl() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (glPromise) return glPromise;
  glPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/mapbox-gl.js";
    s.onload = () => (window.mapboxgl ? resolve(window.mapboxgl) : reject(new Error("mapbox-gl 로드 실패")));
    s.onerror = () => reject(new Error("vendor/mapbox-gl.js 를 찾지 못했습니다."));
    document.head.appendChild(s);
  });
  return glPromise;
}

/**
 * 최초 1회만 지도를 만든다. 2페이지 진입 시점에 호출한다(§13).
 * @param {HTMLElement} container 지도가 들어갈 요소
 * @param {object} city trip.city
 */
export async function ensureMap(container, city) {
  if (map) {
    attachTo(container);
    return map;
  }
  if (!hasToken()) return null;

  const mapboxgl = await loadMapboxGl();
  if (map) { attachTo(container); return map; }   // 동시 호출 방어

  mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;
  map = new mapboxgl.Map({
    container,
    style: CONFIG.MAP_STYLE,
    center: (city && city.center) || [127.0, 37.5],
    zoom: (city && city.zoom) || 11,
    language: "ko",
    preserveDrawingBuffer: true   // ★ PDF 캡처용. 생성 시점에만 지정 가능
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");

  map.on("style.load", () => {
    installSources();
    ready = true;
    readyWaiters.splice(0).forEach((fn) => fn(map));
  });

  installInteractions();
  return map;
}

function installSources() {
  const empty = { type: "FeatureCollection", features: [] };

  map.addSource(SRC_ROUTE, { type: "geojson", data: empty });
  map.addLayer({
    id: LAYER_ROUTE,
    type: "line",
    source: SRC_ROUTE,
    filter: ["!=", ["get", "dashed"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#111827", "line-width": 4, "line-opacity": 0.75 }
  });
  map.addLayer({
    id: LAYER_ROUTE_DASH,
    type: "line",
    source: SRC_ROUTE,
    filter: ["==", ["get", "dashed"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#6b7280", "line-width": 3,
      "line-opacity": 0.8, "line-dasharray": [2, 2]
    }
  });

  map.addSource(SRC_PREVIEW, { type: "geojson", data: empty });
  map.addLayer({
    id: LAYER_PREVIEW,
    type: "circle",
    source: SRC_PREVIEW,
    paint: {
      "circle-radius": 11,
      "circle-color": ["get", "color"],
      "circle-opacity": 0.45,
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addSource(SRC_PLACES, { type: "geojson", data: empty });
  map.addLayer({
    id: LAYER_PLACES,
    type: "symbol",
    source: SRC_PLACES,
    layout: {
      "icon-image": ["get", "iconKey"],
      "icon-size": 0.62,
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      // ⚠ 앱이 직접 그리는 라벨은 숫자만. 한글은 글리프 문제로 깨질 수 있다(§9-9).
      "text-field": ["get", "orderLabel"],
      "text-font": ["Open Sans Regular"],
      "text-size": 13,
      "text-offset": [0, 0.55],
      "text-anchor": "top",
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: {
      "text-color": "#111111",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.8
    }
  });
}

function installInteractions() {
  map.on("click", LAYER_PLACES, (e) => {
    const f = e.features && e.features[0];
    if (f && onPlaceClick) onPlaceClick(f.properties.id, e.lngLat);
  });
  map.on("mouseenter", LAYER_PLACES, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", LAYER_PLACES, () => { map.getCanvas().style.cursor = ""; });

  // 길게 누르기 → 좌표 직접 지정(§6-3). 마우스·터치 모두 지원.
  let pressTimer = null;
  let pressLngLat = null;
  let moved = false;

  const start = (e) => {
    if (!longPressEnabled) return;
    moved = false;
    pressLngLat = e.lngLat;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (!moved && pressLngLat && onLongPress) {
        onLongPress([pressLngLat.lng, pressLngLat.lat]);
      }
    }, 600);
  };
  const cancel = () => { clearTimeout(pressTimer); };

  map.on("mousedown", start);
  map.on("touchstart", start);
  map.on("mousemove", () => { moved = true; cancel(); });
  map.on("touchmove", () => { moved = true; cancel(); });
  map.on("mouseup", cancel);
  map.on("touchend", cancel);
  map.on("dragstart", () => { moved = true; cancel(); });
}

/** 컨테이너를 옮기고 크기를 다시 잰다. 지도를 새로 만들지 않는다. */
export function attachTo(container) {
  if (!map || !container) return;
  const canvasContainer = map.getContainer();

  // 옮길 목적지가 지도 노드 자신이거나 그 안쪽이면 appendChild 가
  // HierarchyRequestError 를 던진다. 페이지 전환이 겹칠 때 드물게 이 상태가 되는데,
  // 예외를 밖으로 내보내면 그 뒤의 화면 구성이 통째로 멈춘다.
  // 다음 전환에서 정상 위치로 돌아오므로 여기서는 이동만 건너뛴다.
  if (canvasContainer === container || canvasContainer.contains(container)) {
    console.warn("지도 컨테이너 이동을 건너뜁니다 — 목적지가 지도 안쪽입니다.");
    requestAnimationFrame(() => map.resize());
    return;
  }

  if (canvasContainer.parentElement !== container) {
    container.appendChild(canvasContainer);
  }
  requestAnimationFrame(() => map.resize());
}

export function setPlaceClickHandler(fn) { onPlaceClick = fn; }
export function setLongPressHandler(fn) { onLongPress = fn; }
export function setLongPressEnabled(on) { longPressEnabled = Boolean(on); }

// ── 아이콘 등록 ────────────────────────────────────────────────────────────

/** 장소들이 쓰는 아이콘 이미지를 필요한 것만 등록한다. */
export async function registerIcons(places) {
  if (!map) return;
  const jobs = [];
  places.forEach((p) => {
    const key = iconKeyOf(p);
    if (registeredImages.has(key) || map.hasImage(key)) return;
    registeredImages.add(key);
    const color = colorOf(p.type, p.shade || "base");
    jobs.push(
      loadSvgAsImage(p.icon, 60, 80, color)
        .then((img) => { if (!map.hasImage(key)) map.addImage(key, img); })
        .catch((err) => {
          registeredImages.delete(key);
          console.warn("아이콘 등록 실패", key, err);
        })
    );
  });
  await Promise.all(jobs);
}

// ── 데이터 갱신 (레이어 재생성 금지, setData 만 사용) ────────────────────────

export function placesToGeoJSON(places, showOrder) {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.coord },
      properties: {
        id: p.id,
        iconKey: iconKeyOf(p),
        orderLabel: showOrder ? String(p.order) : ""
      }
    }))
  };
}

export async function renderPlaces(places, showOrder) {
  if (!map || !ready) return;
  await registerIcons(places);
  const src = map.getSource(SRC_PLACES);
  if (src) src.setData(placesToGeoJSON(places, showOrder));
}

/**
 * 경로선 갱신.
 * @param {object|null} geometry GeoJSON LineString
 * @param {boolean} dashed 실패 시 직선 점선 여부
 */
export function renderRoute(geometry, dashed) {
  if (!map || !ready) return;
  const src = map.getSource(SRC_ROUTE);
  if (!src) return;
  if (!geometry) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  src.setData({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry, properties: { dashed: Boolean(dashed) } }]
  });
}

/** 팝업에서 위치를 고르는 동안 보여 주는 반투명 미리보기 마커. */
export function showPreview(coord, type) {
  if (!map || !ready) return;
  const src = map.getSource(SRC_PREVIEW);
  if (!src) return;
  if (!coord) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  src.setData({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: { color: colorOf(type, "base") }
    }]
  });
}

export function clearPreview() { showPreview(null, null); }

export function flyTo(coord, zoom) {
  if (!map) return;
  map.flyTo({ center: coord, zoom: zoom || Math.max(map.getZoom(), 14), speed: 1.1 });
}

/** 방문지 전체가 보이도록 맞춘다. PDF 캡처 직전에도 쓴다. */
export function fitToPlaces(places, padding = 60) {
  if (!map || !places.length) return;
  if (places.length === 1) {
    map.jumpTo({ center: places[0].coord, zoom: 14 });
    return;
  }
  const bounds = new mapboxgl.LngLatBounds(places[0].coord, places[0].coord);
  places.forEach((p) => bounds.extend(p.coord));
  map.fitBounds(bounds, { padding, duration: 0, maxZoom: 16 });
}

/** map.once("idle") 를 프라미스로. 타일이 다 그려질 때까지 기다린다(§8-2). */
export function waitForIdle(timeoutMs = 8000) {
  if (!map) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);
    map.once("idle", () => { clearTimeout(timer); finish(); });
  });
}

export function popupAt(lngLat, html) {
  if (!map) return null;
  return new mapboxgl.Popup({ closeButton: true, maxWidth: "260px" })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

/** 지도 크기를 PDF 비율(4:3)에 맞춰 임시로 바꾼 뒤 원복한다(§8-2 조건 4). */
export async function withCaptureSize(fn) {
  const container = map.getContainer();
  const prev = { width: container.style.width, height: container.style.height };
  const width = Math.min(1000, Math.max(640, container.clientWidth));
  container.style.width = `${width}px`;
  container.style.height = `${Math.round((width * 3) / 4)}px`;
  map.resize();
  try {
    return await fn();
  } finally {
    container.style.width = prev.width;
    container.style.height = prev.height;
    map.resize();
  }
}

export const LEGEND_TYPES = TYPES;
