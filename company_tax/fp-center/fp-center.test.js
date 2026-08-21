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

console.log('OK centers.js 통과');
