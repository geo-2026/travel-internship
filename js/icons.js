// icons.js — 유형별 색상·아이콘 팔레트와 로컬 SVG 로더.
//
// Maki 아이콘 이름을 문자열로 넘기면 오타 하나로 마커가 통째로 사라지므로,
// icons/ 폴더의 SVG 를 직접 읽어 유형 색상으로 칠한 뒤 map.addImage() 로 등록한다.

export const TYPES = {
  stay: {
    key: "stay",
    label: "숙소",
    colors: { light: "#60a5fa", base: "#2563eb", dark: "#1e3a8a" },
    defaultIcon: "lodging",
    icons: [
      ["lodging", "호텔"], ["home", "집"], ["campsite", "캠핑"],
      ["suitcase", "여행가방"], ["star", "별"]
    ]
  },
  sight: {
    key: "sight",
    label: "관광 명소",
    colors: { light: "#4ade80", base: "#16a34a", dark: "#14532d" },
    defaultIcon: "monument",
    icons: [
      ["castle", "성·궁"], ["museum", "박물관"], ["art-gallery", "미술관"],
      ["park", "공원"], ["temple", "사찰"], ["church", "교회"],
      ["mountain", "산"], ["beach", "바다"], ["viewpoint", "전망대"],
      ["zoo", "동물원"], ["aquarium", "수족관"], ["monument", "기념물"]
    ]
  },
  food: {
    key: "food",
    label: "현지 맛집",
    colors: { light: "#fb923c", base: "#ea580c", dark: "#7c2d12" },
    defaultIcon: "restaurant",
    icons: [
      ["restaurant", "식당"], ["noodle", "면요리"], ["pizza", "피자"],
      ["seafood", "해산물"], ["fast-food", "패스트푸드"], ["cafe", "카페"],
      ["bakery", "빵"], ["ice-cream", "아이스크림"], ["bar", "바"]
    ]
  },
  activity: {
    key: "activity",
    label: "엑티비티",
    colors: { light: "#a78bfa", base: "#7c3aed", dark: "#4c1d95" },
    defaultIcon: "amusement-park",
    icons: [
      ["amusement-park", "놀이공원"], ["swimming", "수영"], ["bicycle", "자전거"],
      ["skiing", "스키"], ["golf", "골프"], ["theatre", "공연"],
      ["cinema", "영화"], ["shopping", "쇼핑"], ["fitness", "운동"],
      ["picnic", "소풍"], ["playground", "놀이터"], ["cruise", "유람선"]
    ]
  }
};

export const TYPE_ORDER = ["stay", "sight", "food", "activity"];

/** 유형+색조로 실제 색상 코드를 얻는다. shade 는 light | base | dark. */
export function colorOf(type, shade) {
  const t = TYPES[type];
  if (!t) return "#374151";
  return t.colors[shade] || t.colors.base;
}

export function iconLabel(type, icon) {
  const t = TYPES[type];
  if (!t) return icon;
  const found = t.icons.find((pair) => pair[0] === icon);
  return found ? found[1] : icon;
}

// ── SVG 로딩 ───────────────────────────────────────────────────────────────
const svgTextCache = new Map();   // name -> Promise<string>
const imageCache = new Map();     // cacheKey -> Promise<ImageData-like>

function fetchSvgText(name) {
  if (!svgTextCache.has(name)) {
    svgTextCache.set(
      name,
      fetch(`icons/${name}.svg`).then((r) => {
        if (!r.ok) throw new Error(`icon not found: ${name}`);
        return r.text();
      })
    );
  }
  return svgTextCache.get(name);
}

/**
 * 로컬 SVG 를 지정 색상으로 칠해 래스터 이미지로 만든다.
 * Mapbox 의 map.addImage() 에 그대로 넘길 수 있는 {width,height,data} 를 돌려준다.
 */
export async function loadSvgAsImage(name, width, height, color) {
  const cacheKey = `${name}|${width}x${height}|${color}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const promise = (async () => {
    const raw = await fetchSvgText(name);
    const colored = raw.replace(/currentColor/g, color);
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(colored);

    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`icon decode failed: ${name}`));
      el.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height);
    return { width, height, data: data.data };
  })();

  imageCache.set(cacheKey, promise);
  return promise;
}

/** 팝업 미리보기·카드·범례에 쓰는 인라인 SVG 문자열(색상 적용). */
export async function inlineSvg(name, color) {
  const raw = await fetchSvgText(name);
  return raw.replace(/currentColor/g, color);
}

/** 한 장소가 사용할 지도 이미지 ID. 유형·아이콘·색조 조합마다 하나씩 등록된다. */
export function iconKeyOf(place) {
  return `pin-${place.type}-${place.icon}-${place.shade || "base"}`;
}
