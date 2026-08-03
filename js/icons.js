// =====================================================================
//  icons.js — 방문지 아이콘 38종 (자체 제작 · CC0 / 퍼블릭 도메인)
//
//  · 외부 아이콘 스프라이트(Maki 등)에 의존하지 않습니다.
//    이름 오타로 마커가 사라지는 문제를 피하기 위한 설계입니다(명세서 §3-1).
//  · 같은 그림이 icons/*.svg 파일로도 들어 있지만, 앱 실행 시에는
//    이 파일의 path 데이터를 그대로 씁니다(네트워크 요청 0회).
//  · 모든 도형은 24×24 viewBox 기준입니다.
//  · 한 아이콘은 여러 개의 path 로 이루어집니다. 구멍(예: 액자 안쪽)은
//    같은 path 문자열 안에서 fill-rule="evenodd" 로 만듭니다.
// =====================================================================

import { TYPES } from "./storage.js";

/* --------------------------------------------------------------------
   아이콘 도형
   -------------------------------------------------------------------- */
export const ICON_PATHS = {
  /* ---------------- 숙소 ---------------- */
  lodging: [
    "M2 6h2v7h15a3 3 0 0 1 3 3v4h-2v-3H4v3H2z",
    "M5 9h5a2 2 0 0 1 2 2v1H5z"
  ],
  house: [
    "M12 3 2 11h3v10h6v-6h2v6h6V11h3z"
  ],
  camping: [
    "M12 3 22 21h-8l-2-7-2 7H2z"
  ],
  suitcase: [
    "M9 3h6a2 2 0 0 1 2 2v2h-2V5H9v2H7V5a2 2 0 0 1 2-2z",
    "M4 8h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"
  ],
  star: [
    "M12 2l2.9 6.2 6.6.9-4.8 4.7 1.2 6.7L12 17.3 6.1 20.5l1.2-6.7L2.5 9.1l6.6-.9z"
  ],

  /* ---------------- 관광 명소 ---------------- */
  castle: [
    "M2 21V7h2V4h3v3h2V4h6v3h2V4h3v3h2v14h-7v-5a3 3 0 0 0-6 0v5z"
  ],
  museum: [
    "M12 2 2 8v2h20V8z",
    "M4 11h3v7H4zM10.5 11h3v7h-3zM17 11h3v7h-3z",
    "M2 19h20v3H2z"
  ],
  artgallery: [
    "M3 3h18v18H3zm2 2v14h14V5zm1.5 12.5 3.2-4.2 2.3 2.8 2.6-3.3 3.4 4.7z"
  ],
  park: [
    "M12 2 5 12h4l-4 6h6v4h2v-4h6l-4-6h4z"
  ],
  temple: [
    "M12 2 3 7h18z",
    "M5 8.5h14l2 3.5H3z",
    "M7 13h10l2 3.5H5z",
    "M4 18h16v4H4z"
  ],
  church: [
    "M11 1h2v3h3v2h-3v3h-2V6H8V4h3z",
    "M5 12l7-3 7 3v10h-5v-5h-4v5H5z"
  ],
  mountain: [
    "M2 21 9 8l4 6 2.5-3.5L22 21z"
  ],
  sea: [
    "M15.5 5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0z",
    "M2 10c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2v2.2c-2 0-3-2-5-2s-3 2-5 2-3-2-5-2-3 2-5 2z",
    "M2 15.5c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2v2.2c-2 0-3-2-5-2s-3 2-5 2-3-2-5-2-3 2-5 2z"
  ],
  viewpoint: [
    "M6 3h3v6H6zM15 3h3v6h-3z",
    "M7 9a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm10 0a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z",
    "M11.4 11h1.2v3h-1.2z"
  ],
  zoo: [
    "M3.6 10a1.9 2.4 0 1 0 3.8 0 1.9 2.4 0 1 0-3.8 0z",
    "M7.6 6.6a2 2.6 0 1 0 4 0 2 2.6 0 1 0-4 0z",
    "M12.4 6.6a2 2.6 0 1 0 4 0 2 2.6 0 1 0-4 0z",
    "M16.6 10a1.9 2.4 0 1 0 3.8 0 1.9 2.4 0 1 0-3.8 0z",
    "M12 12.5c3.2 0 5.8 2.3 5.8 5.1 0 2-1.7 3.4-3.8 3.4-1 0-1.4-.3-2-.3s-1 .3-2 .3c-2.1 0-3.8-1.4-3.8-3.4 0-2.8 2.6-5.1 5.8-5.1z"
  ],
  aquarium: [
    // 몸통과 눈을 한 path 에 담아 evenodd 로 눈을 뚫습니다
    "M3 12c2.5-4.5 6.5-6 10-4.5v9C9.5 18 5.5 16.5 3 12zM5.6 10.6a1.05 1.05 0 1 0 2.1 0 1.05 1.05 0 1 0-2.1 0z",
    "M13 8 20 5l-1.5 7 1.5 7-7-3z"
  ],
  monument: [
    "M12 2 9 7h6z",
    "M9.5 8h5l1 11H8.5z",
    "M6 20h12v2H6z"
  ],

  /* ---------------- 현지 맛집 ---------------- */
  restaurant: [
    "M7 2v7a3 3 0 0 0 2.2 2.9V22h1.6V11.9A3 3 0 0 0 13 9V2h-1.5v6.5h-1V2H9v6.5H8V2z",
    "M17 2c1.8 1.5 2.6 4.4 2.6 7.4S18.8 15 17 16v6h-1.5V2z"
  ],
  noodle: [
    "M11.5 1.5 20.5 5l-.5 1.3-9-3.5z",
    "M11.5 4.3 20.5 7.8l-.5 1.3-9-3.5z",
    "M2 11h20a10 10 0 0 1-20 0z"
  ],
  pizza: [
    "M12 2 3 19.5c5.6 2.6 12.4 2.6 18 0zM9.2 13.2a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0zM14 11.5a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0zM11 17a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0z"
  ],
  seafood: [
    "M12 21c-5 0-9-3.6-9-8.5S7 3 12 3s9 4.6 9 9.5-4 8.5-9 8.5zM11.6 5h.8v15.5h-.8zM8.6 5.5l.8-.2 2.4 15-.8.15zM14.6 5.3l.8.2-2.4 15-.8-.15z"
  ],
  fastfood: [
    "M12 3c4.4 0 8 2.4 8 5.3V9H4v-.7C4 5.4 7.6 3 12 3z",
    "M3.5 10.2h17a1.4 1.4 0 0 1 0 2.8h-17a1.4 1.4 0 0 1 0-2.8z",
    "M4 14.2h16v2.2H4z",
    "M4 17.5h16v.8c0 1.5-1.2 2.7-2.7 2.7H6.7A2.7 2.7 0 0 1 4 18.3z"
  ],
  cafe: [
    "M6 2h1.4v3.6H6zM10 2h1.4v3.6H10zM13.6 2H15v3.6h-1.4z",
    "M3 8h14v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z",
    "M17 9.5h1.5a3 3 0 0 1 0 6H17v-1.8h1.5a1.2 1.2 0 0 0 0-2.4H17z",
    "M2 20.4h18V22H2z"
  ],
  bakery: [
    "M4 10c0-3.3 3.6-6 8-6s8 2.7 8 6v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM7 9.5l1.1-.9 2 2.4-1.1.9zM11 9.2l1.1-.9 2 2.4-1.1.9zM15 9.5l1.1-.9 2 2.4-1.1.9z"
  ],
  icecream: [
    "M6.3 10a5.7 5.7 0 1 1 11.4 0z",
    "M6.6 11.5h10.8L12 22z"
  ],
  bar: [
    "M3 4h18l-8 9v6h4v2H7v-2h4v-6zM13.8 7a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0z"
  ],

  /* ---------------- 엑티비티 ---------------- */
  themepark: [
    "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 2.4a7.6 7.6 0 1 1 0 15.2 7.6 7.6 0 1 1 0-15.2z",
    "M11.1 3.2h1.8v17.6h-1.8zM3.2 11.1h17.6v1.8H3.2z",
    "M9.9 11.9a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 1 0-4.2 0z"
  ],
  swim: [
    "M15.3 5.5a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0z",
    "M2 12.5l6.5-3.5 4 2.5 5-2.8 1 1.8-6 3.4-4-2.5-5.6 3z",
    "M2 17.5c2 0 3-1.6 5-1.6s3 1.6 5 1.6 3-1.6 5-1.6 3 1.6 5 1.6v2c-2 0-3-1.6-5-1.6s-3 1.6-5 1.6-3-1.6-5-1.6-3 1.6-5 1.6z"
  ],
  bicycle: [
    "M1 16.5a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0zM2.6 16.5a2.9 2.9 0 1 0 5.8 0 2.9 2.9 0 1 0-5.8 0z",
    "M14 16.5a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0zM15.6 16.5a2.9 2.9 0 1 0 5.8 0 2.9 2.9 0 1 0-5.8 0z",
    "M9.4 9.5h5.4v1.6H9.4z",
    "M10.6 10.3l1.5-.6 3 5.9-1.5.7z",
    "M4.9 15.8l4.7-5.9 1.3 1-4.7 5.9z",
    "M7.6 7.4h3.4V9H7.6zM14.3 6.6h3.2v1.6h-3.2z"
  ],
  ski: [
    "M11.1 2h1.8v20h-1.8z",
    "M3.06 6.5l.9-1.56 17.32 10-.9 1.56z",
    "M3.96 18.06l-.9-1.56 17.32-10 .9 1.56z",
    "M12 1.4l3.2 3.2-1.3 1.3L12 4l-1.9 1.9-1.3-1.3zM12 22.6l-3.2-3.2 1.3-1.3L12 20l1.9-1.9 1.3 1.3z"
  ],
  golf: [
    "M8 2h1.8v20H8z",
    "M9.8 2.6 19 6l-9.2 3.4z",
    "M14.5 19a2 2 0 1 0 4 0 2 2 0 1 0-4 0z",
    "M2 20.6h20V22H2z"
  ],
  theater: [
    "M12 3c4.5 0 8 1.2 8 3.5 0 6-3.5 14.5-8 14.5S4 12.5 4 6.5C4 4.2 7.5 3 12 3zM8.6 8.4a1.5 1.1 0 1 0 3 0 1.5 1.1 0 1 0-3 0zM12.4 8.4a1.5 1.1 0 1 0 3 0 1.5 1.1 0 1 0-3 0zM8.5 14c2.3 1.6 4.7 1.6 7 0-.8 2-2.2 3-3.5 3s-2.7-1-3.5-3z"
  ],
  cinema: [
    "M2 3h20v5H2zM5.5 3 3 8h2.5L8 3zM11 3l-2.5 5H11l2.5-5zM16.5 3 14 8h2.5L19 3z",
    "M2 9.5h20V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
  ],
  shopping: [
    "M8 8V6a4 4 0 0 1 8 0v2h-1.8V6a2.2 2.2 0 0 0-4.4 0v2z",
    "M4 7h16l-1.2 13.2A2 2 0 0 1 16.8 22H7.2a2 2 0 0 1-2-1.8z"
  ],
  sports: [
    "M2 9.5h2.5v5H2zM5.5 7.5h3v9h-3zM15.5 7.5h3v9h-3zM19.5 9.5H22v5h-2.5z",
    "M8.5 10.6h7v2.8h-7z"
  ],
  picnic: [
    "M12 3a6 6 0 0 1 6 6h-1.9A4.1 4.1 0 0 0 12 4.9 4.1 4.1 0 0 0 7.9 9H6a6 6 0 0 1 6-6z",
    "M3 9.8h18l-1.6 10A2 2 0 0 1 17.4 21H6.6a2 2 0 0 1-2-1.2zM8.4 11.4h1.6l.6 8h-1.6zM14 11.4h1.6l-.6 8h-1.6z"
  ],
  playground: [
    "M2.2 21 11 3.6h2L21.8 21h-2.3L12 6 4.5 21z",
    "M5.5 9h13v1.6h-13z",
    "M9 10.4h1.3v6H9zM13.7 10.4H15v6h-1.3z",
    "M8 16h8v1.6H8z"
  ],
  cruise: [
    "M2 17h20l-2.5 5H4.5z",
    "M5 10h11v6H5zM6.6 11.4a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM9.6 11.4a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM12.6 11.4a1 1 0 1 0 2 0 1 1 0 1 0-2 0z",
    "M7 6h7v3H7z",
    "M17.2 8h2.6v8h-2.6z"
  ]
};

/* --------------------------------------------------------------------
   아이콘 한글 이름 (팝업 선택 UI 의 접근성 라벨)
   -------------------------------------------------------------------- */
export const ICON_LABELS = {
  lodging: "호텔", house: "집", camping: "캠핑", suitcase: "여행가방", star: "별",

  castle: "성·궁", museum: "박물관", artgallery: "미술관", park: "공원",
  temple: "사찰", church: "교회", mountain: "산", sea: "바다",
  viewpoint: "전망대", zoo: "동물원", aquarium: "수족관", monument: "기념물",

  restaurant: "식당", noodle: "면요리", pizza: "피자", seafood: "해산물",
  fastfood: "패스트푸드", cafe: "카페", bakery: "빵", icecream: "아이스크림", bar: "바",

  themepark: "놀이공원", swim: "수영", bicycle: "자전거", ski: "스키", golf: "골프",
  theater: "공연", cinema: "영화", shopping: "쇼핑", sports: "운동",
  picnic: "소풍", playground: "놀이터", cruise: "유람선"
};

/** 알 수 없는 키가 들어와도 마커가 사라지지 않도록 안전하게 되돌립니다 */
export function safeIcon(type, iconKey) {
  const t = TYPES[type];
  if (!t) return "monument";
  if (iconKey && ICON_PATHS[iconKey] && t.icons.includes(iconKey)) return iconKey;
  return t.defaultIcon;
}

/* --------------------------------------------------------------------
   SVG 문자열 만들기
   -------------------------------------------------------------------- */

/** 아이콘 하나를 단색 SVG 문자열로 (카드·선택 버튼용) */
export function iconSvg(iconKey, color = "currentColor", size = 24) {
  const paths = ICON_PATHS[iconKey] || ICON_PATHS.monument;
  const body = paths
    .map((d) => `<path fill-rule="evenodd" d="${d}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ` +
         `width="${size}" height="${size}" fill="${color}" aria-hidden="true">${body}</svg>`;
}

/**
 * 지도 마커용 물방울 핀 SVG.
 * 48×60 좌표계 · 아이콘은 흰 원 안에 배치.
 */
export function pinSvg(color, iconKey, { ring = "#ffffff" } = {}) {
  const paths = ICON_PATHS[iconKey] || ICON_PATHS.monument;
  const glyph = paths
    .map((d) => `<path fill-rule="evenodd" d="${d}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 60" width="48" height="60">` +
      `<path d="M24 2C13.5 2 5 10.5 5 21c0 13.4 19 36 19 36s19-22.6 19-36C43 10.5 34.5 2 24 2z" ` +
        `fill="${color}" stroke="${ring}" stroke-width="3"/>` +
      `<circle cx="24" cy="21" r="12.6" fill="${ring}"/>` +
      `<g transform="translate(13.8 10.8) scale(0.85)" fill="${color}">${glyph}</g>` +
    `</svg>`
  );
}

/* --------------------------------------------------------------------
   SVG → 지도용 이미지 (map.addImage 에 넘길 ImageData)
   -------------------------------------------------------------------- */

/**
 * @param {string} svg   SVG 문자열
 * @param {number} w     CSS 픽셀 폭
 * @param {number} h     CSS 픽셀 높이
 * @param {number} ratio 픽셀 비율 (기본 2 — 고해상도 화면·PDF 캡처 대비)
 * @returns {Promise<{width:number,height:number,data:Uint8ClampedArray}>}
 */
export function svgToImageData(svg, w, h, ratio = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "sync";
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = Math.round(w * ratio);
        cv.height = Math.round(h * ratio);
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const id = ctx.getImageData(0, 0, cv.width, cv.height);
        resolve({ width: id.width, height: id.height, data: id.data });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("아이콘 이미지를 만들지 못했습니다."));
    // data: URL 은 캔버스를 오염시키지 않으므로 getImageData 가 동작합니다.
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/** 지도에 등록할 이미지 id — 아이콘·색상·번호 조합마다 하나 */
export function markerImageId(iconKey, color, num) {
  return `pin-${iconKey}-${String(color).replace("#", "")}-${num || 0}`;
}

export const PIN_W = 48;
export const PIN_H = 60;

/**
 * 지도 마커 이미지를 만듭니다.
 * 번호는 SVG 글꼴에 기대지 않고 캔버스에 직접 그립니다.
 * → MapTiler 글리프(text-font) 문제로 라벨이 사라지는 사고를 원천 차단합니다(§5·§9-9).
 *
 * @param {string} color   유형 색상
 * @param {string} iconKey 아이콘 키
 * @param {number} num     방문 순서(0 이면 번호 없음)
 * @param {number} ratio   픽셀 비율
 */
export function pinImageData(color, iconKey, num = 0, ratio = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = PIN_W * ratio;
        cv.height = PIN_H * ratio;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cv.width, cv.height);

        if (num > 0) {
          // 번호 배지 — 핀 오른쪽 위
          const cx = 37 * ratio;
          const cy = 12 * ratio;
          const r = 10.5 * ratio;

          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = "#111827";
          ctx.fill();
          ctx.lineWidth = 2.4 * ratio;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = String(num);
          ctx.font = `700 ${(label.length > 1 ? 11 : 13) * ratio}px ` +
                     `system-ui, -apple-system, "Segoe UI", sans-serif`;
          ctx.fillText(label, cx, cy + 0.5 * ratio);
        }

        const id = ctx.getImageData(0, 0, cv.width, cv.height);
        resolve({ width: id.width, height: id.height, data: id.data });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("마커 이미지를 만들지 못했습니다."));
    img.src = "data:image/svg+xml;charset=utf-8," +
              encodeURIComponent(pinSvg(color, iconKey));
  });
}
