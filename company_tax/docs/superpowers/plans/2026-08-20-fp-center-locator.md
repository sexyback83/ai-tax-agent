# 가까운 FP센터 찾기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FC가 현재 위치에서 가장 가까운 삼성생명 FP센터 3곳을 확인하는 조회 페이지를 만든다.

**Architecture:** 프레임워크·빌드도구·서버 없이 정적 파일 4개. 데이터와 순수 계산 함수를 화면에서 분리해 Node.js로 자동 검증한다. 지도는 임베드하지 않고 카카오맵 공개 링크로 연결하므로 API 키가 필요 없고, 런타임 네트워크 호출이 0줄이다.

**Tech Stack:** 순수 HTML/CSS/JavaScript. 테스트는 `node:assert/strict` + `node` 직접 실행 (테스트 프레임워크 없음). 브라우저 Geolocation API.

**Spec:** [../specs/2026-08-20-fp-center-locator-design.md](../specs/2026-08-20-fp-center-locator-design.md)

## Global Constraints

- **모듈 방식**: 기존 `company_tax/tax-review/calc.js` 패턴을 따른다. 파일 끝에 `if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }` 가드를 두어 브라우저에서는 전역, Node에서는 `require`로 동작하게 한다. **ESM(`import`/`export`)을 쓰지 않는다.**
- **테스트 실행**: `node company_tax/fp-center/fp-center.test.js` — 프레임워크 없음, 실패 시 비정상 종료.
- **기대값 산출**: 구현을 실행해 얻은 값을 기대값으로 삼지 않는다 (프로젝트 원칙 제3조). 하버사인 수식으로 직접 계산한 값을 쓰고 산출 과정을 주석에 남긴다.
- **네트워크 호출 금지**: `fetch`·`XMLHttpRequest`·WebSocket을 한 줄도 쓰지 않는다 (NFR-03·04). 카카오맵 연결은 `<a href>` 이동만 허용한다.
- **저장소 사용 금지**: `localStorage`·`sessionStorage`·쿠키를 쓰지 않는다 (원칙 제4조).
- **좌표 상수**: 8곳 좌표는 2026-08-20에 확보 완료. 런타임 지오코딩을 하지 않는다.
- **주소 표기**: 인쇄물(준법감시필 25-3281) 표기를 그대로 쓴다. 임의로 고치지 않는다.
- **거리 반올림**: 계산 함수는 원값을 반환하고, 반올림은 화면 계층이 한다.

## File Structure

```
company_tax/fp-center/
├── centers.js         # 데이터 8건 + 준법감시 메타 + 유효기간 판정. DOM 의존 없음
├── nearest.js         # 거리 계산·정렬. DOM 의존 없음
├── fp-center.test.js  # 위 두 모듈 테스트
└── index.html         # 화면. 위치 획득·폴백·렌더
```

**스펙과의 차이 1건**: 스펙은 테스트 파일명을 `nearest.test.js`로 적었으나, `centers.js`의 유효기간 판정도 함께 검증하므로 `fp-center.test.js`로 한다.

`centers.js`가 데이터와 그 데이터의 유효기간 판정을 함께 갖는다. 유효기간은 데이터의 속성이지 거리 계산의 관심사가 아니므로 `SOURCE` 옆에 두는 것이 자연스럽다.

---

### Task 1: centers.js — 데이터와 유효기간 판정

**Files:**
- Create: `company_tax/fp-center/centers.js`
- Create: `company_tax/fp-center/fp-center.test.js`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces:
  - `CENTERS` — 배열. 각 원소 `{ 이름: string, 전화: string, 주소: string, lat: number, lng: number }`
  - `SOURCE` — `{ 심의번호: string, 담당: string, 유효기간: { 시작: string, 만료: string } }`
  - `expiryStatus(오늘)` — 인자는 `'YYYY-MM-DD'` 문자열. 반환 `{ 남은일수: number, 경고: boolean, 만료됨: boolean }`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`company_tax/fp-center/fp-center.test.js` 를 만들고 아래를 넣는다.

```javascript
'use strict';
// 가까운 FP센터 찾기 — 데이터·계산 모듈 검증
// 실행: node company_tax/fp-center/fp-center.test.js
//
// 기대값 산출 근거 (원칙 제3조):
//   · 거리 기대값은 하버사인 수식으로 직접 계산했다. 산출 과정은 각 단언 옆 주석에 남긴다.
//   · 구현을 실행해 얻은 값을 기대값으로 삼지 않았다.

const assert = require('node:assert/strict');
const { CENTERS, SOURCE, expiryStatus } = require('./centers.js');

// --- 데이터 무결성 ---
assert.equal(CENTERS.length, 8, 'FP센터는 8곳이다');

for (const c of CENTERS) {
  assert.ok(c.이름 && c.전화 && c.주소, c.이름 + ': 필수 필드 누락');
  // 대한민국 본토 범위. 좌표가 뒤바뀌거나 0이면 여기서 걸린다.
  assert.ok(c.lat > 33 && c.lat < 39, c.이름 + ': 위도 범위 이탈 ' + c.lat);
  assert.ok(c.lng > 124 && c.lng < 132, c.이름 + ': 경도 범위 이탈 ' + c.lng);
}

assert.equal(new Set(CENTERS.map(c => c.이름)).size, 8, '센터 이름이 중복되지 않는다');

// --- 준법감시 메타 ---
assert.equal(SOURCE.심의번호, '25-3281');
assert.equal(SOURCE.유효기간.만료, '2026-10-27');

// --- 유효기간 판정 ---
// 만료일 2026-10-27 기준. 경고 임계는 60일.
// 2026-08-27 → 8/28~8/31 4일 + 9월 30일 + 10/1~10/27 27일 = 61일
assert.equal(expiryStatus('2026-08-27').남은일수, 61);
assert.equal(expiryStatus('2026-08-27').경고, false, '61일 전에는 경고하지 않는다');

// 2026-08-28 → 3 + 30 + 27 = 60일
assert.equal(expiryStatus('2026-08-28').남은일수, 60);
assert.equal(expiryStatus('2026-08-28').경고, true, '60일 전부터 경고한다');

// 만료 당일은 아직 유효하다
assert.equal(expiryStatus('2026-10-27').만료됨, false);
assert.equal(expiryStatus('2026-10-27').남은일수, 0);

// 만료 다음날
assert.equal(expiryStatus('2026-10-28').만료됨, true);
assert.equal(expiryStatus('2026-10-28').남은일수, -1);

console.log('OK centers.js 통과');
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node company_tax/fp-center/fp-center.test.js`

Expected: FAIL — `Cannot find module './centers.js'`

- [ ] **Step 3: centers.js 를 구현한다**

```javascript
'use strict';
// 삼성생명 FP센터 8곳.
// 출처: FP센터 안내 인쇄물 (준법감시필 25-3281, WM팀)
// 주소는 인쇄물 표기 그대로 둔다. 심의받은 문구를 임의로 고치지 않는다.
// 좌표는 2026-08-20에 카카오 로컬 API로 1회 변환해 확보했다. 런타임 지오코딩은 하지 않는다.

const SOURCE = {
  심의번호: '25-3281',
  담당: 'WM팀',
  유효기간: { 시작: '2025-10-28', 만료: '2026-10-27' },
};

const CENTERS = [
  { 이름: '서울FP센터', 전화: '02-3706-3916', 주소: '서울 종로구 종로 33 그랑서울 14층',                      lat: 37.570962, lng: 126.981438 },
  { 이름: '강남FP센터', 전화: '02-3451-1700', 주소: '서울특별시 서초구 서초대로74길 4 삼성생명 서초타워 11층', lat: 37.496744, lng: 127.025704 },
  { 이름: '경인FP센터', 전화: '032-516-3900', 주소: '인천광역시 남동구 인주대로 611 삼성생명빌딩 19층',        lat: 37.450259, lng: 126.705064 },
  { 이름: '경원FP센터', 전화: '031-226-1529', 주소: '경기도 수원시 팔달구 경수대로 560 삼성생명빌딩 14층',     lat: 37.275631, lng: 127.030594 },
  { 이름: '충청FP센터', 전화: '042-484-0821', 주소: '대전광역시 서구 한밭대로 755 삼성생명빌딩 25층',          lat: 36.358174, lng: 127.382504 },
  { 이름: '부산FP센터', 전화: '051-630-6620', 주소: '부산광역시 부산진구 중앙대로 639 삼성생명빌딩 2층',       lat: 35.149733, lng: 129.058779 },
  { 이름: '대구FP센터', 전화: '053-250-5150', 주소: '대구광역시 중구 달구벌대로 2095(삼성생명) 17층',          lat: 35.866318, lng: 128.592799 },
  { 이름: '호남FP센터', 전화: '062-384-0529', 주소: '광주광역시 동구 금남로 148 삼성생명빌딩 15층',            lat: 35.153292, lng: 126.910021 },
];

const 경고_임계일 = 60;

// 'YYYY-MM-DD' 두 개를 UTC 자정 기준으로 비교한다.
// 로컬 타임존을 쓰면 실행 환경에 따라 하루가 밀리므로 UTC로 고정한다.
function 일수차(from, to) {
  const ms = s => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86400000);
}

function expiryStatus(오늘) {
  const 남은일수 = 일수차(오늘, SOURCE.유효기간.만료);
  return {
    남은일수,
    만료됨: 남은일수 < 0,
    경고: 남은일수 >= 0 && 남은일수 <= 경고_임계일,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CENTERS, SOURCE, expiryStatus };
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `node company_tax/fp-center/fp-center.test.js`

Expected: PASS — `OK centers.js 통과`

- [ ] **Step 5: 커밋한다**

```bash
git add company_tax/fp-center/centers.js company_tax/fp-center/fp-center.test.js
git commit -m "feat(fp-center): FP센터 8곳 데이터와 유효기간 판정 추가"
```

---

### Task 2: nearest.js — 거리 계산과 정렬

**Files:**
- Create: `company_tax/fp-center/nearest.js`
- Modify: `company_tax/fp-center/fp-center.test.js` (마지막 `console.log` 앞에 삽입)

**Interfaces:**
- Consumes: Task 1의 `CENTERS` (테스트에서만 사용)
- Produces:
  - `distanceKm(lat1, lng1, lat2, lng2)` — 반환 `number` (km, 반올림하지 않은 원값)
  - `nearest(lat, lng, centers, n)` — `n` 기본값 3. 반환 `Array<{...center, 거리km: number}>`, 가까운 순 최대 n개. `centers`가 n보다 적으면 있는 만큼만.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`fp-center.test.js` 의 마지막 줄 `console.log('OK centers.js 통과');` **앞에** 아래를 삽입한다.

```javascript
const { distanceKm, nearest } = require('./nearest.js');

// --- distanceKm ---
// 지구 반지름 6371km. 위도 1도 = 6371 × (π/180) = 6371 × 0.0174533 = 111.195 km
// 경도차가 0이므로 하버사인에는 위도차 항만 남는다.
assert.ok(Math.abs(distanceKm(0, 0, 1, 0) - 111.195) < 0.01, '위도 1도 = 111.195km');

// 적도에서 경도 1도도 같은 값이다 (cos 0 = 1)
assert.ok(Math.abs(distanceKm(0, 0, 0, 1) - 111.195) < 0.01, '적도 경도 1도 = 111.195km');

// 동일 좌표
assert.equal(distanceKm(37.5, 127.0, 37.5, 127.0), 0, '같은 좌표는 0km');

// 대칭성
assert.equal(
  distanceKm(37.570962, 126.981438, 35.149733, 129.058779),
  distanceKm(35.149733, 129.058779, 37.570962, 126.981438),
  '거리는 방향에 무관하다'
);

// 서울FP센터(37.570962,126.981438) ↔ 부산FP센터(35.149733,129.058779)
// Δφ = -2.421229° = -0.0422540 rad,  Δλ = 2.077341° = 0.0362565 rad
// sin²(Δφ/2) = (-0.0211254)² = 0.00044628
// cosφ1·cosφ2 = 0.792746 × 0.817656 = 0.648193
// sin²(Δλ/2) = (0.0181270)² = 0.00032859  →  0.648193 × 0.00032859 = 0.00021299
// a = 0.00065927,  √a = 0.0256763,  c = 2·asin(√a) = 0.0513582
// d = 6371 × 0.0513582 = 327.20 km
assert.ok(
  Math.abs(distanceKm(37.570962, 126.981438, 35.149733, 129.058779) - 327.20) < 1,
  '서울↔부산 약 327km'
);

// --- nearest ---
// 강남역 부근 (37.4979, 127.0276) 기준 손계산 (위도 1도 = 111.195km, 경도 1도 = 111.195 × cos37.47° = 88.26km):
//   강남FP센터  약 0.2km   (Δφ 0.001156° → 0.13km, Δλ 0.001896° → 0.17km)
//   서울FP센터  약 9.1km   (Δφ 0.073062° → 8.12km, Δλ 0.046162° → 4.07km)
//   경원FP센터  약 24.7km  (Δφ 0.222269° → 24.71km, 경도차 0.003° 무시 가능)
//   경인FP센터  약 29.0km  (Δφ 0.047641° → 5.30km, Δλ 0.322536° → 28.46km)
// 따라서 상위 3곳은 강남 → 서울 → 경원 순이다.
const 강남기준 = nearest(37.4979, 127.0276, CENTERS);
assert.equal(강남기준.length, 3, '기본 반환 개수는 3');
assert.deepEqual(
  강남기준.map(c => c.이름),
  ['강남FP센터', '서울FP센터', '경원FP센터'],
  '강남역 기준 가까운 순'
);
assert.ok(강남기준[0].거리km < 1, '강남FP센터는 1km 이내');
assert.ok(강남기준[0].거리km < 강남기준[1].거리km, '오름차순 정렬');
assert.ok(강남기준[1].거리km < 강남기준[2].거리km, '오름차순 정렬');

// 원본 필드가 보존된다
assert.equal(강남기준[0].전화, '02-3451-1700');

// 원거리 좌표 — 제주시청 부근 (33.4996, 126.5312) 손계산:
//   호남FP센터  약 187km  (Δφ 1.653692° → 183.88km, Δλ 0.378821° → 34.80km)
//   부산FP센터  약 296km  (Δφ 1.650133° → 183.49km, Δλ 2.527579° → 232.18km)
//   대구FP센터  약 324km / 충청FP센터 약 327km
// 3위와 4위는 손계산 오차 범위(약 3km) 안에서 갈리므로 단언하지 않는다.
// 1·2위는 100km 이상 벌어져 있어 안전하다.
const 제주기준 = nearest(33.4996, 126.5312, CENTERS);
assert.equal(제주기준[0].이름, '호남FP센터', '제주에서 가장 가까운 곳은 호남');
assert.equal(제주기준[1].이름, '부산FP센터', '제주에서 두 번째는 부산');
assert.ok(제주기준[0].거리km > 100, '제주에는 센터가 없으므로 100km를 넘는다');

// 개수 지정
assert.equal(nearest(37.4979, 127.0276, CENTERS, 1).length, 1);
assert.equal(nearest(37.4979, 127.0276, CENTERS, 8).length, 8);

// 요청 개수가 센터 수보다 많으면 있는 만큼만
assert.equal(nearest(37.4979, 127.0276, CENTERS, 99).length, 8, '있는 만큼만 반환한다');

// 빈 배열
assert.deepEqual(nearest(37.4979, 127.0276, []), []);

// 원본 배열을 변형하지 않는다
const 원본순서 = CENTERS.map(c => c.이름);
nearest(35.1, 129.0, CENTERS);
assert.deepEqual(CENTERS.map(c => c.이름), 원본순서, 'nearest는 입력 배열을 정렬하지 않는다');

console.log('OK nearest.js 통과');
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node company_tax/fp-center/fp-center.test.js`

Expected: FAIL — `Cannot find module './nearest.js'`

- [ ] **Step 3: nearest.js 를 구현한다**

```javascript
'use strict';
// 두 좌표 사이 직선거리(대권거리)와 가까운 순 정렬.
// DOM에 의존하지 않는 순수 함수라 Node에서 그대로 테스트된다.
// 현재 위치는 인자로 받는다 — Geolocation API는 이 모듈 밖의 관심사다.

const 지구반지름km = 6371;

const 라디안 = deg => (deg * Math.PI) / 180;

function distanceKm(lat1, lng1, lat2, lng2) {
  const dφ = 라디안(lat2 - lat1);
  const dλ = 라디안(lng2 - lng1);
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(라디안(lat1)) * Math.cos(라디안(lat2)) * Math.sin(dλ / 2) ** 2;
  return 2 * 지구반지름km * Math.asin(Math.sqrt(a));
}

// 반올림하지 않은 원값을 그대로 넘긴다. 표시 형식은 화면 계층의 책임이다.
// 입력 배열을 정렬하지 않도록 map으로 새 배열을 만든 뒤 sort한다.
function nearest(lat, lng, centers, n = 3) {
  return centers
    .map(c => ({ ...c, 거리km: distanceKm(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.거리km - b.거리km)
    .slice(0, n);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { distanceKm, nearest };
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `node company_tax/fp-center/fp-center.test.js`

Expected: PASS — `OK nearest.js 통과` 와 `OK centers.js 통과` 가 둘 다 출력된다

- [ ] **Step 5: 커밋한다**

```bash
git add company_tax/fp-center/nearest.js company_tax/fp-center/fp-center.test.js
git commit -m "feat(fp-center): 하버사인 거리 계산과 가까운 순 정렬 추가"
```

---

### Task 3: index.html — 화면

**Files:**
- Create: `company_tax/fp-center/index.html`

**Interfaces:**
- Consumes: `CENTERS`, `SOURCE`, `expiryStatus` (centers.js 전역), `nearest` (nearest.js 전역)
- Produces: 없음 (최종 산출물)

**동작 요건**
- 진입 시 전체 8곳이 보인다. 위치 없이도 완결된 화면이다.
- `[가까운 센터 찾기]` 버튼을 눌러야 위치를 요청한다. 자동 실행하지 않는다.
- 버튼 아래에 고지 문구를 항상 표시한다: "현재 위치는 가까운 센터를 계산하는 데만 쓰이며 저장·전송되지 않습니다."
- 성공 시 상단에 가까운 3곳(거리 포함), 아래에 전체 8곳(항상 8곳 그대로 — 상위 3곳을 빼지 않는다).
- 거리는 소수점 첫째 자리(`12.4km`), 1km 미만은 `1km 이내`.
- 실패·거부·미지원·한국 밖이면 상단 영역 없이 전체 목록만 남고 안내 문구를 띄운다.
- `expiryStatus`가 경고면 상단에 배너, 만료면 문구를 바꿔 표시한다.

- [ ] **Step 1: index.html 을 작성한다**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>가까운 FP센터 찾기</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0 auto; padding: 20px;
         max-width: 640px; color: #222; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 15px; color: #666; margin: 24px 0 8px; font-weight: 600; }
  button { padding: 10px 18px; font: inherit; cursor: pointer; border: 1px solid #1428A0;
           background: #1428A0; color: #fff; border-radius: 6px; }
  button:disabled { opacity: .5; cursor: default; }
  .notice { font-size: 12px; color: #666; margin-top: 8px; }
  .msg { margin: 12px 0; padding: 10px 12px; border-radius: 6px; font-size: 14px; }
  .msg-info { background: #eef2fb; }
  .msg-warn { background: #fff6e5; }
  .msg-err  { background: #fdeeee; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
  li.near { border-color: #1428A0; }
  .name { font-weight: 700; }
  .dist { color: #1428A0; font-weight: 700; margin-left: 6px; }
  .addr { font-size: 13px; color: #555; margin: 4px 0; }
  .links a { font-size: 13px; margin-right: 12px; color: #1428A0; }
  footer { margin-top: 32px; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 12px; }
</style>
</head>
<body>

<h1>가까운 FP센터 찾기</h1>

<button id="find">가까운 센터 찾기</button>
<p class="notice">현재 위치는 가까운 센터를 계산하는 데만 쓰이며 저장·전송되지 않습니다.</p>

<div id="expiry"></div>
<div id="message"></div>

<div id="nearBlock" hidden>
  <h2>가까운 센터</h2>
  <ul id="nearList"></ul>
</div>

<h2>전체 FP센터</h2>
<ul id="allList"></ul>

<footer id="source"></footer>

<script src="centers.js"></script>
<script src="nearest.js"></script>
<script>
'use strict';

const $ = id => document.getElementById(id);

function 거리표기(km) {
  return km < 1 ? '1km 이내' : km.toFixed(1) + 'km';
}

// 사용자 입력이 아닌 상수 데이터만 다루지만, textContent로 넣어 HTML 주입 경로를 원천 차단한다.
function 항목(center, 거리km) {
  const li = document.createElement('li');

  const 제목 = document.createElement('div');
  const 이름 = document.createElement('span');
  이름.className = 'name';
  이름.textContent = center.이름;
  제목.appendChild(이름);

  if (거리km !== undefined) {
    li.className = 'near';
    const d = document.createElement('span');
    d.className = 'dist';
    d.textContent = 거리표기(거리km);
    제목.appendChild(d);
  }

  const 주소 = document.createElement('div');
  주소.className = 'addr';
  주소.textContent = center.주소;

  const 링크 = document.createElement('div');
  링크.className = 'links';

  const tel = document.createElement('a');
  tel.href = 'tel:' + center.전화.replace(/-/g, '');
  tel.textContent = center.전화;

  const map = document.createElement('a');
  map.href = 'https://map.kakao.com/link/map/'
    + encodeURIComponent(center.이름) + ',' + center.lat + ',' + center.lng;
  map.target = '_blank';
  map.rel = 'noopener';
  map.textContent = '카카오맵에서 보기';

  링크.append(tel, map);
  li.append(제목, 주소, 링크);
  return li;
}

function 안내(문구, 종류) {
  $('message').textContent = '';
  if (!문구) return;
  const div = document.createElement('div');
  div.className = 'msg msg-' + 종류;
  div.textContent = 문구;
  $('message').appendChild(div);
}

// --- 초기 렌더: 위치 없이도 완결된 화면 ---
CENTERS.forEach(c => $('allList').appendChild(항목(c)));

$('source').textContent =
  '출처: 삼성생명 FP센터 안내 · 준법감시필 ' + SOURCE.심의번호
  + '(' + SOURCE.담당 + ', ' + SOURCE.유효기간.시작 + '~' + SOURCE.유효기간.만료 + ')';

// --- 준법감시 유효기간 ---
(function 유효기간표시() {
  const 오늘 = new Date().toISOString().slice(0, 10);
  const s = expiryStatus(오늘);
  if (!s.경고 && !s.만료됨) return;
  const div = document.createElement('div');
  div.className = 'msg msg-warn';
  div.textContent = s.만료됨
    ? '준법감시 유효기간이 지났습니다 (' + SOURCE.유효기간.만료 + '). 자료 갱신이 필요합니다.'
    : '준법감시 유효기간이 ' + s.남은일수 + '일 남았습니다 (' + SOURCE.유효기간.만료 + ').';
  $('expiry').appendChild(div);
})();

// --- 위치 기반 조회 ---
if (!navigator.geolocation) {
  $('find').hidden = true;
  안내('이 브라우저는 위치 조회를 지원하지 않습니다. 전체 목록에서 확인해 주세요.', 'info');
}

$('find').addEventListener('click', () => {
  $('find').disabled = true;
  안내('위치를 확인하는 중입니다…', 'info');

  navigator.geolocation.getCurrentPosition(
    pos => {
      $('find').disabled = false;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // 대한민국 본토 범위를 벗어나면 거리 정렬이 의미가 없다.
      if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
        $('nearBlock').hidden = true;
        안내('현재 위치가 국내가 아닌 것으로 확인됩니다. 전체 목록에서 확인해 주세요.', 'info');
        return;
      }

      const 결과 = nearest(lat, lng, CENTERS);
      $('nearList').textContent = '';
      결과.forEach(c => $('nearList').appendChild(항목(c, c.거리km)));
      $('nearBlock').hidden = false;
      안내('', null);
      // 좌표는 여기서 수명을 다한다. 저장하지도, 전송하지도 않는다.
    },
    err => {
      $('find').disabled = false;
      $('nearBlock').hidden = true;
      const 거부됨 = err.code === err.PERMISSION_DENIED;
      안내(
        거부됨
          ? '위치 권한이 거부되었습니다. 위치를 허용하면 가까운 순으로 정렬됩니다.'
          : '위치를 확인하지 못했습니다. 전체 목록에서 확인해 주세요.',
        거부됨 ? 'info' : 'err'
      );
    },
    { timeout: 10000, maximumAge: 0 }
  );
});
</script>

</body>
</html>
```

- [ ] **Step 2: 정적 서버를 띄우고 초기 화면을 확인한다**

프로젝트 루트에서 정적 서버를 실행한다 (`.claude/launch.json` 의 `static-8000` 설정 사용 가능).

브라우저에서 `http://localhost:8000/company_tax/fp-center/` 를 연다.

Expected:
- 전체 FP센터 8곳이 보인다
- `[가까운 센터 찾기]` 버튼과 고지 문구가 보인다
- 하단에 `준법감시필 25-3281 …` 출처가 보인다
- 준법감시 경고 배너가 보인다 (2026-08-28 이후 실행 시)
- **가까운 센터 영역은 아직 보이지 않는다** (위치를 요청하지 않았으므로)
- 브라우저 콘솔에 오류가 없다

- [ ] **Step 3: 위치 허용 경로를 확인한다**

`[가까운 센터 찾기]` 를 누르고 위치 권한을 **허용**한다.

Expected:
- 상단에 "가까운 센터" 3곳이 거리와 함께 나타난다
- 전체 목록은 여전히 8곳 그대로다 (상위 3곳이 빠지지 않는다)
- 거리가 `12.4km` 형식이다
- 카카오맵 링크를 누르면 새 탭에서 해당 센터 위치가 열린다

- [ ] **Step 4: 위치 거부 경로를 확인한다**

브라우저 위치 권한을 초기화한 뒤 다시 눌러 **거부**한다.

Expected:
- "위치 권한이 거부되었습니다…" 안내가 뜬다
- 전체 8곳 목록은 그대로 남아 화면이 여전히 쓸모 있다
- 버튼이 다시 활성화된다

- [ ] **Step 5: 네트워크 호출이 없음을 확인한다**

브라우저 개발자도구 Network 탭을 열고 페이지를 새로고침한 뒤 위치 조회까지 수행한다.

Expected: `index.html`·`centers.js`·`nearest.js` 외에 **어떤 외부 요청도 없다.** 카카오맵은 링크를 클릭했을 때만 이동한다.

- [ ] **Step 6: 커밋한다**

```bash
git add company_tax/fp-center/index.html
git commit -m "feat(fp-center): 가까운 FP센터 조회 화면 추가"
```

---

## 배포 시 확인사항

- **HTTPS 필수.** `http://`로 배포하면 Geolocation이 조용히 실패하고 항상 폴백만 뜬다. 배포 후 실제 기기에서 위치 조회가 동작하는지 반드시 확인한다.
- 준법감시 유효기간 만료일은 **2026-10-27**이다. 경고 배너가 뜨기 시작하면 자료 갱신 절차를 밟는다.
- 외부 공개 배포이므로 고객이 열람할 수 있다. 고객 대상 홍보물로 활용하게 되면 준법감시 심의를 별도로 받아야 한다 (스펙 리스크 5번).
