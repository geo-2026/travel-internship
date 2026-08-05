// config.js — 교사가 관리하는 유일한 설정 파일.
// 발급 절차와 URL 제한 설정은 README.md 「2. Mapbox 토큰 발급」 참고.
//
// ⚠ 아래 MAPBOX_TOKEN 은 **자리표시자 그대로 두세요.**
//    실제 토큰은 GitHub 저장소의 비밀값(Secret) `MAPBOX_TOKEN` 에 들어 있고,
//    배포할 때 `.github/workflows/deploy.yml` 이 이 줄에 끼워 넣습니다.
//    토큰을 여기 직접 적으면 GitHub 푸시 보호에 막힙니다.
//
//    토큰 교체 방법: 저장소 → Settings → Secrets and variables → Actions
//                   → MAPBOX_TOKEN 값 수정 → Actions 탭에서 Deploy 재실행
//
//    로컬에서 지도를 보려면 config.local.example.js 를 참고해
//    `config.local.js` 를 만드세요(이 파일은 GitHub 에 올라가지 않습니다).

export const CONFIG = {
  APP_TITLE: "Travel Internship",

  // 배포 시 GitHub Actions 가 교사 계정의 **public** 토큰(pk.)으로 치환합니다.
  // sk. 로 시작하는 secret 토큰은 어떤 경우에도 쓰지 마세요.
  MAPBOX_TOKEN: "pk.PASTE_YOUR_MAPBOX_PUBLIC_TOKEN_HERE",

  MAX_PLACES: 20,
  SEARCH_RATE_LIMIT_PER_MIN: 20,

  MAP_STYLE: "mapbox://styles/mapbox/streets-v12",
  STORAGE_KEY: "travelInternship.v1"
};

// 토큰이 비어 있거나 예시 값 그대로면 앱이 안내 배너를 띄웁니다.
export function hasToken() {
  const t = CONFIG.MAPBOX_TOKEN;
  return typeof t === "string" && t.startsWith("pk.") && !t.includes("PASTE_YOUR");
}

/** 지금 보고 있는 곳이 로컬 미리보기(내 컴퓨터)인지. */
export function isLocalPreview() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "";
}

// ── 로컬 미리보기용 토큰 갈아끼우기 ──────────────────────────────────────────
//
// 배포용 토큰(travel-internship-class)은 URL 제한이 걸려 있어서
// http://127.0.0.1 에서는 Mapbox 가 403 으로 막습니다. 그래서 로컬로 열면
// 지도가 뜨지 않는 것이 정상입니다.
//
// 옆에 `config.local.js` 파일이 있으면 **로컬에서만** 그 안의 토큰으로 바꿔 씁니다.
// 이 파일은 `.gitignore` 에 들어 있어 GitHub 에 올라가지 않습니다.
// 만드는 법은 `config.local.example.js` 를 참고하세요.
//
// 배포 주소에서는 아예 불러오지 않으므로 학생 쪽에는 아무 영향이 없습니다.
export const RUNTIME = { localTokenApplied: false };

export async function initConfig() {
  if (!isLocalPreview()) return CONFIG;
  try {
    const mod = await import("./config.local.js");
    const t = mod && mod.LOCAL_MAPBOX_TOKEN;
    if (typeof t === "string" && t.startsWith("pk.")) {
      CONFIG.MAPBOX_TOKEN = t;
      RUNTIME.localTokenApplied = true;
      console.info("로컬 미리보기 — config.local.js 의 토큰을 사용합니다.");
    }
  } catch {
    // 파일이 없으면 그대로 둔다. 지도는 안 뜨지만 나머지는 전부 확인할 수 있다.
  }
  return CONFIG;
}
