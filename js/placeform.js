// placeform.js — 방문지 팝업 4종(숙소·관광명소·맛집·엑티비티)과 이동방법 팝업.
//
// 네 팝업은 상단 구성이 같다: 위치 검색 → 항목명 → 아이콘/색상 → 유형별 항목.

import { TYPES, colorOf, inlineSvg, iconLabel } from "./icons.js";
import { getState, newPlaceId, addPlace, updatePlace, save } from "./storage.js";
import { geocode, debounce, RateLimitError, MIN_QUERY_LENGTH } from "./search.js";
import * as MapView from "./map.js";
import {
  el, openModal, toast, field, textInput, textArea,
  bindMoneyInput, formatKRW, parseKRW
} from "./ui.js";

const SHADES = [["light", "연하게"], ["base", "기본"], ["dark", "진하게"]];

// ── 지도에서 직접 위치 지정 (§6-3) ──────────────────────────────────────────

/** 모달을 잠시 감추고 지도 길게 누르기를 기다린다. 취소하면 null. */
function pickOnMap(type) {
  return new Promise((resolve) => {
    const backdrop = document.querySelector(".modal-backdrop:last-of-type");
    if (backdrop) backdrop.classList.add("is-hidden");

    const banner = el("div", { class: "map-pick-banner" }, [
      el("span", { text: "지도를 길게 눌러(약 0.6초) 위치를 지정하세요." }),
      el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "취소" })
    ]);
    document.body.appendChild(banner);

    const finish = (coord) => {
      MapView.setLongPressEnabled(false);
      MapView.setLongPressHandler(null);
      banner.remove();
      if (backdrop) backdrop.classList.remove("is-hidden");
      resolve(coord);
    };

    banner.querySelector("button").addEventListener("click", () => finish(null));
    MapView.setLongPressHandler((coord) => {
      MapView.showPreview(coord, type);
      finish(coord);
    });
    MapView.setLongPressEnabled(true);
  });
}

// ── 검색 블록 ──────────────────────────────────────────────────────────────

function buildSearchBlock(type, placeholder, onPick) {
  const results = el("div", { class: "search-results", role: "listbox" });
  const status = el("p", { class: "search-status" });
  const input = el("input", {
    class: "input search-input", type: "search",
    placeholder, autocomplete: "off", enterkeyhint: "search"
  });

  const manualBtn = el("button", {
    class: "link-btn", type: "button",
    text: "검색 결과가 없나요? 지도에서 직접 위치 지정하기"
  });
  manualBtn.addEventListener("click", async () => {
    const coord = await pickOnMap(type);
    if (coord) {
      onPick({ name: "", address: "", center: coord, source: "manual" });
      status.textContent = "지도에서 위치를 지정했습니다. 항목명을 직접 입력하세요.";
      results.innerHTML = "";
    }
  });

  const render = (items) => {
    results.innerHTML = "";
    items.slice(0, 5).forEach((r) => {
      const btn = el("button", { class: "search-result", type: "button", role: "option" }, [
        el("span", { class: "search-result-name", text: r.name }),
        el("span", { class: "search-result-meta", text: r.category || "장소" }),
        el("span", { class: "search-result-addr", text: r.address })
      ]);
      btn.addEventListener("click", () => {
        onPick({ name: r.name, address: r.address, center: r.center, source: "search" });
        status.textContent = `“${r.name}” 위치를 지도에 표시했습니다.`;
        results.innerHTML = "";
      });
      results.appendChild(btn);
    });
  };

  const run = debounce(async (q) => {
    const city = getState().trip.city;
    status.textContent = "검색 중…";
    try {
      // bbox 로 선택한 도시 범위에 묶는다. proximity 만으로는 가중치가 약해
      // "Tokyo Tower" 가 미국 유타의 동명 장소로 잡히는 일이 있었다.
      const items = await geocode(q, {
        proximity: city ? city.center : undefined,
        bbox: city ? city.bbox : undefined
      });
      if (!items.length) {
        // 해외 장소는 한글 음차가 검색 색인에 없는 경우가 많다(예: "오사카성").
        status.textContent = city && city.country && city.country !== "대한민국"
          ? "결과가 없습니다. 영문·현지어 이름으로 검색하거나, 아래에서 지도에 직접 지정해 보세요."
          : "결과가 없습니다. 아래에서 지도에 직접 지정할 수 있어요.";
      } else {
        status.textContent = "";
      }
      render(items);
    } catch (err) {
      results.innerHTML = "";
      status.textContent = err instanceof RateLimitError
        ? "잠시 후 다시 검색해 주세요."
        : "검색에 실패했습니다. 지도에서 직접 지정해 보세요.";
    }
  });

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      results.innerHTML = "";
      status.textContent = q.length ? "두 글자 이상 입력해 주세요." : "";
      return;
    }
    run(q);
  });

  return el("div", { class: "search-block" }, [
    el("p", { class: "search-guide", text: "방문지의 명칭 또는 상호명을 입력하면 지도에 위치가 표시됩니다" }),
    input, status, results, manualBtn
  ]);
}

// ── 아이콘·색상 선택 (§6-4) ────────────────────────────────────────────────

function buildIconPicker(type, draft, onChange) {
  const def = TYPES[type];
  const grid = el("div", { class: "icon-grid", role: "radiogroup", "aria-label": "아이콘 선택" });
  const shadeRow = el("div", { class: "shade-row", role: "radiogroup", "aria-label": "색상 선택" });
  const preview = el("div", { class: "icon-preview" });

  async function paint() {
    const color = colorOf(type, draft.shade);
    // 아이콘 버튼
    await Promise.all(Array.from(grid.children).map(async (btn) => {
      const name = btn.dataset.icon;
      const active = name === draft.icon;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
      btn.querySelector(".icon-swatch").innerHTML = await inlineSvg(name, color);
    }));
    Array.from(shadeRow.children).forEach((btn) => {
      const active = btn.dataset.shade === draft.shade;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
      btn.querySelector(".shade-dot").style.background = colorOf(type, btn.dataset.shade);
    });
    preview.innerHTML = "";
    preview.append(
      el("span", { class: "preview-pin", html: await inlineSvg(draft.icon, color) }),
      el("span", {
        class: "preview-name",
        text: draft.previewName() || `${def.label} 이름을 입력하세요`
      })
    );
  }

  def.icons.forEach(([name, label]) => {
    const btn = el("button", {
      class: "icon-btn", type: "button", role: "radio",
      "data-icon": name, title: label, "aria-label": label
    }, [
      el("span", { class: "icon-swatch" }),
      el("span", { class: "icon-caption", text: label })
    ]);
    btn.addEventListener("click", () => {
      draft.icon = name;
      paint();
      onChange();
    });
    grid.appendChild(btn);
  });

  SHADES.forEach(([shade, label]) => {
    const btn = el("button", {
      class: "shade-btn", type: "button", role: "radio",
      "data-shade": shade, "aria-label": label
    }, [
      el("span", { class: "shade-dot" }),
      el("span", { text: label })
    ]);
    btn.addEventListener("click", () => {
      draft.shade = shade;
      paint();
      onChange();
    });
    shadeRow.appendChild(btn);
  });

  paint();

  return {
    node: el("div", { class: "icon-picker" }, [
      el("p", { class: "field-label", text: "지도에 표시할 아이콘을 선택하세요" }),
      grid,
      el("p", { class: "field-label", text: "색상" }),
      shadeRow,
      el("p", { class: "field-label", text: "미리보기" }),
      preview
    ]),
    repaint: paint
  };
}

// ── 유형별 상세 필드 ───────────────────────────────────────────────────────

const DETAIL_FIELDS = {
  stay: [
    { key: "roomName", label: "객실명", kind: "text", max: 40, placeholder: "예) 트윈룸" },
    { key: "note", label: "숙소 소개 설명 (장점·주의점)", kind: "textarea", max: 300 }
  ],
  sight: [
    { key: "highlights", label: "주요 볼거리", kind: "text", max: 60, placeholder: "예) 천수각, 벚꽃" },
    { key: "access", label: "해당 도시에서의 이동 방법", kind: "text", max: 60, placeholder: "예) 지하철 다니마치선 15분" },
    { key: "note", label: "관광지 소개 설명", kind: "textarea", max: 300 }
  ],
  food: [
    { key: "food1", label: "주요 음식 1", kind: "text", max: 40 },
    { key: "food2", label: "주요 음식 2", kind: "text", max: 40 },
    { key: "access", label: "해당 도시에서의 이동 방법", kind: "text", max: 60 },
    { key: "note", label: "음식·맛집 소개 설명", kind: "textarea", max: 300 }
  ],
  activity: [
    { key: "venue", label: "액티비티 이용 장소", kind: "text", max: 40, auto: true },
    { key: "access", label: "해당 도시에서의 이동 방법", kind: "text", max: 60 },
    { key: "note", label: "액티비티 소개 설명", kind: "textarea", max: 300 }
  ]
};

const NAME_LABEL = {
  stay: "숙소명", sight: "관광지명", food: "현지 맛집명", activity: "엑티비티명"
};
const PRICE_LABEL = {
  stay: "숙박료(원)", sight: "이용 가격(원)", food: "음식 가격(원)", activity: "액티비티 가격(원)"
};
const SEARCH_PLACEHOLDER = {
  stay: "예) 호텔 몬터레이 오사카",
  sight: "예) 오사카성",
  food: "예) 도톤보리 이치란",
  activity: "예) 유니버설 스튜디오 재팬"
};

// ── 방문지 팝업 ────────────────────────────────────────────────────────────

/**
 * @param {string} type stay|sight|food|activity
 * @param {object|null} existing 수정할 장소 (없으면 신규)
 * @param {Function} onDone 저장 후 콜백
 */
export function openPlacePopup(type, existing, onDone) {
  const def = TYPES[type];
  const isEdit = Boolean(existing);
  const detailSpec = DETAIL_FIELDS[type];

  const draft = {
    name: existing ? existing.name : "",
    coord: existing ? existing.coord.slice() : null,
    address: existing ? existing.address || "" : "",
    source: existing ? existing.source || "search" : "search",
    icon: existing ? existing.icon : def.defaultIcon,
    shade: existing ? existing.shade || "base" : "base",
    previewName: () => nameInput.value.trim()
  };

  let dirty = false;
  const markDirty = () => { dirty = true; };

  const nameInput = textInput(draft.name, `${NAME_LABEL[type]}을(를) 입력하세요`, 40);
  nameInput.addEventListener("input", () => { markDirty(); picker.repaint(); });

  const priceInput = textInput(existing ? formatKRW(existing.priceKRW) : "", "0", 12);
  const readPrice = bindMoneyInput(priceInput);
  priceInput.addEventListener("input", markDirty);

  const detailInputs = {};
  const detailNodes = detailSpec.map((spec) => {
    const control = spec.kind === "textarea"
      ? textArea(existing && existing.detail ? existing.detail[spec.key] : "", spec.placeholder, spec.max, 3)
      : textInput(existing && existing.detail ? existing.detail[spec.key] : "", spec.placeholder, spec.max);
    control.addEventListener("input", markDirty);
    detailInputs[spec.key] = control;
    return field(spec.label, control);
  });

  const locationNote = el("p", { class: "location-note" });
  function paintLocation() {
    if (!draft.coord) {
      locationNote.textContent = "아직 위치가 지정되지 않았습니다.";
      locationNote.classList.add("is-warn");
    } else {
      const src = draft.source === "manual" ? "지도에서 직접 지정" : "검색 결과";
      locationNote.textContent = `위치 확인됨 (${src})` + (draft.address ? ` · ${draft.address}` : "");
      locationNote.classList.remove("is-warn");
    }
  }

  const searchBlock = buildSearchBlock(type, SEARCH_PLACEHOLDER[type], (picked) => {
    draft.coord = picked.center;
    draft.address = picked.address || "";
    draft.source = picked.source;
    markDirty();
    // 항목명 자동 입력 — 학생이 지우고 고쳐 쓸 수 있다.
    if (picked.name) {
      if (type === "activity") {
        if (!detailInputs.venue.value) detailInputs.venue.value = picked.name;
        if (!nameInput.value) nameInput.value = picked.name;
      } else if (!nameInput.value) {
        nameInput.value = picked.name;
      }
    }
    MapView.showPreview(draft.coord, type);
    MapView.flyTo(draft.coord);
    picker.repaint();
    paintLocation();
  });

  const picker = buildIconPicker(type, draft, markDirty);

  const body = el("div", { class: "place-form" }, [
    searchBlock,
    locationNote,
    field(NAME_LABEL[type], nameInput),
    picker.node,
    field(PRICE_LABEL[type], priceInput, "숫자만 입력하면 자동으로 콤마가 붙습니다."),
    ...detailNodes
  ]);

  paintLocation();
  if (draft.coord) MapView.showPreview(draft.coord, type);

  openModal({
    title: (isEdit ? "수정 — " : "추가 — ") + def.label,
    body,
    applyLabel: "적용",
    isDirty: () => dirty,
    onClose: () => MapView.clearPreview(),
    onApply: () => {
      const name = nameInput.value.trim();
      if (!name) {
        toast(`${NAME_LABEL[type]}을(를) 입력해 주세요.`);
        nameInput.focus();
        return false;
      }
      if (!draft.coord) {
        toast("위치를 검색하거나 지도에서 직접 지정해 주세요.");
        return false;
      }

      const detail = {};
      detailSpec.forEach((spec) => {
        detail[spec.key] = detailInputs[spec.key].value.trim();
      });

      const payload = {
        type,
        name,
        coord: draft.coord,
        address: draft.address,
        source: draft.source,
        priceKRW: readPrice(),
        icon: draft.icon,
        shade: draft.shade,
        color: colorOf(type, draft.shade),
        detail
      };

      if (isEdit) {
        updatePlace(existing.id, payload);
      } else {
        const state = getState();
        const dup = state.places.find(
          (p) => Math.abs(p.coord[0] - draft.coord[0]) < 1e-6 &&
                 Math.abs(p.coord[1] - draft.coord[1]) < 1e-6
        );
        if (dup && !confirm("이미 등록한 장소입니다. 그래도 추가할까요?")) return false;
        addPlace({ id: newPlaceId(), ...payload });
      }
      MapView.clearPreview();
      toast(isEdit ? "수정했습니다." : `${def.label}을(를) 추가했습니다.`);
      onDone();
      return true;
    }
  });
}

// ── 이동방법 팝업 (§5-1) ───────────────────────────────────────────────────

export function openTransportPopup(onDone) {
  const state = getState();
  const t = state.transport;
  const isIntl = state.trip.city ? state.trip.city.country !== "대한민국" : false;
  t.isInternational = isIntl;

  let dirty = false;
  const markDirty = () => { dirty = true; };

  const flightInput = textInput(t.flightCostKRW ? formatKRW(t.flightCostKRW) : "", "0", 12);
  const readFlight = bindMoneyInput(flightInput);
  flightInput.addEventListener("input", markDirty);

  const modeBoxes = [["public", "대중교통"], ["walk", "도보"]].map(([value, label]) => {
    const input = el("input", { type: "checkbox", value });
    input.checked = (t.localModes || []).includes(value);
    input.addEventListener("change", markDirty);
    return el("label", { class: "check" }, [input, el("span", { text: label })]);
  });

  const cautions = textArea(t.cautions, "예) 지하철 1일권 구입, 러시아워 혼잡 주의", 300, 4);
  cautions.addEventListener("input", markDirty);

  const body = el("div", { class: "place-form" }, [
    isIntl
      ? field("왕복 항공료(원)", flightInput, "항공료는 총 이용 비용 합계에서 제외되고 PDF에 별도로 표기됩니다.")
      : el("p", { class: "field-hint", text: "국내 여행이라 항공료 항목은 표시하지 않습니다." }),
    el("div", { class: "field" }, [
      el("p", { class: "field-label", text: "해당 도시에서의 이동수단 (복수 선택)" }),
      el("div", { class: "check-row" }, modeBoxes),
      el("p", {
        class: "field-hint",
        text: "도보만 선택하면 도보 경로로, 대중교통을 포함하면 도로 기준 근사 경로로 계산합니다."
      })
    ]),
    field("이동 수단 사용의 주의점", cautions)
  ]);

  openModal({
    title: "이동방법",
    body,
    applyLabel: "적용",
    isDirty: () => dirty,
    onApply: () => {
      const modes = modeBoxes
        .map((label) => label.querySelector("input"))
        .filter((i) => i.checked)
        .map((i) => i.value);
      t.isInternational = isIntl;
      t.flightCostKRW = isIntl ? readFlight() : 0;
      t.localModes = modes;
      t.cautions = cautions.value.trim();
      save();
      toast("이동방법을 저장했습니다.");
      onDone();
      return true;
    }
  });
}
