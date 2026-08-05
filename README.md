# Travel Internship

여행지리 수업용 여행 계획 지도 앱. 학생이 여행 계획을 세우고 방문지를 지도에 표시한 뒤
**2쪽짜리 PDF**로 내려받아 제출합니다.

> **학생 배포 링크 — <https://geo-2026.github.io/travel-internship/>**
> 이 주소가 토큰의 URL 제한에 걸려 있습니다. **저장소 이름과 브랜치를 바꾸면 지도가 멈춥니다.**

- 학생은 **가입·로그인·키 입력 없이** 링크 접속만 하면 됩니다.
- 입력값은 **학생 기기의 localStorage 에만** 저장됩니다. 서버·DB·외부 전송이 없습니다.
- 외부로 나가는 값은 **검색어와 좌표뿐**입니다. 학번·이름·여행 명칭은 어떤 API에도 보내지 않습니다.

---

## 1. 교사 준비 — 3단계 요약

| 순서 | 할 일 | 걸리는 시간 |
|---|---|---|
| 1 | Mapbox public 토큰 발급 + URL 제한 걸기 | 약 10분 |
| 2 | `config.js` 의 `MAPBOX_TOKEN` 한 줄 교체 후 커밋 | 1분 |
| 3 | GitHub Pages 켜고 링크·QR 배포 | 5분 |

`data/cities.json` 에 이번 단원에서 다룰 도시가 들어 있는지도 수업 전에 확인해 주세요
(현재 68개 도시 수록).

---

## 2. Mapbox 토큰 발급

1. [mapbox.com](https://www.mapbox.com/) 가입 → 이메일 인증
2. **Account → Tokens → Create a token**
3. 이름: `travel-internship-class`
4. **Public scope 만** 체크합니다 — `styles:tiles`, `styles:read`, `fonts:read`, `datasets:read` 등 읽기 전용.
   `*:write`, `tokens:write` 같은 **Secret scope 는 절대 체크하지 마세요.**
5. **URL restrictions** 에 아래 **한 줄만** 입력합니다.

   ```
   https://geo-2026.github.io/*
   ```

   > 이 항목이 **이 앱의 가장 중요한 방어선**입니다. 토큰이 노출되어도 다른 사이트에서는
   > 요청이 거부됩니다. `geo-2026.github.io` 는 교사 계정의 GitHub Pages 도메인이라
   > 외부인이 이 주소로 페이지를 올릴 수 없습니다.

   ### ⚠ 경로(`/travel-internship/*`)까지 적으면 지도가 안 나옵니다

   실제로 겪은 문제입니다. `https://geo-2026.github.io/travel-internship/*` 처럼
   **경로까지** 적으면 이렇게 됩니다.

   | 기능 | 결과 |
   |---|---|
   | 검색 · 경로 · 정적 지도 | 동작함 |
   | **지도 타일** | **전부 403 — 지도가 빈 화면** |

   지도 타일은 브라우저의 **웹 워커**가 받아 오는데, 워커의 요청에는 경로가 빠진
   `https://geo-2026.github.io/` 만 실려 나갑니다. 그래서 경로까지 적은 제한과는
   영원히 일치하지 않습니다. **반드시 도메인까지만 적으세요.**

6. 발급된 `pk.` 로 시작하는 토큰을 `config.js` 에 붙여 넣습니다.

   ```js
   // config.js — 이 한 줄만 바꾸면 토큰 교체 완료
   MAPBOX_TOKEN: "pk.여기에붙여넣기",
   ```

7. `sk.` 로 시작하는 **secret token 은 어떤 경우에도** 프런트엔드·저장소에 두지 않습니다.

### 토큰이 아직 없을 때

토큰을 넣지 않아도 앱은 켜집니다. 화면 위에 안내 배너가 뜨고 지도·검색·경로만 동작하지 않습니다.
1페이지 입력, 카드 목록, 순서 지정, PDF 생성은 그대로 확인할 수 있습니다.

### 유출·과다 사용을 발견했을 때 (5분 조치)

1. Mapbox 대시보드에서 해당 토큰 **삭제**
2. 같은 설정으로 **신규 발급**
3. `config.js` 의 `MAPBOX_TOKEN` **1줄 교체**
4. 커밋 → push (GitHub Pages 가 1~2분 내 반영)

---

## 3. 배포 (GitHub Pages)

이미 배포되어 있습니다. 아래는 처음부터 다시 만들 때의 절차입니다.

1. 저장소 이름을 **`travel-internship`** 으로 만듭니다. 링크가 저장소 이름으로 정해지므로
   **학기 중에 저장소명·브랜치명을 바꾸지 마세요.**
2. 이 폴더의 내용을 저장소 루트에 올립니다.
3. **Settings → Pages → Source: `main` 브랜치 / `(root)`**
4. 고정 링크: **<https://geo-2026.github.io/travel-internship/>**
5. **Settings → Code security → Secret scanning** 을 켜 두면 실수로 올린 토큰을 잡아 줍니다.

### 수정 사항을 올릴 때

```bash
cd "C:\Users\Administrator\Desktop\travel-internship"
git add -A
git commit -m "무엇을 바꿨는지"
git push
```

푸시하고 1~2분 뒤에 반영됩니다. 학생 화면에 옛 파일이 남아 있으면
**Ctrl+Shift+R**(안드로이드·iOS 는 새로고침 후 재접속)로 새로 받게 안내해 주세요.

`.nojekyll` 파일이 들어 있어야 `_` 로 시작하는 경로가 무시되지 않습니다 (이미 포함되어 있습니다).

### 학생 배포용 QR 코드

배포 주소가 정해진 뒤 아래 명령으로 만듭니다.

```bash
pip install "qrcode[pil]"
python tools/make_qr.py https://geo-2026.github.io/travel-internship/
# → docs/qr.png 생성
```

만들어진 `docs/qr.png` 를 학습지·클래스룸에 넣어 배포하세요.

---

## 4. 로컬에서 미리 보기

이 앱은 ES 모듈과 `fetch` 를 쓰기 때문에 `index.html` 을 더블클릭해서 여는 방식
(`file://`)으로는 동작하지 않습니다. 아주 작은 로컬 서버가 필요합니다.

```bash
cd travel-internship
python -m http.server 8777
# 브라우저에서 http://127.0.0.1:8777/ 접속
```

---

## 5. 폴더 구조

```
travel-internship/
├─ index.html                    # <title>Travel Internship</title>
├─ config.js                     # ★ 교사가 손대는 유일한 파일 (토큰)
├─ css/style.css
├─ js/
│   ├─ app.js                    # 라우팅 + 1·2·3페이지 화면
│   ├─ storage.js                # localStorage 단일 키 관리
│   ├─ map.js                    # 지도 인스턴스 1개 재사용, symbol layer
│   ├─ search.js                 # Geocoding + 호출 절감 장치
│   ├─ route.js                  # Directions + 캐싱
│   ├─ placeform.js              # 방문지 팝업 4종 + 이동방법 팝업
│   ├─ icons.js                  # 유형별 색상·아이콘 팔레트
│   ├─ ui.js                     # 모달·토스트·금액 입력
│   └─ pdf.js                    # 2쪽 PDF (3페이지 진입 시 동적 import)
├─ data/cities.json              # 도시 프리셋 68개 (한글명 포함)
├─ icons/*.svg                   # 유형별 아이콘 38종 (자체 제작)
├─ fonts/NotoSansKR-Regular.js   # 한글 서브셋 base64 (SIL OFL)
├─ vendor/                       # mapbox-gl 3.x, jsPDF 3.x (저장소에 포함)
├─ tools/                        # 폰트·아이콘·QR 생성 스크립트
├─ .nojekyll
└─ README.md
```

의존성을 CDN 대신 `vendor/` 에 넣어 둔 이유는, 학교망에서 CDN 이 막혀도 수업이
멈추지 않게 하기 위해서입니다.

---

## 6. 사용량과 비용

2026년 8월 기준 월 무료 한도(배포 전 [mapbox.com/pricing](https://www.mapbox.com/pricing) 재확인):

| 제품 | 월 무료 한도 | 학생 1명·1차시 추정 |
|---|---|---|
| 웹 지도 로드 | 약 50,000 | 2~3 |
| Search Box (방문지 검색) | 약 50,000 | 15~30 |
| Geocoding (도시 검색·검색 보조) | 약 100,000 | 0~5 |
| Directions | 약 100,000 | 3~5 |
| Static Images | 약 50,000 | 0~1 (폴백일 때만) |

**40명 × 3개 반 × 4차시 ≈ 지도 로드 1,500 / 검색 1만 내외** 로 무료 한도 안에서 여유 있게 운영됩니다.

> ⚠ Mapbox 에는 자동으로 과금을 막는 하드 지출 상한이 없습니다.
> **계정에 결제수단을 등록하지 않은 상태로 유지**하고, 대시보드에서 **사용량 알림**을
> 무료 한도의 70%·90% 지점에 설정해 두세요.

### 앱에 들어 있는 호출 절감 장치

- 도시 선택은 내장 목록이 기본 → **네트워크 호출 0회**
- 검색: 디바운스 300ms, 2글자 미만 차단, 동일 질의 캐싱, **분당 20회 상한**, 429/5xx 지수 백오프 2회
- 검색 1회 = **API 1회**. 결과가 0건일 때만 보조 경로로 1회 더 부릅니다
- 경로: 순서 변경이 멈춘 뒤 **800ms 후 1회만** 호출, 동일 순서 조합 캐싱
- 지도 인스턴스는 앱 전체에서 **1개**만 만들어 페이지 전환 시 재사용
- PDF 지도는 캔버스 캡처가 기본이라 **추가 API 호출 0회**

---

## 7. 수업 운영 메모

- 지도 라이브러리(1.8MB)는 **2페이지에 처음 들어갈 때** 내려받습니다. 수업 시작 직후 접속이
  몰려도 1페이지는 가볍게 열립니다.
- jsPDF 와 한글 폰트는 **3페이지 진입 시** 내려받습니다.
- 한글 라벨이 없는 지역은 현지어로 표시되는 것이 정상입니다. 학생에게 미리 안내해 주세요.
- 검색이 안 될 때를 대비해 **지도를 길게 눌러 위치를 직접 지정**하는 길을 같은 위치에 두었습니다.

### ★ 장소 검색 — 수업 전에 꼭 안내할 것

방문지 검색은 **선택한 도시 범위 안에서만** 찾습니다. 실제로 확인한 동작은 이렇습니다.

| 상황 | 결과 | 학생에게 안내할 말 |
|---|---|---|
| **국내** 장소를 한글로 | 잘 찾습니다 (경복궁, 광장시장, 성산일출봉, 해운대해수욕장 등) | 그냥 한글로 치면 됩니다 |
| **해외** 장소를 한글 음차로 | **못 찾습니다** (오사카성 ✗, 도쿄타워 ✗) | — |
| 해외 장소를 **현지어·영문**으로 | 잘 찾습니다 (大阪城 ✓, 清水寺 ✓, Sagrada Familia ✓, Colosseo ✓, Wat Pho ✓) | **해외는 현지어나 영문으로 검색** |
| 주소·지하철역 | 잘 찾습니다 (서울 종로구 사직로 161, 경복궁역) | 이름이 안 나오면 주소로 |
| 그래도 안 나올 때 | — | **지도를 0.6초 길게 눌러 직접 지정** |

해외 장소가 한글로 안 잡히는 것은 Mapbox 검색 색인에 한글 음차 이름이 없기 때문이며,
앱 설정으로 해결할 수 있는 문제가 아닙니다. 화면에도 해외 도시를 고른 학생에게는
"영문·현지어 이름으로 검색해 보세요" 안내가 자동으로 뜹니다.
- **대중교통 경로는 도로 기준 근사**입니다(Mapbox Directions 에 transit 프로필이 없음).
  화면과 PDF 양쪽에 안내 문구가 자동으로 붙습니다.
- 공용 크롬북은 브라우저 프로필별로 저장되므로, 수업이 끝나면 **설정 → [입력 내용 전체 삭제]** 를 안내해 주세요.
- 기기가 바뀌어도 이어서 작업할 수 있도록 **설정 → [계획 내보내기/불러오기(JSON)]** 를 넣어 두었습니다.

---

## 8. 자산 다시 만들기 (선택)

폰트나 아이콘을 바꿀 일이 있을 때만 필요합니다. 기본 상태로 쓸 거라면 건드리지 않아도 됩니다.

```bash
# 아이콘 38종 다시 생성
python tools/make_icons.py

# 한글 폰트 서브셋 다시 생성 (fontTools 필요)
pip install fonttools brotli
python tools/subset_font.py .              # KS X 1001 기준 (기본, 약 660KB)
python tools/subset_font.py . --all-hangul # 현대 한글 11,172자 전체 (약 2.6MB)
python tools/subset_font.py . --hanja      # 한자까지 포함
```

`tools/icon-preview.html` 을 로컬 서버로 열면 아이콘 38종을 한눈에 확인할 수 있습니다.

---

## 9. 라이선스·출처

- 지도·검색·경로: **© Mapbox © OpenStreetMap** — 저작권 표시를 제거하지 마세요.
- 한글 폰트: **Noto Sans KR** (SIL Open Font License 1.1)
- 지도 아이콘 38종: 이 저장소에서 직접 제작
- [mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js) (Mapbox TOS), [jsPDF](https://github.com/parallax/jsPDF) (MIT)
