// =====================================================================
//  Travel Internship — 교사 설정 파일
//  ---------------------------------------------------------------
//  ★ 이 파일 한 개만 교체하면 키 교체가 완료됩니다.
//  ★ 학생은 아무 키도 입력하지 않습니다.
//
//  키 발급 방법과 교체 절차는 README.md 를 참고하세요.
// =====================================================================

export const CONFIG = {
  APP_TITLE: "Travel Internship",

  // -------------------------------------------------------------------
  // 1) MapTiler 키 (지도 타일 · 정적 지도 폴백 · 지오코딩 폴백)
  //    maptiler.com 가입 → Keys → 새 키 생성
  //    ★ Allowed origins 에 배포 주소만 등록하세요.
  //       예) https://<교사계정>.github.io/*
  //    아래 값이 "YOUR_MAPTILER_KEY" 인 동안에는 앱이 '데모 모드'로 동작합니다.
  // -------------------------------------------------------------------
  MAPTILER_KEY: "YOUR_MAPTILER_KEY",

  // 사용할 MapTiler 스타일 (streets-v2 / outdoor-v2 / satellite)
  MAPTILER_STYLE: "streets-v2",

  // -------------------------------------------------------------------
  // 2) OpenRouteService 키 (방문지 간 경로)
  //    openrouteservice.org 가입 → Dashboard → Request a token
  //
  //    ⚠ ORS 무료 키는 도메인 제한을 걸 수 없습니다(명세서 §10-3).
  //       - B안(현재 설정): 키를 그대로 넣고 학기마다 재발급
  //       - A안으로 바꾸려면 아래 ORS_PROXY_URL 에 Cloudflare Worker 주소를
  //         넣으세요. 그 경우 ORS_KEY 는 비워둡니다.
  //    아래 값이 "YOUR_ORS_KEY" 이고 프록시도 없으면 경로는 점선 직선으로 표시됩니다.
  // -------------------------------------------------------------------
  ORS_KEY: "YOUR_ORS_KEY",
  ORS_PROXY_URL: "", // 예) "https://travel-internship.<계정>.workers.dev/route"

  // -------------------------------------------------------------------
  // 3) Photon (장소 검색) — 키 불필요
  //    학교 단위 상시 운영 시 자체 호스팅 주소로 교체 가능
  // -------------------------------------------------------------------
  PHOTON_URL: "https://photon.komoot.io/api/",

  // -------------------------------------------------------------------
  // 4) 사용량 · 제한 설정
  // -------------------------------------------------------------------
  MAX_PLACES: 20,                 // 방문지 합계 상한
  SEARCH_MIN_LENGTH: 2,           // 이 글자 수 미만이면 검색하지 않음
  SEARCH_DEBOUNCE_MS: 500,        // 입력 디바운스
  SEARCH_MIN_INTERVAL_MS: 1000,   // 검색 호출 최소 간격 (1초 1회)
  SEARCH_RATE_LIMIT_PER_MIN: 20,  // 분당 상한
  SEARCH_RESULT_LIMIT: 5,         // 결과 표시 개수
  SEARCH_RETRY_MAX: 2,            // 429/5xx 재시도 횟수

  // Photon 실패 시 MapTiler 지오코딩으로 한 번 더 시도할지 (MapTiler 한도를 소모)
  USE_MAPTILER_GEOCODING_FALLBACK: true,

  ROUTE_DEBOUNCE_MS: 800,         // 순서 변경이 멈춘 뒤 이 시간 후 1회만 ORS 호출

  // 저장 디바운스
  SAVE_DEBOUNCE_MS: 500,

  // -------------------------------------------------------------------
  // 5) 라이브러리 CDN (오프라인 배포 시 로컬 경로로 교체)
  // -------------------------------------------------------------------
  CDN: {
    MAPLIBRE_JS: "https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.js",
    MAPLIBRE_CSS: "https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css",
    JSPDF: "https://cdn.jsdelivr.net/npm/jspdf@3.0.1/dist/jspdf.umd.min.js"
  }
};

// 키가 실제로 설정되었는지 판정 (콘솔·화면에 키 값을 출력하지 않습니다)
export const HAS_MAPTILER_KEY =
  !!CONFIG.MAPTILER_KEY && !/^YOUR_/.test(CONFIG.MAPTILER_KEY);

export const HAS_ORS =
  !!CONFIG.ORS_PROXY_URL || (!!CONFIG.ORS_KEY && !/^YOUR_/.test(CONFIG.ORS_KEY));

export default CONFIG;
