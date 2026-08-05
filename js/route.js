// route.js — Mapbox Directions 래퍼.
//
// 순서 변경이 멈춘 뒤 800ms 후 한 번만 호출하고, 같은 순서 조합의 결과는
// 캐싱해 재호출하지 않는다(§7). 실패하면 마커를 잇는 직선을 돌려준다.

import { CONFIG, hasToken } from "../config.js";

const ENDPOINT = "https://api.mapbox.com/directions/v5/mapbox";
const cache = new Map();          // profile|좌표키 -> route
let pendingTimer = null;

/** localModes 로 Directions 프로필을 정한다(§7). */
export function profileFor(localModes) {
  const modes = localModes || [];
  const walkOnly = modes.length > 0 && modes.every((m) => m === "walk");
  return walkOnly ? "walking" : "driving";
}

/** 대중교통 근사 안내가 필요한지. Directions 에는 transit 프로필이 없다(§7). */
export function needsTransitNotice(localModes) {
  return (localModes || []).includes("public");
}

export const TRANSIT_NOTICE =
  "대중교통 경로는 도로 기준 근사 경로임";

function keyOf(profile, places) {
  return profile + "|" + places.map((p) => p.coord.map((n) => n.toFixed(5)).join(",")).join(";");
}

/** 두 좌표 사이 대권 거리(m). 경로 API 가 실패했을 때의 근사치 계산용. */
function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function straightLine(places) {
  // 경로를 못 받아도 학생이 규모를 가늠할 수 있도록 직선 거리만은 계산해 준다.
  let distance = 0;
  for (let i = 1; i < places.length; i++) {
    distance += haversine(places[i - 1].coord, places[i].coord);
  }
  return {
    profile: null,
    distanceM: Math.round(distance),
    durationS: null,
    fallback: true,
    geometry: { type: "LineString", coordinates: places.map((p) => p.coord) }
  };
}

/**
 * 방문 순서대로 경로를 계산한다.
 * @returns {Promise<{geometry, distanceM, durationS, fallback, profile}>}
 */
export async function fetchRoute(places, localModes) {
  if (!places || places.length < 2) {
    return { profile: null, distanceM: 0, durationS: 0, fallback: false, geometry: null };
  }
  if (places.length > 25) {
    // 경유지 25개 초과는 API 오류. 방문지 상한 20개로 막고 있지만 방어적으로 처리.
    return straightLine(places);
  }
  if (!hasToken()) return straightLine(places);

  const profile = profileFor(localModes);
  const key = keyOf(profile, places);
  if (cache.has(key)) return cache.get(key);

  const coords = places.map((p) => p.coord.join(",")).join(";");
  const params = new URLSearchParams({
    access_token: CONFIG.MAPBOX_TOKEN,
    geometries: "geojson",
    overview: "full",
    language: "ko"
  });

  try {
    const res = await fetch(`${ENDPOINT}/${profile}/${coords}?${params}`);
    if (!res.ok) throw new Error(`Directions ${res.status}`);
    const data = await res.json();
    const r = data.routes && data.routes[0];
    if (!r) throw new Error("경로 없음");

    const result = {
      profile,
      distanceM: Math.round(r.distance),
      durationS: Math.round(r.duration),
      fallback: false,
      geometry: r.geometry
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn("경로를 불러오지 못했습니다.", err);
    const fallback = straightLine(places);
    cache.set(key, fallback);
    return fallback;
  }
}

/** 순서 변경이 멈춘 뒤 800ms 후 1회만 호출(§7). */
export function scheduleRoute(places, localModes, callback, delay = 800) {
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(async () => {
    const snapshot = places.map((p) => ({ coord: p.coord }));
    const result = await fetchRoute(snapshot, localModes);
    callback(result);
  }, delay);
}

export function cancelScheduledRoute() {
  clearTimeout(pendingTimer);
}

// ── 표시용 포맷 ────────────────────────────────────────────────────────────

export function formatDistance(m) {
  if (m == null) return "—";
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function formatDuration(s) {
  if (s == null) return "—";
  const total = Math.round(s / 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h === 0) return `약 ${min}분`;
  if (min === 0) return `약 ${h}시간`;
  return `약 ${h}시간 ${min}분`;
}
