// pdf.js — 2쪽짜리 결과물 생성. 3페이지에 들어올 때 처음 import 된다(§12).
//
// 한글이 깨지는 원인은 폰트 미임베딩뿐이므로(§9) 모든 텍스트 출력 앞에서
// setFont("NotoSansKR") 를 다시 부른다. 표·머리말에서 폰트가 초기화되어
// 일부만 깨지는 사고를 막기 위한 것이다.

import { CONFIG, hasToken } from "../config.js";
import { TYPES, colorOf, iconLabel } from "./icons.js";
import * as MapView from "./map.js";
import { formatKRW } from "./ui.js";
import { formatDistance, formatDuration, needsTransitNotice, TRANSIT_NOTICE } from "./route.js";

const FONT_NAME = "NotoSansKR";
const FONT_FILE = "NotoSansKR-Regular.ttf";
const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── 라이브러리 로딩 ────────────────────────────────────────────────────────

function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/jspdf.umd.min.js";
    s.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error("jsPDF 를 불러오지 못했습니다."));
    };
    s.onerror = () => reject(new Error("jsPDF 파일을 찾지 못했습니다. (vendor/jspdf.umd.min.js)"));
    document.head.appendChild(s);
  });
}

// ── 지도 이미지 ────────────────────────────────────────────────────────────

/** 캔버스 캡처(기본). 타일이 다 그려질 때까지 기다린 뒤 찍는다(§8-2). */
async function captureMapCanvas(places) {
  const map = MapView.getMap();
  if (!map) throw new Error("map not ready");
  return MapView.withCaptureSize(async () => {
    MapView.fitToPlaces(places, 60);
    await MapView.waitForIdle();
    const dataUrl = map.getCanvas().toDataURL("image/png");
    if (!dataUrl || dataUrl.length < 5000) throw new Error("빈 캔버스");
    return dataUrl;
  });
}

// Google polyline (precision 5) — Static Images API 의 path 인자용.
function encodePolyline(coords) {
  let lastLat = 0;
  let lastLon = 0;
  let out = "";
  const chunk = (v) => {
    let value = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (value >= 0x20) {
      s += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    return s + String.fromCharCode(value + 63);
  };
  coords.forEach(([lon, lat]) => {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    out += chunk(la - lastLat) + chunk(lo - lastLon);
    lastLat = la;
    lastLon = lo;
  });
  return out;
}

/** Douglas-Peucker — URL 8,192자 제한을 넘지 않도록 경로를 줄인다(§8-3). */
function simplify(coords, tolerance) {
  if (coords.length < 3) return coords;
  const sqDist = (p, a, b) => {
    let [x, y] = a;
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Array(coords.length).fill(false);
  keep[0] = keep[coords.length - 1] = true;
  const stack = [[0, coords.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqDist(coords[i], coords[first], coords[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = true;
      stack.push([first, idx], [idx, last]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/** 폴백 — Static Images API. 라벨은 숫자만 쓸 수 있다(§8-3). */
async function staticMapImage(places, routeGeometry) {
  if (!hasToken()) throw new Error("토큰 없음");
  const base = "https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/";
  const suffix = `/auto/1000x750@2x?access_token=${encodeURIComponent(CONFIG.MAPBOX_TOKEN)}&language=ko`;

  const pins = places.slice(0, 20).map((p, i) => {
    const color = colorOf(p.type, p.shade || "base").replace("#", "");
    const label = i + 1 <= 99 ? i + 1 : "";
    return `pin-s-${label}+${color}(${p.coord[0].toFixed(5)},${p.coord[1].toFixed(5)})`;
  });

  const buildUrl = (overlayParts) => base + overlayParts.join(",") + suffix;

  let overlays = pins.slice();
  if (routeGeometry && routeGeometry.coordinates && routeGeometry.coordinates.length > 1) {
    let coords = routeGeometry.coordinates;
    let tolerance = 0.00005;
    for (let i = 0; i < 8; i++) {
      const encoded = encodePolyline(simplify(coords, tolerance));
      const candidate = [`path-4+2563eb-0.9(${encodeURIComponent(encoded)})`, ...pins];
      if (buildUrl(candidate).length <= 8192) { overlays = candidate; break; }
      tolerance *= 3;
    }
  }

  let url = buildUrl(overlays);
  if (url.length > 8192) url = buildUrl(pins);   // 그래도 길면 경로 생략, 마커만

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Static Images ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("정적 지도 이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

// ── 아이콘 래스터화 (PDF 범례용) ────────────────────────────────────────────

const iconPngCache = new Map();
async function iconPng(name, color, size = 48) {
  const key = `${name}|${color}|${size}`;
  if (iconPngCache.has(key)) return iconPngCache.get(key);
  const raw = await fetch(`icons/${name}.svg`).then((r) => r.text());
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(raw.replace(/currentColor/g, color));
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("icon"));
    im.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * 0.75);
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/png");
  iconPngCache.set(key, dataUrl);
  return dataUrl;
}

/** ①~⑳. 서브셋 폰트에 U+2460~2473 을 포함해 두었다. 그 밖은 "21." 형태로. */
function circledNumber(n) {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `${n}.`;
}

// ── 본문 ───────────────────────────────────────────────────────────────────

export async function generatePdf(state, routeState) {
  const jsPDFCtor = await loadJsPDF();
  const { NOTO_SANS_KR_BASE64 } = await import("../fonts/NotoSansKR-Regular.js");

  const doc = new jsPDFCtor({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.addFileToVFS(FONT_FILE, NOTO_SANS_KR_BASE64);
  doc.addFont(FONT_FILE, FONT_NAME, "normal");

  // 모든 텍스트 출력 앞에서 폰트를 다시 지정한다(§9-3).
  const text = (str, x, y, opts = {}) => {
    doc.setFont(FONT_NAME, "normal");
    doc.setFontSize(opts.size || 10);
    doc.setTextColor(opts.color || "#111827");
    doc.text(String(str == null ? "" : str), x, y, opts.align ? { align: opts.align } : undefined);
  };

  /** 한글은 자동 줄바꿈되지 않으므로 반드시 splitTextToSize 로 자른다(§9-4). */
  const paragraph = (str, x, y, width, opts = {}) => {
    doc.setFont(FONT_NAME, "normal");
    doc.setFontSize(opts.size || 10);
    doc.setTextColor(opts.color || "#374151");
    const lines = doc.splitTextToSize(String(str || ""), width);
    doc.text(lines, x, y);
    return y + lines.length * (opts.lineHeight || (opts.size || 10) * 0.42 + 1.4);
  };

  const footer = () => {
    doc.setFont(FONT_NAME, "normal");
    doc.setFontSize(8);
    doc.setTextColor("#6b7280");
    doc.text("지도 데이터 © Mapbox © OpenStreetMap", MARGIN, PAGE_H - 10);
  };

  const places = state.places;
  const trip = state.trip;

  // ── 1쪽 ─────────────────────────────────────────────────────────────────
  text(CONFIG.APP_TITLE, MARGIN, 14, { size: 10, color: "#6b7280" });
  doc.setDrawColor("#d1d5db");
  doc.line(MARGIN, 17, PAGE_W - MARGIN, 17);

  text(trip.title || "여행 계획", MARGIN, 28, { size: 19, color: "#111827" });
  text(`${trip.studentId || ""}  ${trip.studentName || ""}`, MARGIN, 36, { size: 11, color: "#374151" });
  if (trip.city) {
    text(`여행 도시: ${trip.city.nameKo} (${trip.city.country})`, MARGIN, 43, { size: 10, color: "#374151" });
  }

  // 지도 이미지 — 캔버스 캡처 우선, 실패 시 Static Images 폴백
  const mapY = 48;
  const mapH = Math.round((CONTENT_W * 3) / 4);
  let mapImage = null;
  try {
    mapImage = await captureMapCanvas(places);
  } catch (err) {
    console.warn("캔버스 캡처 실패 — Static Images 로 대체합니다.", err);
    try {
      mapImage = await staticMapImage(places, routeState && routeState.geometry);
    } catch (err2) {
      console.warn("정적 지도도 실패했습니다.", err2);
    }
  }

  if (mapImage) {
    doc.addImage(mapImage, "PNG", MARGIN, mapY, CONTENT_W, mapH);
    doc.setDrawColor("#9ca3af");
    doc.rect(MARGIN, mapY, CONTENT_W, mapH);
  } else {
    doc.setFillColor("#f3f4f6");
    doc.rect(MARGIN, mapY, CONTENT_W, mapH, "F");
    text("지도 이미지를 만들지 못했습니다.", PAGE_W / 2, mapY + mapH / 2, { size: 10, align: "center", color: "#6b7280" });
  }

  // 번호 범례
  let y = mapY + mapH + 10;
  text("방문 순서", MARGIN, y, { size: 12 });
  y += 6;

  for (const p of places) {
    if (y > PAGE_H - 22) break;              // 1쪽을 넘기지 않는다
    const color = colorOf(p.type, p.shade || "base");
    try {
      const png = await iconPng(p.icon, color, 48);
      doc.addImage(png, "PNG", MARGIN, y - 4.2, 4.2, 5.6);
    } catch {
      doc.setFillColor(color);
      doc.circle(MARGIN + 2, y - 1.5, 1.8, "F");
    }
    text(circledNumber(p.order), MARGIN + 6, y, { size: 10, color: "#111827" });
    text(p.name, MARGIN + 12, y, { size: 10 });
    text(`(${TYPES[p.type].label})`, MARGIN + 12 + doc.getTextWidth(p.name) + 2, y, { size: 9, color: "#6b7280" });
    y += 6.4;
  }
  if (places.length && y > PAGE_H - 22) {
    text("… 이하 항목은 2쪽에서 확인하세요.", MARGIN, y, { size: 9, color: "#6b7280" });
  }
  footer();

  // ── 2쪽 ─────────────────────────────────────────────────────────────────
  doc.addPage();
  text(CONFIG.APP_TITLE, MARGIN, 14, { size: 10, color: "#6b7280" });
  doc.setDrawColor("#d1d5db");
  doc.line(MARGIN, 17, PAGE_W - MARGIN, 17);

  y = 27;
  text("여행 비용과 이동", MARGIN, y, { size: 13 });
  y += 8;

  const summaryRows = [];
  if (state.transport.isInternational) {
    summaryRows.push(["왕복 항공료", `${formatKRW(state.transport.flightCostKRW)}원`]);
  }
  const totalCost = places.reduce((s, p) => s + (Number(p.priceKRW) || 0), 0);
  summaryRows.push(["총 이용 비용 (항공료 제외)", `${formatKRW(totalCost)}원`]);
  summaryRows.push([
    "총 이동 거리 / 시간",
    !routeState || routeState.distanceM == null
      ? "계산되지 않음"
      : routeState.fallback
        ? `${formatDistance(routeState.distanceM)} (직선 기준 근사)`
        : `${formatDistance(routeState.distanceM)} / ${formatDuration(routeState.durationS)}`
  ]);

  const modeLabels = { public: "대중교통", walk: "도보" };
  summaryRows.push([
    "이동 수단",
    (state.transport.localModes || []).map((m) => modeLabels[m] || m).join(", ") || "선택하지 않음"
  ]);

  summaryRows.forEach(([label, value]) => {
    text(label, MARGIN, y, { size: 10, color: "#6b7280" });
    text(value, PAGE_W - MARGIN, y, { size: 10, align: "right" });
    doc.setDrawColor("#e5e7eb");
    doc.line(MARGIN, y + 1.8, PAGE_W - MARGIN, y + 1.8);
    y += 8;
  });

  if (needsTransitNotice(state.transport.localModes)) {
    y += 1;
    y = paragraph(`※ ${TRANSIT_NOTICE} — 실제 지하철·버스 노선과 다를 수 있습니다.`,
                  MARGIN, y, CONTENT_W, { size: 9, color: "#b45309" });
  }

  if (state.transport.cautions) {
    y += 3;
    text("이동 수단 사용의 주의점", MARGIN, y, { size: 10 });
    y += 5;
    y = paragraph(state.transport.cautions, MARGIN, y, CONTENT_W, { size: 9.5 });
  }

  y += 6;
  text("방문 순서별 상세", MARGIN, y, { size: 13 });
  y += 8;

  // 화면 팝업과 같은 순서로 찍는다 — 학생이 입력한 차례대로 읽히도록.
  const DETAIL_ORDER = {
    stay: [["roomName", "객실명"], ["note", "숙소 소개"]],
    sight: [["highlights", "주요 볼거리"], ["access", "이동 방법"], ["note", "관광지 소개"]],
    food: [["food1", "주요 음식 1"], ["food2", "주요 음식 2"], ["access", "이동 방법"], ["note", "맛집 소개"]],
    activity: [["venue", "이용 장소"], ["access", "이동 방법"], ["note", "액티비티 소개"]]
  };

  for (const p of places) {
    if (y > PAGE_H - 30) {
      footer();
      doc.addPage();
      text(CONFIG.APP_TITLE, MARGIN, 14, { size: 10, color: "#6b7280" });
      y = 27;
    }
    const color = colorOf(p.type, p.shade || "base");
    doc.setFillColor(color);
    doc.circle(MARGIN + 1.8, y - 1.4, 1.8, "F");

    text(`${p.order}. ${p.name}`, MARGIN + 6, y, { size: 11 });
    text(`${TYPES[p.type].label} · ${iconLabel(p.type, p.icon)}`, MARGIN + 6, y + 5, { size: 8.5, color: "#6b7280" });
    text(`${formatKRW(p.priceKRW)}원`, PAGE_W - MARGIN, y, { size: 10.5, align: "right" });
    y += 10;

    const detail = p.detail || {};
    for (const [key, label] of DETAIL_ORDER[p.type] || []) {
      const value = detail[key];
      if (!value) continue;
      text(label, MARGIN + 6, y, { size: 8.5, color: "#6b7280" });
      y = paragraph(value, MARGIN + 30, y, CONTENT_W - 30, { size: 9.5 }) + 0.5;
    }
    y += 3;
    doc.setDrawColor("#f3f4f6");
    doc.line(MARGIN, y - 1.5, PAGE_W - MARGIN, y - 1.5);
    y += 1.5;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ` +
                `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 생성`;
  text(stamp, PAGE_W - MARGIN, PAGE_H - 16, { size: 8.5, align: "right", color: "#6b7280" });
  footer();

  // 파일명은 영문·숫자만 — 일부 모바일에서 한글 파일명이 깨진다(§9-8).
  const safeId = String(trip.studentId || "student").replace(/[^A-Za-z0-9_-]/g, "") || "student";
  doc.save(`travel_internship_${safeId}.pdf`);
}
