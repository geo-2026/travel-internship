// =====================================================================
//  page1.js — 1페이지 : 여행 정보 입력 (명세서 §4)
//
//  ★ 도시 선택은 API 를 쓰지 않습니다 (§4-1).
//    data/cities.json 을 한 번 읽어 메모리에서 한글 부분 일치로 거릅니다.
//    → 네트워크 호출 0회, 첫 화면에서 학생이 막히지 않습니다.
// =====================================================================

import { state, commit, tripIsValid } from "./storage.js";
import { openModal } from "./modal.js";
import * as MapView from "./map.js";
import { $, el, toast, field, showFieldError, debounce } from "./ui.js";

let CITIES = [];
let citiesLoaded = null;
let activeIndex = -1;
let onValidChange = null;

/* --------------------------------------------------------------------
   도시 목록
   -------------------------------------------------------------------- */
function normalize(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

export function loadCities() {
  if (citiesLoaded) return citiesLoaded;

  citiesLoaded = fetch("data/cities.json", { cache: "force-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`cities.json (${r.status})`);
      return r.json();
    })
    .then((list) => {
      CITIES = Array.isArray(list) ? list.filter((c) => c && c.nameKo && Array.isArray(c.center)) : [];
      CITIES.forEach((c) => {
        c._keys = [c.nameKo, c.nameEn, c.country, ...(c.aliases || [])]
          .filter(Boolean).map(normalize);
      });
      return CITIES;
    })
    .catch((e) => {
      console.error("[page1] 도시 목록을 불러오지 못했습니다.", e);
      CITIES = [];
      return CITIES;
    });

  return citiesLoaded;
}

/** 한글 부분 일치로 거릅니다 (네트워크 호출 없음) */
function filterCities(q) {
  const n = normalize(q);
  if (!n) return CITIES.slice(0, 12);

  const starts = [];
  const contains = [];
  for (const c of CITIES) {
    const hit = c._keys.findIndex((k) => k.includes(n));
    if (hit < 0) continue;
    (c._keys.some((k) => k.startsWith(n)) ? starts : contains).push(c);
  }
  return [...starts, ...contains].slice(0, 12);
}

/* --------------------------------------------------------------------
   화면
   -------------------------------------------------------------------- */
export async function initPage1(onValid) {
  onValidChange = onValid;

  const inTitle = $("#inTitle");
  const inId = $("#inStudentId");
  const inName = $("#inStudentName");
  const inCity = $("#inCity");
  const listEl = $("#cityList");
  const picked = $("#cityPicked");
  const pickedName = $("#cityPickedName");
  const titleCount = $("#titleCount");

  // 저장된 값 반영
  inTitle.value = state.trip.title;
  inId.value = state.trip.studentId;
  inName.value = state.trip.studentName;
  titleCount.textContent = String(state.trip.title.length);
  renderPicked();

  await loadCities();

  /* ---------- 텍스트 입력 (입력 즉시 저장 — §13) ---------- */
  const saveSoon = debounce(() => commit("trip"), 400);

  inTitle.addEventListener("input", () => {
    state.trip.title = inTitle.value.slice(0, 40);
    titleCount.textContent = String(state.trip.title.length);
    validate(false);
    saveSoon();
  });

  inId.addEventListener("input", () => {
    // 숫자만
    const v = inId.value.replace(/[^0-9]/g, "").slice(0, 6);
    if (v !== inId.value) inId.value = v;
    state.trip.studentId = v;
    validate(false);
    saveSoon();
  });

  inName.addEventListener("input", () => {
    state.trip.studentName = inName.value.slice(0, 20);
    validate(false);
    saveSoon();
  });

  /* ---------- 도시 자동 완성 (메모리 필터) ---------- */
  const renderList = () => {
    const items = filterCities(inCity.value);
    listEl.innerHTML = "";
    activeIndex = -1;

    if (items.length === 0) {
      listEl.appendChild(el("li", { class: "ci-empty", text: "목록에 없는 도시입니다. 아래 [직접 입력하기]를 사용해 주세요." }));
    } else {
      items.forEach((c, i) => {
        const btn = el("button", { type: "button" }, [
          el("span", { class: "ci-ko", text: c.nameKo }),
          el("span", { class: "ci-en", text: c.nameEn || "" }),
          el("span", { class: "ci-country", text: c.country || "" })
        ]);
        btn.addEventListener("click", () => choose(c));
        btn.addEventListener("mouseenter", () => setActive(i));
        listEl.appendChild(el("li", {}, [btn]));
      });
    }
    listEl.hidden = false;
    inCity.setAttribute("aria-expanded", "true");
  };

  const setActive = (i) => {
    const btns = listEl.querySelectorAll("button");
    btns.forEach((b) => b.classList.remove("is-active"));
    activeIndex = i;
    if (i >= 0 && btns[i]) {
      btns[i].classList.add("is-active");
      btns[i].scrollIntoView({ block: "nearest" });
    }
  };

  const closeList = () => {
    listEl.hidden = true;
    inCity.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  };

  inCity.addEventListener("input", renderList);
  inCity.addEventListener("focus", renderList);

  inCity.addEventListener("keydown", (e) => {
    if (listEl.hidden) return;
    const btns = listEl.querySelectorAll("button");
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(activeIndex + 1, btns.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
    else if (e.key === "Enter") {
      if (activeIndex >= 0 && btns[activeIndex]) { e.preventDefault(); btns[activeIndex].click(); }
    } else if (e.key === "Escape") { closeList(); }
  });

  document.addEventListener("click", (e) => {
    if (!listEl.hidden && !e.target.closest(".citybox")) closeList();
  });

  function choose(c) {
    state.trip.city = {
      nameKo: c.nameKo,
      nameEn: c.nameEn || "",
      country: c.country || "",
      center: [Number(c.center[0]), Number(c.center[1])],
      zoom: Number(c.zoom) || 11,
      bbox: Array.isArray(c.bbox) && c.bbox.length === 4 ? c.bbox.map(Number) : null
    };
    // 국가가 대한민국이면 항공료 항목을 숨깁니다 (§4)
    state.transport.isInternational = c.country !== "대한민국";
    commit("trip", true);

    inCity.value = "";
    closeList();
    renderPicked();
    validate(false);
  }

  $("#btnCityReset").addEventListener("click", () => {
    state.trip.city = null;
    commit("trip", true);
    renderPicked();
    validate(false);
    inCity.focus();
  });

  $("#btnCityManual").addEventListener("click", () => {
    openManualCityPopup(() => { renderPicked(); validate(false); });
  });

  function renderPicked() {
    const c = state.trip.city;
    if (c) {
      picked.hidden = false;
      $(".citybox").hidden = true;
      pickedName.textContent =
        `${c.nameKo}${c.nameEn ? ` (${c.nameEn})` : ""}${c.country ? ` · ${c.country}` : ""}`;
    } else {
      picked.hidden = true;
      $(".citybox").hidden = false;
    }
  }

  validate(false);
}

/* --------------------------------------------------------------------
   검증 (§4) — 필수값 미입력 시 [다음] 비활성 + 항목 아래 붉은 안내
   -------------------------------------------------------------------- */
export function validate(showErrors = true) {
  const t = state.trip;
  const checks = [
    ["#inTitle", "#errTitle", t.title.trim(), "여행 명칭을 입력해 주세요."],
    ["#inStudentId", "#errStudentId", t.studentId.trim(), "학번을 입력해 주세요."],
    ["#inStudentName", "#errStudentName", t.studentName.trim(), "이름을 입력해 주세요."]
  ];

  for (const [inSel, errSel, ok, msg] of checks) {
    const input = $(inSel);
    const err = $(errSel);
    if (!input || !err) continue;
    showFieldError(err, input, showErrors && !ok ? msg : "");
  }

  const errCity = $("#errCity");
  if (errCity) {
    errCity.hidden = !(showErrors && !t.city);
    errCity.textContent = "여행할 도시를 선택해 주세요.";
  }

  // 학번 자릿수 안내 (막지는 않습니다)
  if (showErrors && t.studentId.trim() && t.studentId.length < 5) {
    showFieldError($("#errStudentId"), $("#inStudentId"), "학번은 5자리를 권장합니다.");
  }

  const valid = tripIsValid();
  if (onValidChange) onValidChange(valid);
  return valid;
}

/* --------------------------------------------------------------------
   [직접 입력] — 목록에 없는 도시 (§4-1)
   -------------------------------------------------------------------- */
function openManualCityPopup(onDone) {
  let center = state.trip.city ? [...state.trip.city.center] : null;
  let nameInput = null;
  let countryInput = null;
  let note = null;
  let dirty = false;

  openModal({
    title: "도시 직접 입력",
    isDirty: () => dirty,

    render(body) {
      body.appendChild(el("p", {
        class: "field__help",
        text: "목록에 없는 도시를 직접 등록합니다. 도시 이름을 적고, 아래 지도에서 중심 위치를 지정해 주세요.",
        style: { marginBottom: "12px" }
      }));

      const n = field({
        label: "도시 이름", id: "mcName", required: true, maxlength: 40,
        value: state.trip.city ? state.trip.city.nameKo : "",
        placeholder: "예) 삿포로"
      });
      n.input.addEventListener("input", () => { dirty = true; });
      nameInput = n.input;
      body.appendChild(n.wrap);

      const c = field({
        label: "나라", id: "mcCountry", maxlength: 40,
        value: state.trip.city ? state.trip.city.country : "",
        placeholder: "예) 일본",
        help: "대한민국이라고 적으면 항공료 항목이 숨겨집니다."
      });
      c.input.addEventListener("input", () => { dirty = true; });
      countryInput = c.input;
      body.appendChild(c.wrap);

      body.appendChild(el("label", { class: "field__label", text: "중심 위치" }));
      note = el("div", { class: "coord-note is-missing" });
      body.appendChild(note);

      const slot = el("div", { class: "map-slot", style: { height: "260px", marginTop: "10px" } });
      body.appendChild(slot);

      const pick = el("button", {
        class: "btn", type: "button", text: "지도에서 중심 위치 지정",
        style: { marginTop: "10px", width: "100%" }
      });
      body.appendChild(pick);

      // 지도를 이 팝업 안으로 옮겨 옵니다 (인스턴스는 여전히 1개입니다)
      MapView.attachTo(slot, state.trip.city || { center: [127, 37.5], zoom: 2 })
        .then(() => { if (!state.trip.city) MapView.getMap().jumpTo({ center: [127, 37.5], zoom: 1.6 }); })
        .catch((e) => {
          slot.innerHTML = "";
          slot.appendChild(el("p", { class: "empty-hint", text: e.message || "지도를 불러오지 못했습니다." }));
        });

      pick.addEventListener("click", async () => {
        const coord = await MapView.startPick();
        if (!coord) return;
        center = coord;
        dirty = true;
        refresh();
      });

      function refresh() {
        if (center) {
          note.className = "coord-note";
          note.textContent = `📍 ${center[1].toFixed(4)}, ${center[0].toFixed(4)} 로 지정되었습니다.`;
          MapView.setPreview(center);
        } else {
          note.className = "coord-note is-missing";
          note.textContent = "📍 아직 중심 위치가 지정되지 않았습니다.";
        }
      }
      refresh();
    },

    onApply() {
      const nm = nameInput.value.trim();
      if (!nm) { toast("도시 이름을 입력해 주세요.", "err"); return false; }
      if (!center) { toast("지도에서 중심 위치를 지정해 주세요.", "err"); return false; }

      const country = countryInput.value.trim();
      state.trip.city = {
        nameKo: nm,
        nameEn: "",
        country,
        center,
        zoom: 11,
        // 검색 범위 제한용 대략 반경 (약 15km)
        bbox: [center[0] - 0.15, center[1] - 0.12, center[0] + 0.15, center[1] + 0.12]
      };
      state.transport.isInternational = country !== "대한민국";
      commit("trip", true);

      MapView.setPreview(null);
      toast(`"${nm}" 을(를) 여행 도시로 정했습니다.`, "ok");
      if (onDone) onDone();
      return true;
    },

    onClosed() {
      MapView.setPreview(null);
      MapView.detach();
    }
  });
}
