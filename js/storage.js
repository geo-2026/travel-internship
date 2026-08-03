// =====================================================================
//  storage.js — localStorage 단일 키 저장소
//  명세서 §3 데이터 모델 / §11 개인정보
//
//  · 저장 위치는 사용자의 기기(localStorage)뿐입니다. 서버 전송 없음.
//  · JSON.stringify / JSON.parse 만 사용합니다 (escape/unescape 금지 — §9-7).
// =====================================================================

import { CONFIG } from "../config.js";

export const STORAGE_KEY = "travelInternship.v1";
export const SCHEMA_VERSION = 1;

/* --------------------------------------------------------------------
   유형 정의 — 색상은 유형별 고정(§3-1), 아이콘은 학생이 선택
   -------------------------------------------------------------------- */
export const TYPES = {
  stay: {
    key: "stay",
    label: "숙소",
    color: "#2563eb",
    colors: { light: "#60a5fa", base: "#2563eb", dark: "#1e3a8a" },
    defaultIcon: "lodging",
    icons: ["lodging", "house", "camping", "suitcase", "star"]
  },
  sight: {
    key: "sight",
    label: "관광 명소",
    color: "#16a34a",
    colors: { light: "#4ade80", base: "#16a34a", dark: "#14532d" },
    defaultIcon: "monument",
    icons: ["castle", "museum", "artgallery", "park", "temple", "church",
            "mountain", "sea", "viewpoint", "zoo", "aquarium", "monument"]
  },
  food: {
    key: "food",
    label: "현지 맛집",
    color: "#ea580c",
    colors: { light: "#fb923c", base: "#ea580c", dark: "#7c2d12" },
    defaultIcon: "restaurant",
    icons: ["restaurant", "noodle", "pizza", "seafood", "fastfood",
            "cafe", "bakery", "icecream", "bar"]
  },
  activity: {
    key: "activity",
    label: "엑티비티",
    color: "#7c3aed",
    colors: { light: "#a78bfa", base: "#7c3aed", dark: "#4c1d95" },
    defaultIcon: "themepark",
    icons: ["themepark", "swim", "bicycle", "ski", "golf", "theater",
            "cinema", "shopping", "sports", "picnic", "playground", "cruise"]
  }
};

export const TYPE_ORDER = ["stay", "sight", "food", "activity"];

/** 색상 단계(light/base/dark) → 실제 색상값 */
export function colorOf(type, tone = "base") {
  const t = TYPES[type];
  if (!t) return "#6b7280";
  return t.colors[tone] || t.color;
}

/* --------------------------------------------------------------------
   기본 상태
   -------------------------------------------------------------------- */
export function emptyState() {
  return {
    meta: { version: SCHEMA_VERSION, updatedAt: nowIso() },
    trip: {
      title: "",
      studentId: "",
      studentName: "",
      city: null // { nameKo, nameEn, country, center:[lon,lat], zoom, bbox }
    },
    transport: {
      isInternational: true,
      flightCostKRW: 0,
      localModes: [],   // "public" | "walk"
      cautions: ""
    },
    places: [],
    route: null,        // { profile, distanceM, durationS, geometry, approx, straight }
    ui: { lastPage: 1, introSeen: false }
  };
}

function nowIso() {
  // 로컬 시간대 오프셋을 유지한 ISO 문자열 (예: 2026-08-02T09:00:00+09:00)
  const d = new Date();
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
         `${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/* --------------------------------------------------------------------
   앱 전역 상태
   -------------------------------------------------------------------- */
export const state = emptyState();

const listeners = new Set();

/** 상태 변경 구독 (reason: 무엇이 바뀌었는지 알리는 문자열) */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let saveTimer = null;

/**
 * 상태 변경을 알리고 저장을 예약합니다.
 * @param {string} reason  "places" | "trip" | "transport" | "route" | "order" | ...
 * @param {boolean} immediate 디바운스 없이 즉시 저장
 */
export function commit(reason = "", immediate = false) {
  state.meta.updatedAt = nowIso();
  listeners.forEach((fn) => {
    try { fn(reason); } catch (e) { console.error("[state]", e); }
  });

  if (saveTimer) clearTimeout(saveTimer);
  if (immediate) {
    save();
  } else {
    saveTimer = setTimeout(save, CONFIG.SAVE_DEBOUNCE_MS);
  }
}

/* --------------------------------------------------------------------
   저장 / 불러오기
   -------------------------------------------------------------------- */
/**
 * 저장 잠금.
 * 앱이 시작해서 "이어서 할까요?" 에 학생이 답하기 전까지는 저장하지 않습니다.
 * (답하기 전에 탭을 닫으면 빈 상태가 기존 계획을 덮어쓰던 문제를 막습니다)
 */
let armed = true;
export function setSaveArmed(v) { armed = !!v; }

export function save() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!armed) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error("[storage] 저장 실패", e);
    return false;
  }
}

/** 저장된 내용이 있으면 읽어서 반환(상태에 반영하지는 않음) */
export function peekSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return sanitize(obj);
  } catch (e) {
    console.warn("[storage] 저장된 내용을 읽지 못했습니다", e);
    return null;
  }
}

/** 저장된 내용을 현재 상태에 적용 */
export function applySaved(obj) {
  const clean = sanitize(obj);
  if (!clean) return false;
  Object.assign(state, clean);
  return true;
}

export function clearAll() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* 무시 */ }
  Object.assign(state, emptyState());
}

/* --------------------------------------------------------------------
   검증 · 정규화 — 손상된 저장본이 앱을 멈추지 않게 합니다
   -------------------------------------------------------------------- */
function sanitize(obj) {
  if (!obj || typeof obj !== "object") return null;
  const base = emptyState();

  const meta = obj.meta && typeof obj.meta === "object" ? obj.meta : {};
  base.meta.version = SCHEMA_VERSION;
  base.meta.updatedAt = typeof meta.updatedAt === "string" ? meta.updatedAt : nowIso();

  const trip = obj.trip && typeof obj.trip === "object" ? obj.trip : {};
  base.trip.title = str(trip.title, 40);
  base.trip.studentId = str(trip.studentId, 10);
  base.trip.studentName = str(trip.studentName, 20);
  base.trip.city = sanitizeCity(trip.city);

  const tr = obj.transport && typeof obj.transport === "object" ? obj.transport : {};
  base.transport.isInternational =
    typeof tr.isInternational === "boolean"
      ? tr.isInternational
      : !(base.trip.city && base.trip.city.country === "대한민국");
  base.transport.flightCostKRW = num(tr.flightCostKRW);
  base.transport.localModes = Array.isArray(tr.localModes)
    ? tr.localModes.filter((m) => m === "public" || m === "walk")
    : [];
  base.transport.cautions = str(tr.cautions, 300);

  const places = Array.isArray(obj.places) ? obj.places : [];
  base.places = places
    .map(sanitizePlace)
    .filter(Boolean)
    .slice(0, CONFIG.MAX_PLACES);
  normalizeOrder(base.places);

  base.route = sanitizeRoute(obj.route);

  const ui = obj.ui && typeof obj.ui === "object" ? obj.ui : {};
  base.ui.lastPage = [1, 2, 3].includes(ui.lastPage) ? ui.lastPage : 1;
  base.ui.introSeen = ui.introSeen === true;

  return base;
}

function sanitizeCity(c) {
  if (!c || typeof c !== "object") return null;
  const center = coord(c.center);
  if (!center) return null;
  const city = {
    nameKo: str(c.nameKo, 40) || "이름 없는 도시",
    nameEn: str(c.nameEn, 60),
    country: str(c.country, 40),
    center,
    zoom: Number.isFinite(+c.zoom) ? clamp(+c.zoom, 1, 18) : 11,
    bbox: null
  };
  if (Array.isArray(c.bbox) && c.bbox.length === 4 && c.bbox.every((n) => Number.isFinite(+n))) {
    city.bbox = c.bbox.map(Number);
  }
  return city;
}

function sanitizePlace(p) {
  if (!p || typeof p !== "object") return null;
  if (!TYPES[p.type]) return null;
  const c = coord(p.coord);
  if (!c) return null;

  const type = TYPES[p.type];
  const icon = type.icons.includes(p.icon) ? p.icon : type.defaultIcon;
  const tone = ["light", "base", "dark"].includes(p.tone) ? p.tone : "base";

  return {
    id: str(p.id, 24) || makeId(),
    type: p.type,
    name: str(p.name, 60) || "이름 없음",
    searchedName: str(p.searchedName, 120),
    coord: c,
    address: str(p.address, 200),
    source: ["photon", "manual", "preset", "maptiler"].includes(p.source) ? p.source : "manual",
    priceKRW: num(p.priceKRW),
    order: Number.isFinite(+p.order) ? +p.order : 0,
    icon,
    tone,
    color: colorOf(p.type, tone),
    detail: sanitizeDetail(p.type, p.detail)
  };
}

function sanitizeDetail(type, d) {
  const s = d && typeof d === "object" ? d : {};
  switch (type) {
    case "stay":
      return { roomName: str(s.roomName, 60), note: str(s.note, 500) };
    case "sight":
      return { highlight: str(s.highlight, 200), access: str(s.access, 200), note: str(s.note, 500) };
    case "food":
      return {
        food1: str(s.food1, 60), food2: str(s.food2, 60),
        access: str(s.access, 200), note: str(s.note, 500)
      };
    case "activity":
      return { venue: str(s.venue, 100), access: str(s.access, 200), note: str(s.note, 500) };
    default:
      return {};
  }
}

function sanitizeRoute(r) {
  if (!r || typeof r !== "object") return null;
  const g = r.geometry;
  const ok = g && g.type === "LineString" && Array.isArray(g.coordinates);
  return {
    profile: str(r.profile, 30) || "foot-walking",
    distanceM: num(r.distanceM),
    durationS: num(r.durationS),
    approx: r.approx === true,      // 대중교통 → 자동차 근사
    straight: r.straight === true,  // ORS 실패 → 직선 폴백
    geometry: ok ? { type: "LineString", coordinates: g.coordinates } : null
  };
}

/* --------------------------------------------------------------------
   places 조작 헬퍼
   -------------------------------------------------------------------- */
export function makeId() {
  const s = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "p_";
  const buf = new Uint8Array(6);
  (globalThis.crypto || {}).getRandomValues
    ? crypto.getRandomValues(buf)
    : buf.forEach((_, i) => (buf[i] = Math.floor(Math.random() * 256)));
  for (let i = 0; i < 6; i++) out += s[buf[i] % s.length];
  return out;
}

export function placesOf(type) {
  return state.places.filter((p) => p.type === type);
}

export function findPlace(id) {
  return state.places.find((p) => p.id === id) || null;
}

export function addPlace(place) {
  place.order = state.places.length + 1;
  state.places.push(place);
  normalizeOrder(state.places);
  return place;
}

export function updatePlace(id, patch) {
  const p = findPlace(id);
  if (!p) return null;
  Object.assign(p, patch);
  p.color = colorOf(p.type, p.tone);
  return p;
}

export function removePlace(id) {
  const i = state.places.findIndex((p) => p.id === id);
  if (i < 0) return false;
  state.places.splice(i, 1);
  normalizeOrder(state.places);
  return true;
}

/** order 값을 1..N 으로 다시 매깁니다 */
export function normalizeOrder(list = state.places) {
  list.sort((a, b) => (a.order || 0) - (b.order || 0));
  list.forEach((p, i) => { p.order = i + 1; });
  return list;
}

/** 방문 순서대로 정렬된 사본 */
export function orderedPlaces() {
  return [...state.places].sort((a, b) => a.order - b.order);
}

/** from 위치의 항목을 to 위치로 옮깁니다 (0-based) */
export function movePlace(fromIdx, toIdx) {
  const list = orderedPlaces();
  if (fromIdx < 0 || fromIdx >= list.length) return false;
  const to = clamp(toIdx, 0, list.length - 1);
  if (to === fromIdx) return false;
  const [item] = list.splice(fromIdx, 1);
  list.splice(to, 0, item);
  list.forEach((p, i) => { p.order = i + 1; });
  return true;
}

/** 총 이용 비용 (항공료 제외 — §7) */
export function totalCost() {
  return state.places.reduce((sum, p) => sum + (p.priceKRW || 0), 0);
}

export function isFull() {
  return state.places.length >= CONFIG.MAX_PLACES;
}

/** 1페이지 필수값이 모두 채워졌는지 */
export function tripIsValid() {
  const t = state.trip;
  return !!(t.title.trim() && t.studentId.trim() && t.studentName.trim() && t.city);
}

/* --------------------------------------------------------------------
   내보내기 / 불러오기 (§13)
   -------------------------------------------------------------------- */
export function exportJson() {
  return JSON.stringify(state, null, 2);
}

export function importJson(text) {
  const obj = JSON.parse(text);
  const clean = sanitize(obj);
  if (!clean) throw new Error("형식이 올바르지 않습니다.");
  Object.assign(state, clean);
  return true;
}

/* --------------------------------------------------------------------
   작은 유틸
   -------------------------------------------------------------------- */
function str(v, max) {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function coord(v) {
  if (!Array.isArray(v) || v.length < 2) return null;
  const lon = Number(v[0]);
  const lat = Number(v[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return [lon, lat];
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
