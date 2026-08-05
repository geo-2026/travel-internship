// search.js — Mapbox 장소 검색 래퍼.
//
// 자동완성은 이 앱에서 호출이 가장 많이 발생하는 지점이라 교사 토큰을 지키는
// 장치를 전부 여기 모아 둔다(§6-2).
//   · 디바운스 300ms, 2글자 미만 질의 금지
//   · 동일 질의 세션 캐싱
//   · 분당 20회 상한
//   · 429/5xx 지수 백오프 재시도 2회
// 검색어와 좌표 외에는 어떤 값도 외부로 나가지 않는다(학번·이름 전송 금지).
//
// ⚠ 어떤 API 를 왜 쓰는지 — 실측으로 정한 것이라 되돌리면 검색이 다시 0건이 된다.
//
//  1. 방문지(POI) 검색은 **Search Box API** 를 쓴다.
//     Geocoding API 는 이 계정에서 POI 를 돌려주지 않는다. v6 에 types=poi 를 주면
//     422 "Type \"poi\" is not a known type" 이 오고, v5 는 조용히 0건을 준다.
//     그래서 "경복궁"·"광장시장" 같은 질의가 전부 빈 결과였다.
//
//  2. Search Box 요청에는 **language 파라미터를 넣지 않는다.**
//     `language=ko` 를 붙이면 한글 질의든 영문 질의든 POI 가 통째로 사라진다
//     (경복궁 → 0건). 빼면 한글 질의에 한글 이름 그대로 돌아온다.
//     한글 라벨은 지도 스타일(map.js 의 language:"ko")이 따로 처리하므로
//     검색에서 language 를 뺀다고 지도가 영문이 되지는 않는다.
//
//  3. Search Box 가 0건이면 **Geocoding v5 로 한 번 더** 질의한다(language=ko).
//     주소·동네·지하철역처럼 POI 가 아닌 대상은 이쪽이 더 잘 잡는다.
//
// 해외 도시는 한글 음차(예: "오사카성")로는 POI 색인에 잡히지 않는다.
// 이때는 영문·현지어로 검색하거나 지도를 길게 눌러 직접 지정하도록 안내한다.

import { CONFIG } from "../config.js";

const SEARCHBOX = "https://api.mapbox.com/search/searchbox/v1/forward";
const ENDPOINT = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const cache = new Map();          // 질의키 -> features[]
const callTimestamps = [];        // 분당 상한 계산용

export const MIN_QUERY_LENGTH = 2;
export const DEBOUNCE_MS = 300;

export class RateLimitError extends Error {
  constructor() {
    super("잠시 후 다시 검색해 주세요.");
    this.name = "RateLimitError";
  }
}

function underRateLimit() {
  const now = Date.now();
  while (callTimestamps.length && now - callTimestamps[0] > 60000) {
    callTimestamps.shift();
  }
  return callTimestamps.length < CONFIG.SEARCH_RATE_LIMIT_PER_MIN;
}

/** 남은 검색 횟수 — UI 에 안내용으로 노출한다. */
export function remainingSearches() {
  const now = Date.now();
  while (callTimestamps.length && now - callTimestamps[0] > 60000) {
    callTimestamps.shift();
  }
  return Math.max(0, CONFIG.SEARCH_RATE_LIMIT_PER_MIN - callTimestamps.length);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithBackoff(url) {
  let lastErr = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(400 * Math.pow(2, attempt - 1));
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Mapbox ${res.status}`);
        continue;                       // 재시도 대상
      }
      throw new Error(`Mapbox ${res.status}`);   // 4xx 는 재시도해도 같음
    } catch (err) {
      lastErr = err;
      if (attempt === 2) break;
    }
  }
  throw lastErr || new Error("검색 요청 실패");
}

/** Search Box API — POI 를 돌려주는 유일한 경로. language 는 넣지 않는다(위 주석 2). */
function buildSearchBoxUrl(q, opts) {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(opts.limit || 5));
  if (opts.proximity) params.set("proximity", opts.proximity.join(","));
  if (opts.bbox) params.set("bbox", opts.bbox.join(","));
  params.set("access_token", CONFIG.MAPBOX_TOKEN);
  return `${SEARCHBOX}?${params.toString()}`;
}

/** Geocoding v5 — 주소·동네·역 등 POI 가 아닌 대상용 보조 경로. */
function buildGeocodeUrl(q, opts, types) {
  const params = new URLSearchParams();
  params.set("access_token", CONFIG.MAPBOX_TOKEN);
  params.set("limit", String(opts.limit || 5));
  params.set("language", "ko");
  if (types) params.set("types", types);
  if (opts.proximity) params.set("proximity", opts.proximity.join(","));
  if (opts.bbox) params.set("bbox", opts.bbox.join(","));
  return `${ENDPOINT}/${encodeURIComponent(q)}.json?${params.toString()}`;
}

/**
 * @param {string} query 검색어
 * @param {object} opts  { proximity:[lon,lat], bbox:[w,s,e,n], limit }
 * @returns {Promise<Array>} 정규화된 결과 배열
 */
export async function geocode(query, opts = {}) {
  const q = (query || "").trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const cacheKey = ["sb", q, (opts.bbox || []).join(","), (opts.proximity || []).join(",")].join("|");
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  if (!underRateLimit()) throw new RateLimitError();

  // 1차 — Search Box (POI)
  callTimestamps.push(Date.now());
  let normalized = [];
  try {
    const data = await fetchWithBackoff(buildSearchBoxUrl(q, opts));
    normalized = (data.features || []).map(normalizeSearchBox);
  } catch (err) {
    console.warn("Search Box 검색 실패 — Geocoding 으로 넘어갑니다.", err);
  }

  // 2차 — Geocoding v5 (주소·동네·역). POI 가 0건일 때만 한 번 더 부른다.
  if (normalized.length === 0) {
    if (!underRateLimit()) throw new RateLimitError();
    callTimestamps.push(Date.now());
    const data = await fetchWithBackoff(buildGeocodeUrl(q, opts, null));
    normalized = (data.features || []).map(normalizeFeature);
  }

  cache.set(cacheKey, normalized);
  return normalized;
}

/** Search Box 응답 → 앱 공통 형태. */
function normalizeSearchBox(f) {
  const p = f.properties || {};
  const coords = (f.geometry && f.geometry.coordinates) || [];

  // poi_category 는 "food/food and drink/restaurant" 처럼 길게 온다. 앞 2개만 쓴다.
  const raw = p.poi_category;
  const cats = Array.isArray(raw) ? raw : (raw ? String(raw).split("/") : []);
  const category = cats.slice(0, 2).join(", ") || FEATURE_TYPE_LABEL[p.feature_type] || "장소";

  return {
    name: p.name_preferred || p.name || "",
    placeName: p.full_address || p.place_formatted || "",
    address: p.full_address || p.place_formatted || "",
    category,
    center: [Number(coords[0]), Number(coords[1])],
    context: []
  };
}

const FEATURE_TYPE_LABEL = {
  poi: "장소", address: "주소", street: "도로", place: "도시",
  locality: "지역", neighborhood: "동네", district: "행정구역",
  region: "광역", country: "국가", postcode: "우편번호"
};

function normalizeFeature(f) {
  const props = f.properties || {};
  const category = props.category || (f.place_type || []).map((t) => FEATURE_TYPE_LABEL[t] || t).join(", ") || "";
  return {
    name: f.text || f.place_name || "",
    placeName: f.place_name || "",
    address: f.place_name || "",
    category,
    center: f.center,                     // [lon, lat]
    context: f.context || []
  };
}

/**
 * 1페이지 도시 검색 — types=place 로 고정(§6).
 * 도시는 Geocoding v5 가 한글로 잘 돌려주므로(예: "교토" → 교토시) Search Box 를 거치지 않는다.
 */
export async function geocodeCity(query) {
  const q = (query || "").trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const cacheKey = ["city", q].join("|");
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  if (!underRateLimit()) throw new RateLimitError();

  callTimestamps.push(Date.now());
  const data = await fetchWithBackoff(buildGeocodeUrl(q, { limit: 5 }, "place"));
  const results = (data.features || []).map(normalizeFeature);
  cache.set(cacheKey, results);

  return results.map((r) => {
    const countryEntry = (r.context || []).find((c) => String(c.id).startsWith("country"));
    return {
      nameKo: r.name,
      nameEn: r.name,
      country: countryEntry ? countryEntry.text : "",
      center: r.center,
      zoom: 11,
      bbox: bboxAround(r.center, 0.18, 0.12),
      placeName: r.placeName
    };
  });
}

function bboxAround(center, dLon, dLat) {
  const [lon, lat] = center;
  return [
    +(lon - dLon).toFixed(4), +(lat - dLat).toFixed(4),
    +(lon + dLon).toFixed(4), +(lat + dLat).toFixed(4)
  ];
}

/** 입력 이벤트에 붙일 디바운스 헬퍼. */
export function debounce(fn, ms = DEBOUNCE_MS) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
