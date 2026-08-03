// =====================================================================
//  popups.js — 팝업 5종
//   · 이동방법                    (§5-1)
//   · 숙소 / 관광명소 / 맛집 / 엑티비티  (§6-5 ~ §6-8)
//
//  네 유형 팝업은 위쪽에 공통 검색 UI(§6-1)와 아이콘·색상 선택(§6-4)을 둡니다.
// =====================================================================

import { CONFIG } from "../config.js";
import {
  state, TYPES, colorOf, makeId, findPlace, addPlace, updatePlace,
  commit, isFull
} from "./storage.js";
import { ICON_LABELS, iconSvg, pinSvg, safeIcon } from "./icons.js";
import { searchPlaces, SearchLimitError, applyAlias, loadAliases } from "./search.js";
import * as MapView from "./map.js";
import { openModal, confirmDialog } from "./modal.js";
import {
  el, field, toast, attachPriceMask, priceValue, comma, sameSpot, josa
} from "./ui.js";

/* =====================================================================
   1) 이동방법 팝업 (§5-1)
   ===================================================================== */
export function openTransportPopup(onDone) {
  const t = state.transport;
  const intl = t.isInternational;

  let flightInput = null;
  let modes = new Set(t.localModes);
  let cautions = t.cautions;
  let dirty = false;
  const markDirty = () => { dirty = true; };

  openModal({
    title: "이동방법",
    color: "#374151",
    isDirty: () => dirty,

    render(body) {
      // ── 왕복 항공료 (국내 여행이면 숨김 — §4)
      if (intl) {
        const f = field({
          label: "왕복 항공료",
          id: "tpFlight",
          inputmode: "numeric",
          value: t.flightCostKRW ? comma(t.flightCostKRW) : "",
          placeholder: "예) 480,000",
          help: "단위는 원입니다. 총 이용 비용에는 합산되지 않고 PDF에 따로 표기됩니다."
        });
        attachPriceMask(f.input);
        f.input.addEventListener("input", markDirty);
        flightInput = f.input;
        body.appendChild(f.wrap);
      } else {
        body.appendChild(el("p", {
          class: "field__help",
          text: "국내 여행이라 항공료 항목은 표시하지 않습니다.",
          style: { marginBottom: "16px" }
        }));
      }

      // ── 이동수단 (복수 선택)
      const w = el("div", { class: "field" });
      w.appendChild(el("label", { class: "field__label", text: "해당 도시에서의 이동수단" }));
      w.appendChild(el("p", {
        class: "field__help",
        text: "고른 이동수단에 따라 3단계의 경로가 도보 또는 도로 기준으로 계산됩니다."
      }));

      const box = el("div", { class: "checks" });
      [["public", "대중교통"], ["walk", "도보"]].forEach(([key, label]) => {
        const cb = el("input", { type: "checkbox" });
        cb.checked = modes.has(key);
        const wrapper = el("label", { class: "check" + (cb.checked ? " is-on" : "") }, [cb, label]);
        cb.addEventListener("change", () => {
          if (cb.checked) modes.add(key); else modes.delete(key);
          wrapper.classList.toggle("is-on", cb.checked);
          markDirty();
        });
        box.appendChild(wrapper);
      });
      w.appendChild(box);
      body.appendChild(w);

      // ── 주의점
      const c = field({
        label: "이동 수단 사용의 주의점",
        id: "tpCautions",
        type: "textarea",
        rows: 4,
        maxlength: 300,
        value: cautions,
        placeholder: "예) 지하철 1일권 구입, 러시아워 혼잡 주의",
        help: "최대 300자"
      });
      c.input.addEventListener("input", () => { cautions = c.input.value; markDirty(); });
      body.appendChild(c.wrap);

      body.appendChild(el("p", {
        class: "privacy-note",
        text: "⚠ 무료 경로 서비스에는 대중교통 노선 정보가 없습니다. " +
              "대중교통을 고르면 도로(자동차) 기준 근사 경로로 표시되며, 지도와 PDF에 그 사실이 함께 표기됩니다."
      }));
    },

    onApply() {
      state.transport.flightCostKRW = intl && flightInput ? priceValue(flightInput) : 0;
      state.transport.localModes = Array.from(modes);
      state.transport.cautions = cautions.slice(0, 300);
      commit("transport", true);
      toast("이동방법을 저장했습니다.", "ok");
      if (onDone) onDone();
      return true;
    }
  });
}

/* =====================================================================
   2) 방문지 팝업 (숙소 · 관광명소 · 맛집 · 엑티비티)
   ===================================================================== */

const TITLES = {
  stay: { add: "숙소 추가", edit: "숙소 수정", nameLabel: "숙소명" },
  sight: { add: "관광 명소 추가", edit: "관광 명소 수정", nameLabel: "관광지명" },
  food: { add: "현지 맛집 추가", edit: "현지 맛집 수정", nameLabel: "현지 맛집명" },
  activity: { add: "엑티비티 추가", edit: "엑티비티 수정", nameLabel: "엑티비티명" }
};

/**
 * @param {"stay"|"sight"|"food"|"activity"} type
 * @param {string|null} placeId  수정 모드면 기존 id
 * @param {Function} onDone
 */
export function openPlacePopup(type, placeId, onDone) {
  const meta = TYPES[type];
  const titles = TITLES[type];
  const editing = placeId ? findPlace(placeId) : null;

  if (!editing && isFull()) {
    toast(`방문지는 최대 ${CONFIG.MAX_PLACES}개까지 추가할 수 있습니다.`, "err");
    return;
  }

  // ── 작업 중인 값
  const draft = {
    name: editing ? editing.name : "",
    searchedName: editing ? editing.searchedName : "",
    coord: editing ? [...editing.coord] : null,
    address: editing ? editing.address : "",
    source: editing ? editing.source : "manual",
    priceKRW: editing ? editing.priceKRW : 0,
    icon: editing ? safeIcon(type, editing.icon) : meta.defaultIcon,
    tone: editing ? editing.tone : "base",
    detail: editing ? { ...editing.detail } : {}
  };

  let dirty = false;
  const markDirty = () => { dirty = true; };

  let nameInput = null;
  let venueInput = null;   // 엑티비티 전용 — 이용 장소
  let priceInput = null;
  let coordNote = null;
  let previewBox = null;
  let modalApi = null;

  /* -------- 미리보기 갱신 -------- */
  function refreshPreview() {
    if (!previewBox) return;
    const color = colorOf(type, draft.tone);
    const pin = previewBox.querySelector(".preview__pin");
    const nm = previewBox.querySelector(".preview__name");
    pin.innerHTML = pinSvg(color, draft.icon);
    const label = draft.name || (type === "activity" ? draft.detail.venue : "") || "";
    nm.textContent = label || "이름을 입력하세요";
    nm.classList.toggle("preview__ph", !label);
  }

  function refreshCoordNote() {
    if (!coordNote) return;
    if (draft.coord) {
      coordNote.className = "coord-note";
      const how = draft.source === "manual" ? "지도에서 직접 지정"
                : draft.source === "maptiler" ? "MapTiler 검색"
                : "검색 결과";
      coordNote.textContent =
        `📍 위치가 지정되었습니다 (${how}) · ` +
        `${draft.coord[1].toFixed(5)}, ${draft.coord[0].toFixed(5)}`;
    } else {
      coordNote.className = "coord-note is-missing";
      coordNote.textContent = "📍 아직 위치가 지정되지 않았습니다. 검색하거나 지도에서 직접 지정해 주세요.";
    }
  }

  /* -------- 검색 결과를 골랐을 때 -------- */
  function applyResult(r) {
    draft.coord = r.coord;
    draft.address = r.address || r.where || "";
    draft.searchedName = r.name || "";
    draft.source = r.source === "maptiler" ? "maptiler" : "photon";

    if (type === "activity") {
      // 엑티비티는 '이용 장소'가 자동 입력되고, 명칭은 학생이 직접 씁니다
      draft.detail.venue = r.name || "";
      if (venueInput) venueInput.value = draft.detail.venue;
      if (nameInput && !nameInput.value.trim()) {
        nameInput.value = r.name || "";
        draft.name = nameInput.value;
      }
    } else {
      draft.name = r.name || "";
      if (nameInput) nameInput.value = draft.name;
    }

    markDirty();
    refreshCoordNote();
    refreshPreview();

    MapView.setPreview(draft.coord);
    MapView.flyTo(draft.coord);
    toast("위치를 지도에 표시했습니다.", "ok");
  }

  /* -------- 지도에서 직접 위치 지정 (§6-2-4) -------- */
  async function pickOnMap() {
    if (!MapView.mapExists()) {
      toast("지도가 아직 준비되지 않았습니다.", "err");
      return;
    }
    modalApi.hide();
    const coord = await MapView.startPick();
    modalApi.show();

    if (!coord) return;
    draft.coord = coord;
    draft.source = "manual";
    draft.address = "";
    draft.searchedName = "";
    markDirty();
    refreshCoordNote();
    MapView.setPreview(coord);
    toast("지도에서 위치를 지정했습니다.", "ok");
  }

  /* ================= 렌더 ================= */
  modalApi = openModal({
    title: editing ? titles.edit : titles.add,
    color: meta.color,
    isDirty: () => dirty,

    render(body) {
      /* ---------- 공통 검색 UI (§6-1) ---------- */
      body.appendChild(buildSearchUI({
        onPick: applyResult,
        onManual: pickOnMap
      }));

      /* ---------- 엑티비티: 명칭이 먼저 ---------- */
      if (type === "activity") {
        const f = field({
          label: "엑티비티 명칭", id: "pName", required: true, maxlength: 60,
          value: draft.name, placeholder: "예) 유람선 야경 투어",
          help: "학생이 직접 적는 이름입니다. 지도 팝업과 PDF에 이 이름이 표시됩니다."
        });
        f.input.addEventListener("input", () => {
          draft.name = f.input.value; markDirty(); refreshPreview();
        });
        nameInput = f.input;
        body.appendChild(f.wrap);

        const v = field({
          label: "액티비티 이용 장소", id: "pVenue", maxlength: 100,
          value: draft.detail.venue || "", placeholder: "위에서 검색하면 자동으로 입력됩니다",
          help: "검색 결과를 고르면 자동 입력되며, 직접 고쳐 쓸 수 있습니다."
        });
        v.input.addEventListener("input", () => {
          draft.detail.venue = v.input.value; markDirty(); refreshPreview();
        });
        venueInput = v.input;
        body.appendChild(v.wrap);
      } else {
        const f = field({
          label: titles.nameLabel, id: "pName", required: true, maxlength: 60,
          value: draft.name, placeholder: "위에서 검색하면 자동으로 입력됩니다",
          help: "검색 결과를 고르면 자동 입력되며, 한글로 고쳐 쓸 수 있습니다."
        });
        f.input.addEventListener("input", () => {
          draft.name = f.input.value; markDirty(); refreshPreview();
        });
        nameInput = f.input;
        body.appendChild(f.wrap);
      }

      /* ---------- 위치 상태 ---------- */
      coordNote = el("div", { class: "coord-note" });
      body.appendChild(coordNote);
      refreshCoordNote();

      /* ---------- 아이콘 · 색상 (§6-4) ---------- */
      body.appendChild(buildIconPicker({
        type,
        draft,
        onChange: () => { markDirty(); refreshPreview(); }
      }));

      previewBox = el("div", { class: "preview" }, [
        el("span", { class: "preview__pin" }),
        el("span", { class: "preview__name" })
      ]);
      body.appendChild(el("div", { class: "field" }, [
        el("label", { class: "field__label", text: "미리보기" }),
        previewBox
      ]));
      refreshPreview();

      /* ---------- 유형별 항목 (§6-5 ~ §6-8) ---------- */
      buildTypeFields(body, type, draft, markDirty, (input) => { priceInput = input; });
    },

    async onApply() {
      const nm = (nameInput ? nameInput.value : "").trim();
      if (!nm) {
        toast("명칭을 입력해 주세요.", "err");
        nameInput.focus();
        return false;
      }
      if (!draft.coord) {
        toast("위치를 지정해 주세요. 검색하거나 지도에서 직접 지정할 수 있습니다.", "err");
        return false;
      }

      // 동일 좌표 중복 확인 (§5)
      const dup = state.places.find(
        (p) => p.id !== placeId && sameSpot(p.coord, draft.coord)
      );
      if (dup) {
        const ok = await confirmDialog({
          title: "같은 위치가 이미 있습니다",
          message: `"${dup.name}" 과(와) 거의 같은 위치입니다. 그래도 추가할까요?`,
          okText: "그대로 추가"
        });
        if (!ok) return false;
      }

      draft.name = nm;
      draft.priceKRW = priceInput ? priceValue(priceInput) : 0;

      if (editing) {
        updatePlace(placeId, {
          name: draft.name,
          searchedName: draft.searchedName,
          coord: draft.coord,
          address: draft.address,
          source: draft.source,
          priceKRW: draft.priceKRW,
          icon: draft.icon,
          tone: draft.tone,
          detail: draft.detail
        });
        commit("places", true);
        toast("수정했습니다.", "ok");
      } else {
        addPlace({
          id: makeId(),
          type,
          name: draft.name,
          searchedName: draft.searchedName,
          coord: draft.coord,
          address: draft.address,
          source: draft.source,
          priceKRW: draft.priceKRW,
          order: 0,
          icon: draft.icon,
          tone: draft.tone,
          color: colorOf(type, draft.tone),
          detail: draft.detail
        });
        commit("places", true);
        toast(`${meta.label}${josa(meta.label, "을", "를")} 추가했습니다.`, "ok");
        MapView.flyTo(draft.coord);
      }

      MapView.setPreview(null);
      if (onDone) onDone();
      return true;
    },

    onClosed() {
      MapView.setPreview(null);
    }
  });
}

/* =====================================================================
   공통 검색 UI (§6-1 · §6-3)
   ===================================================================== */
function buildSearchUI({ onPick, onManual }) {
  const wrap = el("div", { class: "search" });

  wrap.appendChild(el("p", {
    class: "search__lead",
    html: "방문지의 명칭 또는 상호명을 입력하면 지도에 위치가 표시됩니다.<br>" +
          "<b>영어 또는 현지 언어로 입력하면 잘 찾습니다</b> (예: Osaka Castle, 大阪城)"
  }));

  const input = el("input", {
    class: "input",
    type: "search",
    placeholder: "예) Osaka Castle",
    enterkeyhint: "search",
    autocomplete: "off"
  });
  const go = el("button", { class: "btn btn--primary search__go", type: "button", text: "🔍 검색" });
  wrap.appendChild(el("div", { class: "search__row" }, [input, go]));

  const status = el("p", { class: "search__status" });
  wrap.appendChild(status);

  const list = el("ul", { class: "results" });
  wrap.appendChild(list);

  const manual = el("button", {
    class: "linkbtn search__manual",
    type: "button",
    text: "검색 결과가 없나요? 지도에서 직접 위치 지정하기"
  });
  manual.addEventListener("click", onManual);
  wrap.appendChild(manual);

  loadAliases();

  let running = false;

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.classList.toggle("is-error", !!isError);
  }

  async function run() {
    if (running) return;
    const q = input.value.trim();

    if (q.length < CONFIG.SEARCH_MIN_LENGTH) {
      setStatus(`${CONFIG.SEARCH_MIN_LENGTH}글자 이상 입력해 주세요.`, true);
      return;
    }

    running = true;
    go.disabled = true;
    list.innerHTML = "";
    setStatus("검색 중…");

    try {
      const res = await searchPlaces(q, state.trip.city);

      const notes = [];
      if (res.aliasUsed) notes.push(`"${res.usedQuery}" 로 바꿔 검색했습니다`);
      if (res.retriedDefaultLang) notes.push("현지어로 다시 검색했습니다");
      if (res.usedFallback) notes.push("다른 검색 서비스로 찾았습니다");
      if (res.cached) notes.push("이전 검색 결과입니다");

      if (res.results.length === 0) {
        // §6-2-3 → 그래도 없으면 지도 직접 지정을 안내 (§6-2-4)
        setStatus(
          "검색 결과가 없습니다. 영어나 현지 언어로 다시 입력해 보거나, " +
          "아래 [지도에서 직접 위치 지정하기]를 사용해 주세요.",
          true
        );
        manual.style.fontWeight = "800";
        return;
      }

      setStatus(
        `${res.results.length}건을 찾았습니다.` + (notes.length ? ` (${notes.join(" · ")})` : "")
      );

      res.results.forEach((r) => {
        const btn = el("button", { type: "button" }, [
          el("div", { class: "rs-name", text: r.name }),
          el("div", { class: "rs-meta", text: [r.kind, r.where].filter(Boolean).join(" · ") })
        ]);
        btn.addEventListener("click", () => {
          onPick(r);
          list.innerHTML = "";
          setStatus(`"${r.name}" 을(를) 선택했습니다.`);
        });
        list.appendChild(el("li", {}, [btn]));
      });
    } catch (e) {
      if (e instanceof SearchLimitError) {
        setStatus(e.message, true);
      } else {
        setStatus(
          (e && e.message ? e.message : "검색에 실패했습니다.") +
          " 지도에서 직접 위치를 지정할 수 있습니다.",
          true
        );
      }
    } finally {
      running = false;
      go.disabled = false;
    }
  }

  // 자동완성이 아니라 [검색] 버튼·Enter 로만 호출합니다 (§6-3)
  go.addEventListener("click", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); run(); }
  });

  // 한글을 입력하면 사전 치환 예정임을 미리 알려 줍니다 (호출은 하지 않습니다)
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.length < CONFIG.SEARCH_MIN_LENGTH) { setStatus(""); return; }
    const { query, replaced } = applyAlias(q);
    setStatus(replaced
      ? `사전에 있는 장소입니다 — "${query}" 로 검색합니다. Enter 또는 [검색]을 누르세요.`
      : "Enter 또는 [검색] 버튼을 누르면 검색합니다.");
  });

  return wrap;
}

/* =====================================================================
   아이콘 · 색상 선택 (§6-4)
   ===================================================================== */
function buildIconPicker({ type, draft, onChange }) {
  const meta = TYPES[type];
  const wrap = el("div", { class: "field" });

  wrap.appendChild(el("label", { class: "field__label", text: "지도에 표시할 아이콘을 선택하세요" }));

  const icons = el("div", { class: "pick-icons", role: "radiogroup", "aria-label": "아이콘 선택" });
  meta.icons.forEach((key) => {
    const btn = el("button", {
      type: "button",
      class: "pick-icon" + (key === draft.icon ? " is-sel" : ""),
      role: "radio",
      "aria-checked": key === draft.icon ? "true" : "false",
      title: ICON_LABELS[key] || key,
      "aria-label": ICON_LABELS[key] || key,
      html: iconSvg(key)
    });
    btn.addEventListener("click", () => {
      draft.icon = key;
      icons.querySelectorAll(".pick-icon").forEach((b) => {
        b.classList.remove("is-sel");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("is-sel");
      btn.setAttribute("aria-checked", "true");
      onChange();
    });
    icons.appendChild(btn);
  });
  wrap.appendChild(icons);

  wrap.appendChild(el("label", { class: "field__label", text: "색상", style: { marginTop: "14px" } }));

  const colors = el("div", { class: "pick-colors", role: "radiogroup", "aria-label": "색상 선택" });
  [["light", "연하게"], ["base", "기본"], ["dark", "진하게"]].forEach(([tone, label]) => {
    const btn = el("button", {
      type: "button",
      class: "pick-color" + (tone === draft.tone ? " is-sel" : ""),
      role: "radio",
      "aria-checked": tone === draft.tone ? "true" : "false"
    }, [
      el("span", { class: "pick-color__sw", style: { background: colorOf(type, tone) } }),
      label
    ]);
    btn.addEventListener("click", () => {
      draft.tone = tone;
      colors.querySelectorAll(".pick-color").forEach((b) => {
        b.classList.remove("is-sel");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("is-sel");
      btn.setAttribute("aria-checked", "true");
      onChange();
    });
    colors.appendChild(btn);
  });
  wrap.appendChild(colors);

  wrap.appendChild(el("p", {
    class: "field__help",
    text: "색상은 유형별로 정해져 있고 진하기만 고를 수 있습니다. 지도·범례·PDF에 똑같이 반영됩니다."
  }));

  return wrap;
}

/* =====================================================================
   유형별 입력 항목 (§6-5 ~ §6-8)
   ===================================================================== */
function buildTypeFields(body, type, draft, markDirty, setPriceInput) {
  const d = draft.detail;

  const price = (label, help) => {
    const f = field({
      label, id: "pPrice", inputmode: "numeric",
      value: draft.priceKRW ? comma(draft.priceKRW) : "",
      placeholder: "예) 120,000", help: help || "단위는 원입니다. 총 이용 비용에 합산됩니다."
    });
    attachPriceMask(f.input);
    f.input.addEventListener("input", markDirty);
    setPriceInput(f.input);
    body.appendChild(f.wrap);
  };

  const text = (label, key, opts = {}) => {
    const f = field({
      label, id: "p_" + key,
      type: opts.textarea ? "textarea" : "text",
      rows: opts.rows || 3,
      maxlength: opts.maxlength || (opts.textarea ? 500 : 200),
      value: d[key] || "",
      placeholder: opts.placeholder || "",
      help: opts.help || ""
    });
    f.input.addEventListener("input", () => { d[key] = f.input.value; markDirty(); });
    body.appendChild(f.wrap);
  };

  switch (type) {
    case "stay":
      text("객실명", "roomName", { placeholder: "예) 트윈룸", maxlength: 60 });
      price("숙박료");
      text("숙소 소개 설명", "note", {
        textarea: true, rows: 4,
        placeholder: "장점과 주의점을 함께 적어 보세요. 예) 역에서 도보 3분, 조식 미포함"
      });
      break;

    case "sight":
      text("주요 볼거리", "highlight", { placeholder: "예) 천수각 전망대, 벚꽃길" });
      price("이용 가격", "입장료 등입니다. 무료라면 0으로 두세요.");
      text("해당 도시에서의 이동 방법", "access", { placeholder: "예) 지하철 다니마치선 다니마치욘초메역에서 도보 15분" });
      text("관광지 소개 설명", "note", { textarea: true, rows: 4 });
      break;

    case "food":
      text("주요 음식 1", "food1", { placeholder: "예) 타코야키", maxlength: 60 });
      text("주요 음식 2", "food2", { placeholder: "예) 오코노미야키", maxlength: 60 });
      price("음식 가격", "1인 기준 예상 금액을 적어 보세요.");
      text("해당 도시에서의 이동 방법", "access", { placeholder: "예) 난바역에서 도보 5분" });
      text("음식 · 맛집 소개 설명", "note", { textarea: true, rows: 4 });
      break;

    case "activity":
      price("액티비티 가격");
      text("해당 도시에서의 이동 방법", "access", { placeholder: "예) 오사카역에서 순환버스 20분" });
      text("액티비티 소개 설명", "note", { textarea: true, rows: 4 });
      break;
  }
}
