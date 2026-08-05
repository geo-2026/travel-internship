// storage.js — 모든 입력값은 이 기기의 localStorage 에만 담긴다.
// 서버 전송·쿠키·분석 스크립트 없음. 학번·이름은 어떤 API 에도 보내지 않는다.

import { CONFIG } from "../config.js";

const KEY = CONFIG.STORAGE_KEY;

function emptyState() {
  return {
    meta: { version: 1, updatedAt: null },
    trip: { title: "", studentId: "", studentName: "", city: null },
    transport: {
      isInternational: false,
      flightCostKRW: 0,
      localModes: [],
      cautions: ""
    },
    places: [],
    route: null
  };
}

let state = emptyState();
let saveTimer = null;

/** 저장된 데이터가 있는지(복원 확인창을 띄울지) 판단. */
export function hasSavedState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const t = parsed && parsed.trip;
    return Boolean(
      (t && (t.title || t.studentName || t.city)) ||
      (parsed.places && parsed.places.length)
    );
  } catch {
    return false;
  }
}

/** localStorage 에서 읽어 메모리 상태로 올린다. 손상된 값은 조용히 초기화. */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch (err) {
    console.warn("저장된 데이터를 읽지 못해 새로 시작합니다.", err);
    state = emptyState();
  }
  return state;
}

function migrate(parsed) {
  const base = emptyState();
  if (!parsed || typeof parsed !== "object") return base;
  return {
    meta: { ...base.meta, ...(parsed.meta || {}) },
    trip: { ...base.trip, ...(parsed.trip || {}) },
    transport: { ...base.transport, ...(parsed.transport || {}) },
    places: Array.isArray(parsed.places) ? parsed.places : [],
    route: parsed.route || null
  };
}

export function getState() {
  return state;
}

export function setState(next) {
  state = migrate(next);
  save();
  return state;
}

/** 즉시 저장. escape/unescape 없이 JSON.stringify 그대로 쓴다(한글 보존). */
export function save() {
  state.meta.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error("저장 실패", err);
    notifyQuota();
  }
  return state;
}

/** 입력 중에는 500ms 디바운스로 저장 (§13 네트워크 불안정 대비). */
export function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

let quotaWarned = false;
function notifyQuota() {
  if (quotaWarned) return;
  quotaWarned = true;
  alert("이 기기의 저장 공간이 부족해 자동 저장에 실패했습니다.\n" +
        "[계획 내보내기]로 JSON 파일을 받아 두세요.");
}

export function clearAll() {
  localStorage.removeItem(KEY);
  state = emptyState();
  return state;
}

// ── 장소 조작 ──────────────────────────────────────────────────────────────

export function newPlaceId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `p_${rand}`;
}

export function addPlace(place) {
  place.order = state.places.length + 1;
  state.places.push(place);
  save();
  return place;
}

export function updatePlace(id, patch) {
  const idx = state.places.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  state.places[idx] = { ...state.places[idx], ...patch };
  save();
  return state.places[idx];
}

export function removePlace(id) {
  state.places = state.places.filter((p) => p.id !== id);
  renumber();
  save();
}

export function reorderPlaces(idsInOrder) {
  const byId = new Map(state.places.map((p) => [p.id, p]));
  const next = [];
  idsInOrder.forEach((id) => {
    if (byId.has(id)) {
      next.push(byId.get(id));
      byId.delete(id);
    }
  });
  byId.forEach((p) => next.push(p));   // 목록에 없던 항목은 뒤에 붙인다
  state.places = next;
  renumber();
  save();
}

export function renumber() {
  state.places.forEach((p, i) => { p.order = i + 1; });
}

export function placesOfType(type) {
  return state.places.filter((p) => p.type === type);
}

/** 총 이용 비용 — 항공료는 제외한다(§7). */
export function totalPlaceCost() {
  return state.places.reduce((sum, p) => sum + (Number(p.priceKRW) || 0), 0);
}

// ── 내보내기 / 불러오기 (§13) ───────────────────────────────────────────────

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !parsed.trip) {
    throw new Error("이 파일은 Travel Internship 계획 파일이 아닙니다.");
  }
  return setState(parsed);
}
