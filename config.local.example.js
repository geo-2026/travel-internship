// config.local.example.js — 로컬 미리보기용 토큰 파일의 견본입니다.
//
// 배포용 토큰(travel-internship-class)은 URL 제한이 걸려 있어
// http://127.0.0.1 에서는 Mapbox 가 403 으로 막습니다. 그래서 로컬로 열면
// 지도가 뜨지 않는 것이 정상입니다.
//
// 로컬에서도 지도를 보려면:
//   1. 이 파일을 복사해서 같은 폴더에 `config.local.js` 라는 이름으로 저장합니다.
//   2. 아래 값을 URL 제한이 없는 토큰(예: travel-internship-test)으로 바꿉니다.
//   3. 페이지를 새로고침합니다.
//
// `config.local.js` 는 .gitignore 에 들어 있어 GitHub 에 올라가지 않습니다.
// 배포 주소에서는 이 파일을 불러오지도 않으므로 학생 쪽에는 영향이 없습니다.

export const LOCAL_MAPBOX_TOKEN = "pk.여기에_제한없는_테스트_토큰을_붙여넣기";
