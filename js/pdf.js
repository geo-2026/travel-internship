// =====================================================================
//  pdf.js — 2쪽 PDF 만들기 (명세서 §8) + 한글 깨짐 방지 (§9)
//
//  이 모듈과 한글 폰트는 3페이지에 들어올 때 동적으로 불러옵니다 (§12).
//
//  한글 깨짐 방지 체크리스트
//   1. 한글 TTF 를 base64 로 임베딩            → ensureFont()
//   2. KS X 1001 이상 범위로 경량화한 서브셋     → fonts/NotoSansKR-Regular.js
//   3. 모든 텍스트 블록 앞에서 setFont() 재호출  → text() 헬퍼가 매번 호출
//   4. 긴 문장은 splitTextToSize 로 줄바꿈       → text() / paragraph()
//   8. 파일명은 영문·숫자만                      → fileName()
//   9. 지도 라벨 한글 문제는 마커 이미지에 숫자만 그려 회피 (icons.js)
// =====================================================================

import { CONFIG } from "../config.js";
import {
  state, TYPES, orderedPlaces, totalCost
} from "./storage.js";
import * as MapView from "./map.js";
import { formatDistance, formatDuration, isApprox, APPROX_NOTE } from "./route.js";
import { comma } from "./ui.js";

const FONT_NAME = "NotoSansKR";
const FONT_FILE = "NotoSansKR-Regular.ttf";

/* --------------------------------------------------------------------
   라이브러리 · 폰트 준비
   -------------------------------------------------------------------- */
let jsPdfLoading = null;
let fontBase64 = null;
let fontLoading = null;

function loadJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (jsPdfLoading) return jsPdfLoading;

  jsPdfLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CONFIG.CDN.JSPDF;
    s.async = true;
    s.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error("PDF 라이브러리를 불러오지 못했습니다."));
    };
    s.onerror = () => reject(new Error("PDF 라이브러리를 불러오지 못했습니다. 네트워크를 확인해 주세요."));
    document.head.appendChild(s);
  });
  return jsPdfLoading;
}

function loadFont() {
  if (fontBase64) return Promise.resolve(fontBase64);
  if (fontLoading) return fontLoading;

  fontLoading = import("../fonts/NotoSansKR-Regular.js")
    .then((m) => {
      fontBase64 = m.NOTO_SANS_KR_BASE64 || m.default;
      if (!fontBase64) throw new Error("한글 폰트 파일이 비어 있습니다.");
      return fontBase64;
    });
  return fontLoading;
}

/** 3페이지에 들어올 때 미리 받아 둡니다 (저장 버튼을 눌렀을 때 기다리지 않도록) */
export function preload() {
  loadJsPdf().catch(() => {});
  loadFont().catch(() => {});
}

function ensureFont(doc) {
  doc.addFileToVFS(FONT_FILE, fontBase64);
  doc.addFont(FONT_FILE, FONT_NAME, "normal");
  doc.setFont(FONT_NAME, "normal");
}

/* --------------------------------------------------------------------
   폰트에 들어 있는 글자만 남깁니다
   (한자·이모지 등은 서브셋에 없어 빈칸으로 나오므로 미리 걸러냅니다)
   -------------------------------------------------------------------- */
// ★ 이 목록은 fonts/NotoSansKR-Regular.js 의 cmap 을 실제로 읽어 맞춘 값입니다.
//   글자가 있다고 잘못 적으면 그 글자가 PDF 에 빈 네모로 찍힙니다.
//   폰트를 다시 만들었다면 README 7절의 확인 절차로 이 표를 다시 맞추세요.
const RANGES = [
  [0x0020, 0x007e], [0x00a0, 0x00ff],
  [0x2010, 0x2016], [0x2018, 0x201a], [0x201c, 0x201e],
  [0x2022, 0x2022], [0x2026, 0x2026], [0x203b, 0x203b],
  [0x20a9, 0x20a9], [0x20ac, 0x20ac], [0x2190, 0x2193],
  [0x2460, 0x2473], [0x24ea, 0x24ea],
  [0x25a0, 0x25ab], [0x25b1, 0x25b3], [0x25b6, 0x25b7], [0x25bc, 0x25bd],
  [0x25c0, 0x25c1], [0x25c6, 0x25c7], [0x25c9, 0x25cc], [0x25ce, 0x25cf],
  [0x2605, 0x2606], [0x3000, 0x303f],
  [0x3041, 0x3096], [0x3099, 0x30ff],
  [0x3131, 0x318e], [0xac00, 0xd7a3], [0xff01, 0xff5e], [0xffe6, 0xffe6]
];

function inFont(cp) {
  for (const [a, b] of RANGES) if (cp >= a && cp <= b) return true;
  return false;
}

/**
 * NFD 로 분해되지 않아 발음기호만 떼어낼 수 없는 라틴 확장 글자들.
 * (ø·æ·ß 등 라틴-1 보충 영역 글자는 서브셋에 들어 있어 그대로 나옵니다)
 */
const FOLD = {
  "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h",
  "Ŧ": "T", "ŧ": "t", "Œ": "OE", "œ": "oe", "ı": "i", "ĸ": "k",
  "ſ": "s", "ŉ": "n", "Ə": "E", "ə": "e"
};

/**
 * 폰트에 없는 라틴 글자를 기본 알파벳으로 바꿉니다. (ū→u, ō→o, ș→s)
 * 일본·유럽 지명의 로마자 표기에 자주 나오므로, 그냥 지우면
 * "Chūō Ward" 가 "Ch Ward" 로 찍힙니다.
 * ★ 한글 음절은 이미 폰트에 있어 이 함수까지 오지 않습니다.
 *   (오면 NFD 가 자모로 분해해 버리므로 반드시 inFont 검사를 먼저 할 것)
 */
function foldLatin(ch) {
  if (FOLD[ch]) return FOLD[ch];
  const d = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");   // 결합 발음기호 제거
  return d === ch ? "" : d;
}

/** 폰트에 없는 글자를 대체하거나 지웁니다. 남는 글자가 없으면 빈 문자열. */
export function pdfSafe(s) {
  const str = String(s == null ? "" : s);
  let out = "";
  for (const ch of str) {
    if (inFont(ch.codePointAt(0))) { out += ch; continue; }
    for (const f of foldLatin(ch)) {
      if (inFont(f.codePointAt(0))) out += f;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/** ① ~ ⑳ (그 밖은 "21." 처럼) */
function circledNum(n) {
  if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  return `${n}.`;
}

/* --------------------------------------------------------------------
   문서 도우미
   -------------------------------------------------------------------- */
const PAGE_W = 210;
const PAGE_H = 297;
const M = 15;               // 여백
const CONTENT_W = PAGE_W - M * 2;
const FOOT_Y = PAGE_H - 10;

const ATTRIBUTION =
  "지도 데이터 © MapTiler © OpenStreetMap contributors · 경로 © openrouteservice";

function hexToRgb(hex) {
  const h = String(hex || "#6b7280").replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(v.slice(0, 2), 16) || 0,
    parseInt(v.slice(2, 4), 16) || 0,
    parseInt(v.slice(4, 6), 16) || 0
  ];
}

function makeDoc(jsPDF) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  ensureFont(doc);
  return doc;
}

/**
 * 텍스트 한 줄(또는 여러 줄)을 그립니다.
 * ★ 표·헤더에서 폰트가 초기화되는 사례가 잦아 매번 setFont 를 호출합니다 (§9-3).
 */
function text(doc, str, x, y, { size = 10, color = [17, 24, 39], maxWidth, align = "left" } = {}) {
  const safe = pdfSafe(str);
  if (!safe) return y;

  doc.setFont(FONT_NAME, "normal");   // ← 매 블록마다 재호출
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);

  const lines = maxWidth ? doc.splitTextToSize(safe, maxWidth) : [safe];
  doc.text(lines, x, y, { align });

  const lh = size * 0.3528 * 1.35;    // pt → mm, 줄간격 1.35
  return y + lines.length * lh;
}

function hr(doc, y, color = [229, 231, 235]) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  return y + 1;
}

function dot(doc, x, y, r, hex) {
  const [rr, gg, bb] = hexToRgb(hex);
  doc.setFillColor(rr, gg, bb);
  doc.circle(x, y, r, "F");
}

function pageHeader(doc) {
  text(doc, CONFIG.APP_TITLE, M, 13, { size: 9, color: [107, 114, 128] });
  return hr(doc, 15.5);
}

function pageFooter(doc) {
  text(doc, ATTRIBUTION, PAGE_W / 2, FOOT_Y, {
    size: 7.5, color: [107, 114, 128], align: "center", maxWidth: CONTENT_W
  });
}

/* --------------------------------------------------------------------
   1쪽 — 표지 + 지도 + 번호 범례 (§8-1)
   -------------------------------------------------------------------- */
function drawPage1(doc, mapImage, list) {
  let y = pageHeader(doc);

  // 여행 명칭
  y = text(doc, state.trip.title || "여행 계획", M, y + 10, { size: 21 });

  // 학번 · 이름
  y = text(doc,
    `${state.trip.studentId || ""}  ${state.trip.studentName || ""}` +
    (state.trip.city ? `   ·   ${state.trip.city.nameKo}` +
      (state.trip.city.country ? ` (${state.trip.city.country})` : "") : ""),
    M, y + 3, { size: 11, color: [55, 65, 81] });

  y += 5;

  // 지도 이미지 (4:3)
  const imgW = CONTENT_W;
  const imgH = imgW * 0.75;

  if (mapImage) {
    try {
      doc.addImage(mapImage, "PNG", M, y, imgW, imgH, undefined, "FAST");
    } catch (e) {
      console.warn("[pdf] 지도 이미지 삽입 실패", e);
      drawMapPlaceholder(doc, M, y, imgW, imgH);
    }
  } else {
    drawMapPlaceholder(doc, M, y, imgW, imgH);
  }
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.rect(M, y, imgW, imgH);
  y += imgH + 8;

  if (isApprox(state.transport.localModes)) {
    y = text(doc, `※ ${APPROX_NOTE} — 실제 대중교통 노선과 다를 수 있습니다.`, M, y,
      { size: 8.5, color: [146, 64, 14], maxWidth: CONTENT_W });
    y += 1;
  }
  if (state.route && state.route.straight) {
    y = text(doc, "※ 경로를 불러오지 못해 방문지를 잇는 직선으로 표시했습니다.", M, y,
      { size: 8.5, color: [146, 64, 14], maxWidth: CONTENT_W });
    y += 1;
  }

  // 번호 범례 — 20곳까지 2단으로
  y = text(doc, "방문 순서", M, y + 4, { size: 12 });
  y = hr(doc, y + 1) + 4;

  const twoCol = list.length > 10;
  const colW = twoCol ? (CONTENT_W - 6) / 2 : CONTENT_W;
  const rowH = 6.2;
  const perCol = twoCol ? Math.ceil(list.length / 2) : list.length;

  list.forEach((p, i) => {
    const col = twoCol ? Math.floor(i / perCol) : 0;
    const row = twoCol ? i % perCol : i;
    const x = M + col * (colW + 6);
    const ly = y + row * rowH;

    text(doc, circledNum(p.order), x, ly, { size: 10 });
    dot(doc, x + 7.5, ly - 1.2, 1.5, p.color);

    const label = `${p.name}  (${(TYPES[p.type] || {}).label || ""})`;
    text(doc, label, x + 10.5, ly, { size: 9.5, color: [31, 41, 55], maxWidth: colW - 11 });
  });

  pageFooter(doc);
}

function drawMapPlaceholder(doc, x, y, w, h) {
  doc.setFillColor(243, 244, 246);
  doc.rect(x, y, w, h, "F");
  text(doc, "지도 이미지를 만들지 못했습니다.", x + w / 2, y + h / 2,
    { size: 10, color: [107, 114, 128], align: "center" });
}

/* --------------------------------------------------------------------
   2쪽 — 비용 · 이동수단 · 방문지 상세 (§8-1)
   -------------------------------------------------------------------- */
function drawPage2(doc, list) {
  doc.addPage();
  let y = pageHeader(doc);
  y += 8;

  /* ---- 비용 · 거리 요약 ---- */
  y = text(doc, "여행 요약", M, y, { size: 13 });
  y = hr(doc, y + 1) + 5;

  const rows = [];
  if (state.transport.isInternational) {
    rows.push(["왕복 항공료", `${comma(state.transport.flightCostKRW)}원`]);
  }
  rows.push(["총 이용 비용 (항공료 제외)", `${comma(totalCost())}원`]);
  rows.push([
    "총 이동 거리 · 시간",
    state.route
      ? `${formatDistance(state.route.distanceM)} / ${formatDuration(state.route.durationS)}`
      : "-"
  ]);
  rows.push(["방문지 수", `${list.length}곳`]);

  rows.forEach(([k, v]) => {
    text(doc, k, M, y, { size: 10, color: [55, 65, 81] });
    text(doc, v, PAGE_W - M, y, { size: 11, align: "right" });
    y += 6.4;
    doc.setDrawColor(243, 244, 246);
    doc.setLineWidth(0.2);
    doc.line(M, y - 2.4, PAGE_W - M, y - 2.4);
  });

  /* ---- 이동 수단 ---- */
  y += 6;
  y = text(doc, "이동 수단 및 주의점", M, y, { size: 13 });
  y = hr(doc, y + 1) + 5;

  const modeLabel = {
    public: "대중교통",
    walk: "도보"
  };
  const modes = (state.transport.localModes || []).map((m) => modeLabel[m] || m);
  y = text(doc, `이용 수단 : ${modes.length ? modes.join(", ") : "선택하지 않음"}`,
    M, y, { size: 10, color: [31, 41, 55] });

  if (isApprox(state.transport.localModes)) {
    y = text(doc, `※ ${APPROX_NOTE}`, M, y + 1.5,
      { size: 9, color: [146, 64, 14], maxWidth: CONTENT_W });
  }

  if (state.transport.cautions) {
    y = text(doc, state.transport.cautions, M, y + 2,
      { size: 10, color: [55, 65, 81], maxWidth: CONTENT_W });
  }

  /* ---- 방문 순서별 상세 ---- */
  y += 8;
  y = text(doc, "방문 순서별 상세", M, y, { size: 13 });
  y = hr(doc, y + 1) + 5;

  const ensure = (need) => {
    if (y + need > FOOT_Y - 8) {
      pageFooter(doc);
      doc.addPage();
      y = pageHeader(doc) + 8;
    }
  };

  list.forEach((p) => {
    const lines = detailLines(p);
    ensure(12 + lines.length * 5);

    // 머리 줄
    text(doc, circledNum(p.order), M, y, { size: 11 });
    dot(doc, M + 8, y - 1.3, 1.6, p.color);
    text(doc, p.name, M + 11.5, y, { size: 11, maxWidth: CONTENT_W - 45 });
    text(doc, (TYPES[p.type] || {}).label || "", PAGE_W - M, y,
      { size: 9, color: [107, 114, 128], align: "right" });
    y += 5.4;

    lines.forEach(([k, v]) => {
      const before = y;
      text(doc, k, M + 4, y, { size: 8.8, color: [107, 114, 128] });
      y = text(doc, v, M + 32, y, { size: 9.5, color: [31, 41, 55], maxWidth: CONTENT_W - 36 });
      y = Math.max(y, before + 4.6);
    });

    y += 3;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(M, y - 1.5, PAGE_W - M, y - 1.5);
    y += 2.5;
  });

  /* ---- 생성 일시 ---- */
  ensure(12);
  y += 2;
  text(doc, `생성 일시 : ${formatNow()}`, M, y, { size: 8.5, color: [107, 114, 128] });

  pageFooter(doc);
}

/** 유형별 상세 항목을 [항목명, 내용] 목록으로 (§6-5 ~ §6-8) */
function detailLines(p) {
  const d = p.detail || {};
  const out = [];

  const searched = pdfSafe(p.searchedName);
  if (searched && searched !== pdfSafe(p.name)) out.push(["검색된 명칭", searched]);

  if (p.priceKRW > 0) out.push(["가격", `${comma(p.priceKRW)}원`]);

  switch (p.type) {
    case "stay":
      if (d.roomName) out.push(["객실명", d.roomName]);
      if (d.note) out.push(["소개", d.note]);
      break;
    case "sight":
      if (d.highlight) out.push(["주요 볼거리", d.highlight]);
      if (d.access) out.push(["이동 방법", d.access]);
      if (d.note) out.push(["소개", d.note]);
      break;
    case "food":
      if (d.food1 || d.food2) {
        out.push(["주요 음식", [d.food1, d.food2].filter(Boolean).join(", ")]);
      }
      if (d.access) out.push(["이동 방법", d.access]);
      if (d.note) out.push(["소개", d.note]);
      break;
    case "activity":
      if (d.venue) out.push(["이용 장소", d.venue]);
      if (d.access) out.push(["이동 방법", d.access]);
      if (d.note) out.push(["소개", d.note]);
      break;
  }

  if (p.address) out.push(["주소", p.address]);
  return out.filter(([, v]) => pdfSafe(v));
}

function formatNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* --------------------------------------------------------------------
   파일명 — 영문·숫자만 (§9-8)
   -------------------------------------------------------------------- */
export function fileName() {
  const id = String(state.trip.studentId || "").replace(/[^0-9A-Za-z]/g, "");
  return `travel_internship_${id || "student"}.pdf`;
}

/* --------------------------------------------------------------------
   메인
   -------------------------------------------------------------------- */
export async function buildAndSave() {
  const [jsPDF] = await Promise.all([loadJsPdf(), loadFont()]);

  const list = orderedPlaces();

  // 지도 캡처 — 실패하면 §8-3 정적 지도 폴백
  let mapImage = await MapView.captureForPdf(list);
  if (!mapImage) {
    console.info("[pdf] 캔버스 캡처 실패 → 정적 지도 폴백을 시도합니다.");
    mapImage = await MapView.staticMapFallback(list);
  }

  const doc = makeDoc(jsPDF);
  drawPage1(doc, mapImage, list);
  drawPage2(doc, list);

  doc.save(fileName());
  return true;
}
