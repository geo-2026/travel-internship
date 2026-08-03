// =====================================================================
//  app.js — 진입점 · 페이지 전환 · 설정
//
//  · 3페이지를 한 문서 안에서 전환합니다. 지도는 파괴하지 않고 옮깁니다(§2·§10-4).
//  · 입력값은 즉시 localStorage 에 저장되고, 재접속 시 복원 여부를 묻습니다(§2).
// =====================================================================

import { CONFIG, HAS_MAPTILER_KEY, HAS_ORS } from "../config.js";
import {
  state, peekSaved, applySaved, clearAll, commit, save, setSaveArmed,
  tripIsValid, exportJson, importJson
} from "./storage.js";
import * as MapView from "./map.js";
import { openModal, confirmDialog, alertDialog } from "./modal.js";
import { initPage1, validate as validatePage1 } from "./page1.js";
import { enterPage2, leavePage2, refresh as refreshPage2 } from "./page2.js";
import { enterPage3, leavePage3 } from "./page3.js";
import { clearSearchCache } from "./search.js";
import { clearRouteCache } from "./route.js";
import { $, $$, el, toast, downloadBlob, withBusy } from "./ui.js";

/* --------------------------------------------------------------------
   페이지 전환
   -------------------------------------------------------------------- */
const PAGES = {
  intro: "#page-intro",
  1: "#page-1",
  2: "#page-2",
  3: "#page-3"
};

let current = null;

async function goto(page, { push = true } = {}) {
  if (current === page) return;

  // 이전 페이지 정리
  if (current === 2) leavePage2();
  if (current === 3) leavePage3();
  if (page === "intro" || page === 1) MapView.detach();

  Object.values(PAGES).forEach((sel) => { const n = $(sel); if (n) n.hidden = true; });
  const node = $(PAGES[page]);
  if (node) node.hidden = false;

  current = page;
  if (page !== "intro") {
    state.ui.lastPage = page;
    state.ui.introSeen = true;
    commit("ui");
  }

  updateChrome();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  if (push) {
    const hash = page === "intro" ? "#start" : `#step${page}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  try {
    if (page === 2) await enterPage2();
    if (page === 3) await enterPage3();
  } catch (e) {
    console.error("[app] 페이지 진입 실패", e);
  }
}

/* --------------------------------------------------------------------
   헤더 · 하단 바 상태
   -------------------------------------------------------------------- */
function updateChrome() {
  const isIntro = current === "intro";
  const n = isIntro ? 0 : Number(current);

  // 스텝 인디케이터
  $$(".step").forEach((btn) => {
    const target = Number(btn.dataset.goto);
    btn.classList.toggle("is-done", n > target);
    if (n === target) btn.setAttribute("aria-current", "step");
    else btn.removeAttribute("aria-current");
    // 1페이지 필수값이 없으면 2·3단계로 바로 갈 수 없습니다
    btn.disabled = target > 1 && !tripIsValid();
  });

  // 이전
  const prev = $("#btnPrev");
  prev.hidden = isIntro;
  prev.disabled = false;

  // 다음
  const next = $("#btnNext");
  const foot = $(".app-foot");
  if (isIntro) {
    next.hidden = true;
    foot.hidden = false;
  } else if (n === 3) {
    // 3페이지에는 [적용 · PDF 저장] 버튼이 따로 있습니다
    next.hidden = true;
    foot.hidden = false;
  } else {
    next.hidden = false;
    next.textContent = "다음 →";
    next.disabled = n === 1 && !tripIsValid();
  }
}

/* --------------------------------------------------------------------
   앞뒤 이동
   -------------------------------------------------------------------- */
async function goNext() {
  if (current === "intro") { await goto(1); return; }

  if (current === 1) {
    if (!validatePage1(true)) {
      toast("필수 항목을 모두 입력해 주세요.", "err");
      return;
    }
    await goto(2);
    return;
  }

  if (current === 2) {
    if (state.places.length === 0) {
      const ok = await confirmDialog({
        title: "방문지가 없습니다",
        message: "방문할 장소를 하나도 추가하지 않았습니다. 그래도 다음 단계로 갈까요?",
        okText: "다음으로"
      });
      if (!ok) return;
    }
    await goto(3);
  }
}

async function goPrev() {
  if (current === 1) { await goto("intro"); return; }
  if (current === 2) { await goto(1); return; }
  if (current === 3) { await goto(2); return; }
}

/* --------------------------------------------------------------------
   설정 (§11 · §13)
   -------------------------------------------------------------------- */
function openSettings() {
  openModal({
    title: "설정",
    showApply: false,
    closeText: "닫기",

    render(body) {
      const list = el("div", { class: "settings-list" });

      // 계획 내보내기
      const exp = el("button", { class: "btn", type: "button", text: "📤  계획 내보내기 (JSON)" });
      exp.addEventListener("click", () => {
        const blob = new Blob([exportJson()], { type: "application/json;charset=utf-8" });
        const id = String(state.trip.studentId || "student").replace(/[^0-9A-Za-z]/g, "") || "student";
        downloadBlob(blob, `travel_internship_${id}.json`);
        toast("계획 파일을 내려받았습니다.", "ok");
      });
      list.appendChild(exp);

      // 계획 불러오기
      const file = el("input", { type: "file", accept: "application/json,.json", style: { display: "none" } });
      const imp = el("button", { class: "btn", type: "button", text: "📥  계획 불러오기 (JSON)" });
      imp.addEventListener("click", () => file.click());
      file.addEventListener("change", async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          importJson(text);
          save();
          clearRouteCache();
          toast("계획을 불러왔습니다.", "ok");
          await reloadAll();
        } catch (e) {
          console.error(e);
          await alertDialog({
            title: "불러오지 못했습니다",
            message: "이 앱에서 내보낸 JSON 파일인지 확인해 주세요."
          });
        } finally {
          file.value = "";
        }
      });
      list.appendChild(imp);
      list.appendChild(file);

      // 전체 삭제
      const del = el("button", { class: "btn btn--danger", type: "button", text: "🗑  입력 내용 전체 삭제" });
      del.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "전체 삭제할까요?",
          message: "여행 정보와 방문지가 모두 지워집니다. 되돌릴 수 없습니다.",
          okText: "전체 삭제",
          danger: true
        });
        if (!ok) return;
        clearAll();
        clearSearchCache();
        clearRouteCache();
        toast("모두 지웠습니다.");
        await reloadAll();
        await goto("intro");
      });
      list.appendChild(del);

      body.appendChild(list);

      // 안내
      body.appendChild(el("p", {
        class: "settings-note",
        html:
          "· 입력한 내용은 <b>이 기기에만</b> 저장되며 서버로 전송되지 않습니다.<br>" +
          "· 학번·이름·여행 명칭은 어떤 외부 서비스에도 보내지 않습니다.<br>" +
          "· 공용 크롬북을 썼다면 수업이 끝난 뒤 [전체 삭제]를 눌러 주세요.<br>" +
          "· 기기를 바꿔 이어서 작업하려면 [계획 내보내기]로 파일을 저장해 두세요."
      }));

      // 상태 (키 값 자체는 절대 표시하지 않습니다 — §10-5)
      body.appendChild(el("p", {
        class: "settings-note",
        html:
          `<b>연결 상태</b><br>` +
          `· 지도(MapTiler) : ${HAS_MAPTILER_KEY ? "설정됨" : "<b>키 미설정 — 데모 모드</b>"}<br>` +
          `· 경로(ORS) : ${HAS_ORS ? "설정됨" : "<b>키 미설정 — 직선으로 표시</b>"}<br>` +
          `· 장소 검색(Photon) : 키 없이 사용<br>` +
          `· 방문지 상한 : ${CONFIG.MAX_PLACES}곳`
      }));

      body.appendChild(el("p", {
        class: "settings-note",
        text: ATTRIBUTION_TEXT
      }));
    }
  });
}

const ATTRIBUTION_TEXT =
  "지도 데이터 © MapTiler © OpenStreetMap contributors · 경로 © openrouteservice · 검색 © Photon (OpenStreetMap)";

/* --------------------------------------------------------------------
   전체 다시 그리기 (불러오기·삭제 후)
   -------------------------------------------------------------------- */
async function reloadAll() {
  // 1페이지 입력칸
  $("#inTitle").value = state.trip.title;
  $("#inStudentId").value = state.trip.studentId;
  $("#inStudentName").value = state.trip.studentName;
  $("#titleCount").textContent = String(state.trip.title.length);

  const picked = $("#cityPicked");
  const box = $(".citybox");
  if (state.trip.city) {
    picked.hidden = false;
    box.hidden = true;
    $("#cityPickedName").textContent =
      `${state.trip.city.nameKo}` +
      (state.trip.city.nameEn ? ` (${state.trip.city.nameEn})` : "") +
      (state.trip.city.country ? ` · ${state.trip.city.country}` : "");
  } else {
    picked.hidden = true;
    box.hidden = false;
  }

  validatePage1(false);
  updateChrome();

  if (MapView.mapExists()) {
    await MapView.setPlaces(state.places, { numbers: current === 3 });
    MapView.renderLegend(state.places, { numbers: current === 3 });
    MapView.setRoute(state.route && state.route.geometry, {
      dashed: !!(state.route && state.route.straight)
    });
  }
  if (current === 2) await refreshPage2();
  if (current === 3) await enterPage3();
}

/* --------------------------------------------------------------------
   저장된 내용 복원 (§2)
   -------------------------------------------------------------------- */
async function restoreIfAny() {
  const saved = peekSaved();
  if (!saved) return null;

  const meaningful =
    (saved.trip && (saved.trip.title || saved.trip.studentName || saved.trip.city)) ||
    (saved.places && saved.places.length > 0);
  if (!meaningful) return null;

  const bits = [];
  if (saved.trip.title) bits.push(`"${saved.trip.title}"`);
  if (saved.trip.city) bits.push(saved.trip.city.nameKo);
  if (saved.places.length) bits.push(`방문지 ${saved.places.length}곳`);

  const ok = await confirmDialog({
    title: "이어서 작업할까요?",
    message: `이 기기에 저장된 내용이 있습니다.\n${bits.join(" · ")}\n\n[이어서 하기]를 누르면 마지막 상태에서 계속합니다.`,
    okText: "이어서 하기",
    cancelText: "새로 시작"
  });

  if (ok) {
    applySaved(saved);
    return saved.ui && saved.ui.lastPage ? saved.ui.lastPage : 1;
  }

  // clearAll() 이 저장 항목까지 지우므로 따로 save() 하지 않습니다
  clearAll();
  return null;
}

/* --------------------------------------------------------------------
   시작
   -------------------------------------------------------------------- */
async function main() {
  // 복원 여부를 학생이 정하기 전까지는 저장하지 않습니다.
  // (확인창에 답하기 전에 탭을 닫아도 기존 계획이 지워지지 않게)
  setSaveArmed(false);

  document.title = CONFIG.APP_TITLE;
  $(".logo").textContent = CONFIG.APP_TITLE;
  $("#attribution").textContent = ATTRIBUTION_TEXT;

  // 버튼 연결
  $("#btnStart").addEventListener("click", () => goto(1));
  $("#btnNext").addEventListener("click", goNext);
  $("#btnPrev").addEventListener("click", goPrev);
  $("#btnSettings").addEventListener("click", openSettings);

  $$(".step").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = Number(btn.dataset.goto);
      if (target > 1 && !tripIsValid()) {
        toast("1단계의 필수 항목을 먼저 입력해 주세요.", "err");
        await goto(1);
        validatePage1(true);
        return;
      }
      await goto(target);
    });
  });

  // 1페이지 준비 (도시 목록 로드 포함)
  await initPage1(() => updateChrome());

  // 저장된 내용 복원 — 답을 받은 뒤부터 저장을 켭니다
  let startPage = await restoreIfAny();
  setSaveArmed(true);

  if (startPage) {
    await reloadAll();
    // 1페이지 필수값이 비어 있으면 2·3단계로 보내지 않습니다
    if (startPage > 1 && !tripIsValid()) startPage = 1;
  }

  await goto(startPage || (state.ui.introSeen ? 1 : "intro"), { push: true });

  // 키가 없으면 한 번만 알려 줍니다 (학생 화면에서는 교사가 키를 넣어 두므로 보이지 않습니다)
  if (!HAS_MAPTILER_KEY) {
    console.warn("[app] MapTiler 키가 설정되지 않아 데모 모드로 실행합니다. config.js 를 확인하세요.");
  }

  // 창을 닫기 전에 저장을 확정합니다
  window.addEventListener("pagehide", () => save());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
}

main().catch(async (e) => {
  console.error("[app] 시작 실패", e);
  await alertDialog({
    title: "앱을 시작하지 못했습니다",
    message: (e && e.message ? e.message : "알 수 없는 오류") +
             "\n\n페이지를 새로고침해 주세요. 계속되면 선생님께 알려 주세요."
  });
});
