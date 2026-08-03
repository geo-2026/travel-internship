# Travel Internship — 여행지리 여행 계획 만들기

고등학교 **여행지리** 수업용 정적 웹앱입니다.
학생은 링크에 접속만 하면 됩니다. **로그인도, API 키 입력도 없습니다.**

```
[1단계] 여행 정보 입력  →  [2단계] 지도에 방문지 표시  →  [3단계] 순서·비용 정리 → PDF 저장
```

- 지도 : **MapLibre GL JS v5 + MapTiler** 벡터 타일
- 장소 검색 : **Photon** (OpenStreetMap 기반, 키 불필요)
- 경로 : **OpenRouteService(ORS)** Directions
- 데이터 : **전량 학생 기기의 localStorage.** 서버·DB·전송 없음

---

## 1. 교사 준비 (처음 한 번, 약 15분)

### 1-1. MapTiler 키 발급 — 필수

1. <https://www.maptiler.com/> 가입 → **Keys** → **New key** (이름 예: `travel-internship-class`)
2. 그 키의 **Allowed origins** 에 배포 주소만 등록합니다.
   ```
   https://<교사계정>.github.io/*
   ```
   → 키가 노출되어도 다른 사이트에서는 쓸 수 없습니다. **이 앱의 핵심 방어선입니다.**
3. `config.js` 를 열어 한 줄만 바꿉니다.
   ```js
   MAPTILER_KEY: "여기에_발급받은_키",
   ```
4. 무료 플랜은 **비상업적 사용** 조건입니다. 화면·PDF의 저작권 표기와 로고를 지우지 마세요.
5. **결제수단은 등록하지 않는 것을 권장합니다.** 무료 플랜은 한도를 넘으면 과금이 아니라
   다음 달까지 서비스가 일시 중지되는 방식이라 청구 사고 위험이 낮습니다.

### 1-2. OpenRouteService 키 발급 — 선택(권장)

1. <https://openrouteservice.org/> 가입 → Dashboard → **Request a token** (무료 플랜)
2. `config.js` 의 `ORS_KEY` 에 넣습니다.

> ⚠ **ORS 무료 키는 도메인 제한을 걸 수 없습니다.**
> 정적 웹앱에 넣으면 키를 복사한 누구나 쓸 수 있습니다. 셋 중 하나를 고르세요.
>
> | 방식 | 내용 |
> |---|---|
> | **B. 키 내장** (현재 기본값) | 가장 단순. 한 학기 수업용이면 충분하며 **학기마다 재발급**하세요. |
> | A. Cloudflare Worker 프록시 | 키를 Worker Secret 에 두고 중계. `config.js` 의 `ORS_PROXY_URL` 에 주소를 넣고 `ORS_KEY` 는 비웁니다. → 키가 브라우저에 노출되지 않습니다. |
> | C. 경로 기능 없이 운영 | 키를 넣지 않으면 방문지를 잇는 **점선 직선**으로 표시됩니다. 수업은 그대로 진행됩니다. |

**키를 넣지 않아도 앱은 동작합니다.** MapTiler 키가 없으면 지도 대신 안내가 표시되는
**데모 모드**로 켜지고, ORS 키가 없으면 경로가 직선으로 표시됩니다.

### 1-3. 수업 도시 · 장소 사전 손보기 — 이 준비가 가장 중요합니다

| 파일 | 무엇을 넣나 |
|---|---|
| `data/cities.json` | 수업에서 다룰 도시. 지금은 60개가 들어 있습니다. |
| `data/aliases.json` | **한글 장소명 → 영문 표기 사전.** |

Photon 은 OpenStreetMap 을 색인하기 때문에 **한국어 질의에 약합니다.**
"오사카성", "이치란 라멘" 같은 한글 검색은 결과가 없거나 엉뚱하게 나올 수 있습니다.
그래서 앱은 이렇게 대응합니다.

```
한글 입력 → ① 별칭 사전으로 영문 치환 → ② Photon(lang=en)
          → 0건이면 ③ Photon(lang=default, 현지어) 재시도
          → 0건이면 ④ MapTiler 지오코딩 폴백
          → 그래도 없으면 ⑤ [지도에서 직접 위치 지정] 안내
```

**수업 전에 그 단원 도시의 주요 장소 20~30개를 `aliases.json` 에 넣어 두세요.**
학생 체감 검색 성공률이 크게 달라집니다.

```json
{
  "오사카성": "Osaka Castle",
  "도톤보리": "Dotonbori",
  "우메다 스카이빌딩": "Umeda Sky Building"
}
```

도시를 추가할 때는 아래 형식을 지킵니다. `center` 와 `bbox` 는 **[경도, 위도]** 순서입니다.

```json
{ "nameKo": "오사카", "nameEn": "Osaka", "country": "일본",
  "center": [135.5023, 34.6937], "zoom": 11,
  "bbox": [135.40, 34.60, 135.60, 34.78],
  "aliases": ["오사카시", "Osaka", "大阪"] }
```

- `country` 가 `"대한민국"` 이면 항공료 입력칸이 자동으로 숨겨집니다.
- 1단계 도시 선택은 **인터넷 검색을 하지 않습니다.** 이 파일만 읽어 메모리에서 찾습니다.

---

## 2. 배포 (GitHub Pages)

1. GitHub 에 **`travel-internship`** 이름으로 저장소를 만듭니다.
2. 이 폴더의 내용을 전부 올립니다. (`.nojekyll` 파일도 반드시 포함)
3. Settings → Pages → Source: **main 브랜치 / (root)**
4. 몇 분 뒤 아래 주소가 열립니다.
   ```
   https://<교사계정>.github.io/travel-internship/
   ```
5. 이 주소로 QR 코드를 만들어 학생에게 배포합니다.

> **저장소명과 브랜치명은 학기 중에 바꾸지 마세요.**
> 링크가 끊기면 안내 자료를 전부 다시 배포해야 합니다.

### 로컬에서 먼저 확인하려면

브라우저 보안 정책 때문에 `index.html` 을 더블클릭해서 여는 방식(`file://`)은 동작하지 않습니다.
간단한 서버를 띄워 주세요.

```bash
cd travel-internship
python -m http.server 8000
#  →  http://localhost:8000
```

---

## 3. 키 유출·과다 사용 시 조치 (5분)

1. MapTiler(또는 ORS) 대시보드에서 **해당 키 삭제**
2. **새 키 발급** (MapTiler 는 Allowed origins 재설정 필수)
3. `config.js` 의 해당 한 줄만 교체
4. 커밋 → 푸시. 몇 분 뒤 반영됩니다.

- 저장소에 유료·비밀 키나 `.env` 실제 값을 커밋하지 마세요.
- **키를 난독화해서 "숨겼다"고 판단하지 마세요.** 효과가 없습니다.
- 앱은 화면·콘솔 어디에도 키 값을 출력하지 않습니다.

---

## 4. 무료 한도와 수업 규모

| 서비스 | 무료 한도 | 초과 시 |
|---|---|---|
| MapTiler | 월 API 요청 10만 건, **세션 5,000건** | 과금이 아니라 다음 달까지 서비스 일시 중지 |
| ORS | 일 2,500건 · 월 40,000건 | 429 응답 |
| Photon | 공식 수치 없음(공정 사용) | 스로틀링 또는 차단 |

> 수치는 2026년 8월 기준입니다. **배포 전에 각 서비스 문서에서 다시 확인하세요.**

**MapTiler 의 병목은 요청 수가 아니라 "세션(지도 객체 초기화) 5,000건"** 입니다.
이 앱은 **지도 인스턴스를 앱 전체에서 1개만 만들어 재사용**합니다.
페이지를 옮길 때 지도를 파괴하지 않고 DOM 위치만 옮기므로 **학생 1명당 세션 1건**입니다.

추정: 40명 × 3개 반 × 4차시 ≈ 480명분 → 세션 약 500건 · ORS 약 500건 · Photon 5천~1만 건 → 모두 한도 안.

**주의**: ORS 일 2,500건은 하루에 여러 반이 몰릴 때 빠듯할 수 있습니다.
이 앱은 순서 변경 후 **800ms 뒤 1회만** 호출하고 같은 순서 조합은 캐싱합니다.

### Photon 공용 서버 사용 예절 (앱에 이미 적용됨)

- 2글자 미만 질의 차단, 세션 내 동일 질의 캐싱
- **1초 1회 · 분당 20회** 상한 (초과 시 "잠시 후 다시 검색해 주세요")
- 타이핑 중 자동 호출이 아니라 **[검색] 버튼 또는 Enter 로만** 호출
  → 40명 동시 접속 시 호출량이 자동완성 방식의 1/5 이하
- 429/5xx 는 지수 백오프로 최대 2회 재시도

학교 단위로 상시 운영할 계획이면 **Photon 자체 호스팅**(Docker + 국가별 덤프)을 검토하세요.
`config.js` 의 `PHOTON_URL` 만 바꾸면 됩니다.

---

## 5. 개인정보 처리

- 모든 입력값은 학생 기기의 **localStorage** 에만 저장됩니다. 쿠키·분석 스크립트 없음.
- 외부로 나가는 것은 **검색어와 좌표뿐** 입니다.
  **학번·이름·여행 명칭은 어떤 API 에도 전송되지 않습니다.**
- 교사도 학생 입력 내용을 열람할 수 없습니다(서버가 없음). 제출은 학생이 저장한 PDF 로만 이루어집니다.
- 설정(⚙)에 **[입력 내용 전체 삭제]** 가 있습니다. 공용 크롬북은 수업 종료 시 눌러 달라고 안내하세요.
- 기기를 바꿔 이어서 작업하려면 설정의 **[계획 내보내기(JSON)] / [불러오기]** 를 쓰면 됩니다.

---

## 6. 폴더 구성

```
travel-internship/
├─ index.html
├─ config.js                     ← ★ 교사가 건드리는 유일한 파일
├─ css/style.css
├─ js/
│   ├─ app.js       페이지 전환 · 복원 · 설정
│   ├─ storage.js   localStorage 데이터 모델
│   ├─ map.js       ★ 지도 인스턴스 1개 생성·재사용
│   ├─ icons.js     아이콘 38종 도형 + 마커 이미지 생성
│   ├─ search.js    Photon · 별칭 사전 · 사용량 제한
│   ├─ route.js     ORS · 디바운스 · 캐싱 · 직선 폴백
│   ├─ modal.js     팝업 공통 프레임
│   ├─ popups.js    팝업 5종
│   ├─ page1.js / page2.js / page3.js
│   └─ pdf.js       2쪽 PDF (3단계에서 동적 로드)
├─ data/cities.json              ← 수업 도시 (자유롭게 추가·삭제)
├─ data/aliases.json             ← 한글→영문 장소명 사전
├─ icons/*.svg                   ← 아이콘 원본 38종
├─ fonts/NotoSansKR-Regular.js   ← PDF용 한글 폰트 (base64)
├─ .nojekyll
└─ README.md
```

모든 파일은 **UTF-8 (BOM 없음)** 입니다. 편집기에서 인코딩을 바꾸지 마세요.

---

## 7. 라이선스 · 출처

| 항목 | 출처 · 라이선스 |
|---|---|
| 지도 타일 | © [MapTiler](https://www.maptiler.com/copyright/) · © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL) |
| 장소 검색 | [Photon](https://photon.komoot.io/) · OpenStreetMap 데이터 (ODbL) |
| 경로 | [openrouteservice](https://openrouteservice.org/) · OpenStreetMap 데이터 (ODbL) |
| 지도 라이브러리 | [MapLibre GL JS](https://maplibre.org/) (BSD-3-Clause) |
| PDF 라이브러리 | [jsPDF](https://github.com/parallax/jsPDF) (MIT) |
| 한글 폰트 | [Noto Sans KR](https://fonts.google.com/noto/specimen/Noto+Sans+KR) (SIL Open Font License 1.1) |
| **아이콘 38종** | **이 저장소에서 직접 그린 도형입니다. 퍼블릭 도메인(CC0) 으로 배포합니다.** 외부 아이콘 세트를 쓰지 않으므로 이름 오타로 마커가 사라질 일이 없습니다. |

지도 화면과 PDF 두 곳 모두에 저작자 표시가 들어갑니다. **표기를 지우지 마세요.**

### 한글 폰트를 다시 만들려면

`fonts/NotoSansKR-Regular.js` 는 Noto Sans KR 가변 폰트를 `wght=400` 으로 고정한 뒤
아래 범위만 남긴 서브셋입니다(TTF 약 2.5MB → base64 약 3.3MB). 3단계에 들어갈 때만 내려받습니다.

- 라틴 · 문장부호 · **한글 음절 전체(U+AC00–D7A3)** · 히라가나/가타카나
- `① ~ ⑳`, `₩`, `※`, `·`, `●▲▼` 등

```bash
pip install fonttools brotli
# NotoSansKR[wght].ttf 를 내려받은 뒤
fonttools varLib.instancer "NotoSansKR[wght].ttf" wght=400 -o NotoSansKR-400.ttf
pyftsubset NotoSansKR-400.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-201F,U+2022,U+2026,U+203B,U+20A9,U+20AC,U+2190-2193,U+2460-2473,U+24EA,U+25A0-25CF,U+2605-2606,U+3000-303F,U+3040-30FF,U+3131-318E,U+AC00-D7A3,U+FF01-FF5E,U+FFE6" \
  --layout-features=kern,liga,ccmp,locl --no-hinting --desubroutinize \
  --output-file=NotoSansKR-subset.ttf
# 결과를 base64 로 바꿔 fonts/NotoSansKR-Regular.js 형식으로 저장
```

> **한자(漢字)는 서브셋에 없습니다.** 파일 크기 때문입니다.
> 검색 결과 원문이 `大阪城` 처럼 한자면 PDF 에서는 그 줄이 자동으로 생략됩니다(빈 네모가 찍히지 않습니다).
> 화면에서는 기기 글꼴로 정상 표시됩니다.

---

## 8. 수업 운영 팁

- 수업 시작 직후 접속이 몰립니다. 지도는 **2단계에 들어갈 때** 처음 만들어지도록 되어 있습니다.
- 학생 입력은 **0.5초 디바운스로 즉시 저장**됩니다. 네트워크가 끊겨도 입력 내용은 남습니다.
- 접근성: 버튼은 최소 44×44px, 색상만으로 구분하지 않도록 **아이콘과 번호를 항상 함께** 표시합니다.
- 교육적 연계: 지도·검색·경로가 모두 OpenStreetMap 기반입니다.
  *"지도 데이터는 누가 만드는가"*, *"왜 어떤 장소는 검색되지 않는가"* 를 그대로 수업 소재로 쓸 수 있습니다.
- 대중교통을 고르면 경로가 **자동차 도로 기준 근사**로 계산됩니다(무료 ORS 에는 대중교통 경로가 없습니다).
  화면과 PDF 모두에 그 사실이 표기되니, 학생이 실제 지하철 노선으로 오해하지 않도록 함께 짚어 주세요.

---

## 9. 자주 묻는 문제

| 증상 | 원인 · 조치 |
|---|---|
| 지도 자리에 "지도 키가 설정되지 않았습니다" | `config.js` 의 `MAPTILER_KEY` 가 아직 기본값입니다. |
| 지도가 회색으로만 나온다 | MapTiler **Allowed origins** 에 배포 주소가 없거나 오타입니다. |
| 경로가 항상 점선 직선이다 | `ORS_KEY` 미설정이거나 일일 한도 초과(429)입니다. |
| 한글로 검색해도 안 나온다 | 정상입니다. `data/aliases.json` 에 그 장소를 추가하거나, **[지도에서 직접 위치 지정]** 을 쓰게 안내하세요. |
| "잠시 후 다시 검색해 주세요" | 분당 20회 상한입니다. 잠시 뒤 다시 됩니다. |
| PDF 한글이 깨진다 | `fonts/NotoSansKR-Regular.js` 가 빠졌거나 손상됐습니다. 다시 올려 주세요. |
| PDF 지도가 회색이다 | 타일 로딩 전에 캡처된 경우입니다. 네트워크를 확인하고 다시 저장해 보세요. |
| 파일을 더블클릭했는데 빈 화면 | `file://` 로는 동작하지 않습니다. 2절의 로컬 서버 방법을 쓰거나 배포 주소로 접속하세요. |
