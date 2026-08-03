// =====================================================================
//  search.js — 장소 검색 (Photon · OpenStreetMap 기반, API 키 없음)
//
//  명세서 §6 전체를 구현합니다.
//   · 한국어 검색 약점 대응 4종 (§6-2)
//       1) 안내 문구를 영문/현지어 기준으로     → modal.js 의 검색 UI
//       2) 한글→영문 별칭 사전 자동 치환         → applyAlias()
//       3) 결과 0건이면 lang=default 로 1회 재질의 → searchPlaces()
//       4) [지도에서 직접 위치 지정]              → map.js 의 픽 모드
//       5) 최종 폴백으로 MapTiler 지오코딩(선택)  → maptilerGeocode()
//   · 공용 서버 사용 예절 (§6-3)
//       2글자 미만 차단 / 세션 캐시 / 1초 1회 · 분당 20회 / 지수 백오프
//
//  ⚠ 외부로 나가는 것은 "검색어와 좌표"뿐입니다.
//     학번·이름·여행 명칭은 어떤 API 에도 전송하지 않습니다 (§11).
// =====================================================================

import { CONFIG, HAS_MAPTILER_KEY } from "../config.js";

/* --------------------------------------------------------------------
   별칭 사전
   -------------------------------------------------------------------- */
let ALIASES = null;          // { 정규화한글: "English" }
let aliasLoading = null;

/** 비교용 정규화: 공백·중점 제거 + 소문자 */
function normKey(s) {
  return String(s).replace(/[\s·・]/g, "").toLowerCase();
}

export async function loadAliases() {
  if (ALIASES) return ALIASES;
  if (aliasLoading) return aliasLoading;

  aliasLoading = fetch("data/aliases.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((raw) => {
      const map = new Map();
      for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith("_") || typeof v !== "string") continue;
        map.set(normKey(k), v);
      }
      ALIASES = map;
      return map;
    })
    .catch((e) => {
      console.warn("[search] aliases.json 을 불러오지 못했습니다.", e);
      ALIASES = new Map();
      return ALIASES;
    });

  return aliasLoading;
}

/**
 * 한글 질의를 사전에 등록된 영문 표기로 바꿉니다.
 * 사전에 없으면 원문 그대로 돌려줍니다 (§6-2-2).
 * @returns {{ query:string, replaced:boolean, original:string }}
 */
export function applyAlias(query) {
  const original = String(query).trim();
  if (!ALIASES) return { query: original, replaced: false, original };

  const hit = ALIASES.get(normKey(original));
  if (hit) return { query: hit, replaced: true, original };

  return { query: original, replaced: false, original };
}

/* --------------------------------------------------------------------
   OSM 분류 → 한글 종류명 (§6 요청 형식)
   -------------------------------------------------------------------- */
const OSM_VALUE_KO = {
  // tourism
  museum: "박물관", gallery: "미술관", attraction: "관광 명소", artwork: "예술 작품",
  viewpoint: "전망대", zoo: "동물원", aquarium: "수족관", theme_park: "놀이공원",
  hotel: "호텔", hostel: "호스텔", guest_house: "게스트하우스", motel: "모텔",
  apartment: "아파트먼트", camp_site: "캠핑장", information: "안내소", picnic_site: "소풍터",
  // amenity
  restaurant: "음식점", cafe: "카페", fast_food: "패스트푸드", bar: "바", pub: "펍",
  ice_cream: "아이스크림", food_court: "푸드코트", marketplace: "시장",
  cinema: "영화관", theatre: "극장", library: "도서관", university: "대학교",
  place_of_worship: "종교 시설", bus_station: "버스 터미널", ferry_terminal: "여객 터미널",
  bank: "은행", pharmacy: "약국", hospital: "병원", townhall: "시청",
  // leisure
  park: "공원", garden: "정원", stadium: "경기장", sports_centre: "스포츠 센터",
  swimming_pool: "수영장", water_park: "워터파크", beach_resort: "해변 리조트",
  pitch: "운동장", golf_course: "골프장", marina: "마리나", playground: "놀이터",
  // historic
  castle: "성", monument: "기념물", memorial: "기념비", ruins: "유적",
  archaeological_site: "유적지", city_gate: "성문", tower: "탑", fort: "요새",
  // shop
  mall: "쇼핑몰", department_store: "백화점", supermarket: "슈퍼마켓",
  convenience: "편의점", bakery: "빵집", clothes: "옷 가게", gift: "기념품점",
  // natural
  beach: "해변", peak: "산봉우리", water: "호수·강", bay: "만", volcano: "화산",
  wood: "숲", cliff: "절벽", spring: "샘",
  // railway / aeroway / highway
  station: "역", subway_entrance: "지하철 출입구", halt: "간이역", tram_stop: "트램 정류장",
  aerodrome: "공항", terminal: "공항 터미널", bus_stop: "버스 정류장",
  // place
  city: "도시", town: "읍·시", village: "마을", suburb: "지구", neighbourhood: "동네",
  island: "섬", quarter: "구역", county: "군", state: "주·도", country: "국가"
};

const OSM_KEY_KO = {
  tourism: "관광", amenity: "편의시설", leisure: "여가", historic: "역사",
  shop: "상점", natural: "자연", railway: "철도", aeroway: "항공",
  highway: "도로", place: "지역", building: "건물", waterway: "수로",
  man_made: "인공 구조물", office: "사무실", craft: "공방", boundary: "경계"
};

/** Photon 결과의 종류를 한글 한 단어로 */
export function osmKindKo(props = {}) {
  const v = props.osm_value;
  const k = props.osm_key;
  if (v && OSM_VALUE_KO[v]) return OSM_VALUE_KO[v];
  if (k && OSM_KEY_KO[k]) return OSM_KEY_KO[k];
  if (props.type === "house") return "주소";
  return "장소";
}

/** 결과 아래 줄에 보여줄 도시/주소 문자열 */
export function formatWhere(props = {}) {
  const parts = [
    props.street && props.housenumber ? `${props.street} ${props.housenumber}` : props.street,
    props.district,
    props.city || props.county || props.locality,
    props.state,
    props.country
  ].filter(Boolean);

  // 중복 제거 후 최대 3개
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= 3) break;
  }
  return out.join(" · ");
}

/* --------------------------------------------------------------------
   사용량 제한 (§6-3)
   -------------------------------------------------------------------- */
const cache = new Map();     // 세션 내 동일 질의 캐시
const callTimes = [];        // 최근 호출 시각 (분당 상한 계산용)
let lastCallAt = 0;

export class SearchLimitError extends Error {
  constructor(message, waitMs = 0) {
    super(message);
    this.name = "SearchLimitError";
    this.waitMs = waitMs;
  }
}

function pruneCallTimes(now) {
  while (callTimes.length && now - callTimes[0] > 60_000) callTimes.shift();
}

/** 지금 검색해도 되는지 확인 — 안 되면 SearchLimitError 를 던집니다 */
function assertCanCall() {
  const now = Date.now();
  pruneCallTimes(now);

  if (callTimes.length >= CONFIG.SEARCH_RATE_LIMIT_PER_MIN) {
    const wait = 60_000 - (now - callTimes[0]);
    throw new SearchLimitError(
      `검색을 너무 많이 했습니다. ${Math.ceil(wait / 1000)}초 후 다시 검색해 주세요.`, wait
    );
  }
  if (now - lastCallAt < CONFIG.SEARCH_MIN_INTERVAL_MS) {
    const wait = CONFIG.SEARCH_MIN_INTERVAL_MS - (now - lastCallAt);
    throw new SearchLimitError("잠시 후 다시 검색해 주세요.", wait);
  }
}

function markCall() {
  const now = Date.now();
  lastCallAt = now;
  callTimes.push(now);
}

/** 남은 검색 가능 횟수 (안내용) */
export function remainingSearches() {
  pruneCallTimes(Date.now());
  return Math.max(0, CONFIG.SEARCH_RATE_LIMIT_PER_MIN - callTimes.length);
}

/* --------------------------------------------------------------------
   HTTP — 429/5xx 지수 백오프 재시도 (§6-3)
   -------------------------------------------------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, { timeoutMs = 8000 } = {}) {
  let lastErr = null;

  for (let attempt = 0; attempt <= CONFIG.SEARCH_RETRY_MAX; attempt++) {
    if (attempt > 0) await sleep(500 * Math.pow(2, attempt - 1)); // 500ms → 1000ms

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      clearTimeout(timer);

      if (res.ok) return await res.json();

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`검색 서버가 혼잡합니다. (${res.status})`);
        continue; // 재시도
      }
      throw new Error(`검색에 실패했습니다. (${res.status})`);
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        lastErr = new Error("검색 응답이 늦어 중단했습니다.");
        continue;
      }
      if (attempt >= CONFIG.SEARCH_RETRY_MAX) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error("검색에 실패했습니다.");
}

/* --------------------------------------------------------------------
   Photon 호출
   -------------------------------------------------------------------- */
function photonUrl(q, city, lang) {
  const u = new URL(CONFIG.PHOTON_URL);
  u.searchParams.set("q", q);
  u.searchParams.set("limit", String(CONFIG.SEARCH_RESULT_LIMIT));
  u.searchParams.set("lang", lang);

  if (city) {
    // 선택 도시 기준 근접 가중치
    if (Array.isArray(city.center)) {
      u.searchParams.set("lon", String(city.center[0]));
      u.searchParams.set("lat", String(city.center[1]));
    }
    // 도시 범위로 제한
    if (Array.isArray(city.bbox) && city.bbox.length === 4) {
      u.searchParams.set("bbox", city.bbox.join(","));
    }
  }
  return u.toString();
}

function toResults(geojson, source) {
  const feats = (geojson && Array.isArray(geojson.features)) ? geojson.features : [];
  return feats
    .map((f) => {
      const c = f.geometry && f.geometry.coordinates;
      if (!Array.isArray(c) || c.length < 2) return null;
      const p = f.properties || {};
      const name = p.name || p.street || p.city || p.country || "이름 없는 장소";
      return {
        name,
        kind: osmKindKo(p),
        where: formatWhere(p),
        coord: [Number(c[0]), Number(c[1])],
        address: [formatWhere(p)].filter(Boolean).join(""),
        source
      };
    })
    .filter(Boolean);
}

/* --------------------------------------------------------------------
   MapTiler 지오코딩 폴백 (§6-2-5) — Photon 실패 시에만 호출
   -------------------------------------------------------------------- */
async function maptilerGeocode(q, city) {
  if (!HAS_MAPTILER_KEY || !CONFIG.USE_MAPTILER_GEOCODING_FALLBACK) return [];

  const u = new URL(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json`
  );
  u.searchParams.set("key", CONFIG.MAPTILER_KEY);
  u.searchParams.set("limit", String(CONFIG.SEARCH_RESULT_LIMIT));
  u.searchParams.set("language", "ko");
  if (city && Array.isArray(city.center)) {
    u.searchParams.set("proximity", city.center.join(","));
  }
  if (city && Array.isArray(city.bbox) && city.bbox.length === 4) {
    u.searchParams.set("bbox", city.bbox.join(","));
  }

  const json = await fetchWithRetry(u.toString());
  const feats = (json && Array.isArray(json.features)) ? json.features : [];

  return feats
    .map((f) => {
      const c = f.center || (f.geometry && f.geometry.coordinates);
      if (!Array.isArray(c) || c.length < 2) return null;
      return {
        name: f.text || f.place_name || "이름 없는 장소",
        kind: Array.isArray(f.place_type) ? (OSM_VALUE_KO[f.place_type[0]] || "장소") : "장소",
        where: f.place_name || "",
        coord: [Number(c[0]), Number(c[1])],
        address: f.place_name || "",
        source: "maptiler"
      };
    })
    .filter(Boolean);
}

/* --------------------------------------------------------------------
   메인 검색 함수
   -------------------------------------------------------------------- */

/**
 * @param {string} rawQuery 학생이 입력한 문자열
 * @param {object|null} city  state.trip.city (근접 가중치·범위 제한용)
 * @returns {Promise<{
 *   results: Array, usedQuery: string, aliasUsed: boolean,
 *   retriedDefaultLang: boolean, usedFallback: boolean, cached: boolean
 * }>}
 */
export async function searchPlaces(rawQuery, city) {
  const trimmed = String(rawQuery || "").trim();

  if (trimmed.length < CONFIG.SEARCH_MIN_LENGTH) {
    throw new SearchLimitError(
      `${CONFIG.SEARCH_MIN_LENGTH}글자 이상 입력해 주세요.`
    );
  }

  await loadAliases();
  const { query, replaced } = applyAlias(trimmed);

  const cityKey = city ? `${city.nameEn || city.nameKo}` : "-";
  const cacheKey = `${cityKey}::${normKey(query)}`;

  // 1) 세션 캐시 — 같은 검색어는 다시 호출하지 않습니다 (§6-3)
  if (cache.has(cacheKey)) {
    return { ...cache.get(cacheKey), cached: true };
  }

  // 2) 호출 상한 확인
  assertCanCall();

  let results = [];
  let retriedDefaultLang = false;
  let usedFallback = false;

  // 3) Photon (lang=en)
  markCall();
  const first = await fetchWithRetry(photonUrl(query, city, "en"));
  results = toResults(first, "photon");

  // 4) 0건이면 lang=default 로 1회 재질의 (§6-2-3)
  if (results.length === 0) {
    retriedDefaultLang = true;
    markCall();
    const second = await fetchWithRetry(photonUrl(query, city, "default"));
    results = toResults(second, "photon");
  }

  // 5) 그래도 0건이면 MapTiler 지오코딩 폴백 (§6-2-5)
  if (results.length === 0) {
    try {
      const fb = await maptilerGeocode(query, city);
      if (fb.length) {
        results = fb;
        usedFallback = true;
      }
    } catch (e) {
      console.warn("[search] MapTiler 폴백 실패", e.message);
    }
  }

  const payload = {
    results,
    usedQuery: query,
    aliasUsed: replaced,
    retriedDefaultLang,
    usedFallback,
    cached: false
  };
  cache.set(cacheKey, payload);
  return payload;
}

/** 설정에서 [전체 삭제] 를 눌렀을 때 캐시도 비웁니다 */
export function clearSearchCache() {
  cache.clear();
}
