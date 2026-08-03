// =====================================================================
//  route.js — OpenRouteService(ORS) Directions
//  명세서 §7
//
//  · 순서 변경이 멈춘 뒤 800ms 후 1회만 호출합니다.
//  · 같은 순서 조합의 결과는 캐싱해 다시 호출하지 않습니다.
//    → 3개 반 연속 수업에서도 ORS 일 2,500건 한도 안에 들어옵니다 (§10-4).
//  · 실패하면 방문지를 잇는 점선 직선으로 대체하고 안내만 띄웁니다.
//    수업 진행이 멈추지 않게 하는 것이 이 폴백의 목적입니다.
// =====================================================================

import { CONFIG, HAS_ORS } from "../config.js";

/** 이동수단 선택 → ORS 프로필 (§7) */
export function profileFor(localModes = []) {
  const hasPublic = localModes.includes("public");
  // ⚠ ORS 무료 API 에는 대중교통(transit) 경로가 없습니다.
  //    대중교통을 고르면 자동차 경로로 근사하고, 그 사실을 화면·PDF에 표기합니다.
  return hasPublic ? "driving-car" : "foot-walking";
}

/** 대중교통을 골랐는지 = 근사 경로 안내 문구가 필요한지 */
export function isApprox(localModes = []) {
  return localModes.includes("public");
}

export const APPROX_NOTE = "대중교통 경로는 도로 기준 근사 경로임";

/* --------------------------------------------------------------------
   캐시 — 순서 조합 + 프로필이 같으면 재호출하지 않습니다
   -------------------------------------------------------------------- */
const cache = new Map();

function cacheKey(profile, coords) {
  return profile + "|" + coords.map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join(";");
}

export function clearRouteCache() {
  cache.clear();
}

/* --------------------------------------------------------------------
   직선 폴백
   -------------------------------------------------------------------- */
function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ORS 없이 만드는 직선 경로 (점선으로 그려집니다) */
export function straightRoute(coords, profile) {
  let dist = 0;
  for (let i = 1; i < coords.length; i++) dist += haversine(coords[i - 1], coords[i]);

  // 도보 4.5km/h, 자동차 25km/h(도심) 로 대략 환산
  const speed = profile === "foot-walking" ? 4500 / 3600 : 25000 / 3600;

  return {
    profile,
    distanceM: Math.round(dist),
    durationS: Math.round(dist / speed),
    geometry: { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) },
    straight: true
  };
}

/* --------------------------------------------------------------------
   ORS 호출
   -------------------------------------------------------------------- */
async function callOrs(profile, coords, timeoutMs = 12000) {
  const usingProxy = !!CONFIG.ORS_PROXY_URL;

  const url = usingProxy
    ? CONFIG.ORS_PROXY_URL
    : `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;

  const headers = { "Content-Type": "application/json", Accept: "application/geo+json" };
  // 프록시(A안)를 쓰면 키는 브라우저에 들어오지 않습니다 (§10-3)
  if (!usingProxy) headers.Authorization = CONFIG.ORS_KEY;

  const body = usingProxy
    ? JSON.stringify({ profile, coordinates: coords })
    : JSON.stringify({ coordinates: coords });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    if (!res.ok) {
      const msg = res.status === 429
        ? "경로 요청이 한도를 넘었습니다."
        : `경로 서버 오류 (${res.status})`;
      throw new Error(msg);
    }
    const json = await res.json();
    const f = json && Array.isArray(json.features) ? json.features[0] : null;
    if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) {
      throw new Error("경로 응답 형식이 올바르지 않습니다.");
    }
    const sum = (f.properties && f.properties.summary) || {};
    return {
      profile,
      distanceM: Math.round(sum.distance || 0),
      durationS: Math.round(sum.duration || 0),
      geometry: { type: "LineString", coordinates: f.geometry.coordinates },
      straight: false
    };
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------
   메인 — 방문 순서대로 경로를 구합니다
   -------------------------------------------------------------------- */

/**
 * @param {Array} orderedPlaces  방문 순서로 정렬된 방문지
 * @param {string[]} localModes  ["public","walk"]
 * @returns {Promise<{route:object, error:string|null}>}
 *          실패해도 route 는 항상 반환됩니다(직선 폴백).
 */
export async function computeRoute(orderedPlaces, localModes) {
  const coords = orderedPlaces.map((p) => [p.coord[0], p.coord[1]]); // [lon, lat]
  const profile = profileFor(localModes);
  const approx = isApprox(localModes);

  if (coords.length < 2) {
    return { route: null, error: null };
  }

  const key = cacheKey(profile, coords);
  if (cache.has(key)) {
    const hit = cache.get(key);
    return { route: { ...hit.route, approx }, error: hit.error };
  }

  // 키도 프록시도 없으면 호출하지 않고 바로 직선으로 (§10-3 C안 운영과 동일)
  if (!HAS_ORS) {
    const route = { ...straightRoute(coords, profile), approx };
    const out = { route, error: "경로 키가 설정되지 않아 직선으로 표시했습니다." };
    cache.set(key, out);
    return out;
  }

  try {
    const route = { ...(await callOrs(profile, coords)), approx };
    const out = { route, error: null };
    cache.set(key, out);
    return out;
  } catch (e) {
    console.warn("[route] ORS 실패 → 직선 폴백", e.message);
    const route = { ...straightRoute(coords, profile), approx };
    const out = { route, error: "경로를 불러오지 못해 직선으로 표시했습니다." };
    cache.set(key, out);
    return out;
  }
}

/* --------------------------------------------------------------------
   디바운스 — 순서를 한 칸 옮길 때마다 호출하지 않습니다 (§7)
   -------------------------------------------------------------------- */
let timer = null;
let pending = 0;

/**
 * 마지막 호출로부터 CONFIG.ROUTE_DEBOUNCE_MS 후 1회만 실제 계산합니다.
 * @param {Function} done  (result) => void
 */
export function computeRouteDebounced(orderedPlaces, localModes, done) {
  if (timer) clearTimeout(timer);
  const seq = ++pending;

  timer = setTimeout(async () => {
    const result = await computeRoute(orderedPlaces, localModes);
    if (seq !== pending) return; // 그 사이 순서가 또 바뀌었으면 버립니다
    done(result);
  }, CONFIG.ROUTE_DEBOUNCE_MS);
}

/** 대기 중인 계산을 즉시 실행 (PDF 저장 직전 등) */
export function flushRoute() {
  if (timer) { clearTimeout(timer); timer = null; }
}

/* --------------------------------------------------------------------
   표시용 서식
   -------------------------------------------------------------------- */
export function formatDistance(m) {
  if (!m) return "0km";
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

export function formatDuration(s) {
  if (!s) return "0분";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `약 ${h}시간 ${m}분`;
  if (h) return `약 ${h}시간`;
  return `약 ${m}분`;
}
