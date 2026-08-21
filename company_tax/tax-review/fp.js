'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// 삼성생명 FP센터 — 데이터와 순수 계산
// ══════════════════════════════════════════════════════════════════════════════
// 출처: FP센터 안내 인쇄물 (준법감시필 25-3281, WM팀)
//   · 주소·전화는 심의받은 표기를 그대로 둔다. 임의로 고치지 않는다.
//   · 좌표는 2026-08-20에 카카오 로컬 API로 저장소 밖에서 1회 변환해 확보했다.
//     런타임 지오코딩을 하지 않으므로 이 파일에는 fetch·XHR이 한 줄도 없다 (원칙 제4조).
// DOM에 의존하지 않으므로 node에서 그대로 검증된다 — 실행: node fp.test.js

const FP_SOURCE = {
  심의번호: '25-3281',
  담당: 'WM팀',
  유효기간: { 시작: '2025-10-28', 만료: '2026-10-27' },
};

// 인쇄물 수록 순서를 그대로 유지한다. 화면에서 임의로 재정렬하지 않는다.
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

// ── 준법감시 유효기간 ──
// 만료 60일 전부터 경고한다. 갱신은 사람이 해야 하므로 화면에서 눈에 띄게 알린다.
const FP_EXPIRY_WARN_DAYS = 60;

// 'YYYY-MM-DD' 두 개를 UTC 자정 기준으로 비교한다.
// 로컬 타임존을 쓰면 실행 환경에 따라 하루가 밀리므로 UTC로 고정한다.
function daysBetweenDates(from, to) {
  const ms = (s) => {
    const p = String(s).split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  };
  return Math.round((ms(to) - ms(from)) / 86400000);
}

function fpExpiryStatus(today) {
  const 남은일수 = daysBetweenDates(today, FP_SOURCE.유효기간.만료);
  return {
    남은일수: 남은일수,
    만료됨: 남은일수 < 0,
    경고: 남은일수 >= 0 && 남은일수 <= FP_EXPIRY_WARN_DAYS,
  };
}

// ── 거리 ──
// 하버사인 공식으로 두 좌표 사이의 대권거리를 구한다. 실제 이동거리가 아닌 직선거리다.
const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// 가까운 순 최대 n개. 반올림하지 않은 원값을 넘긴다 — 표시 형식은 화면 계층의 책임이다.
// 입력 배열을 정렬하지 않도록 map으로 새 배열을 만든 뒤 sort한다.
function nearestCenters(lat, lng, centers, n) {
  const count = n === undefined ? 3 : n;
  return centers
    .map((c) => Object.assign({}, c, { 거리km: distanceKm(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.거리km - b.거리km)
    .slice(0, count);
}

// 대한민국 본토 범위. 해외 로밍·VPN 좌표가 들어오면 거리 정렬이 의미가 없으므로 걸러낸다.
const KOREA_LAT = [33, 39];
const KOREA_LNG = [124, 132];
function inKorea(lat, lng) {
  return lat >= KOREA_LAT[0] && lat <= KOREA_LAT[1] && lng >= KOREA_LNG[0] && lng <= KOREA_LNG[1];
}

// ══════════════════════════ 개략도 ══════════════════════════
// 지도 SDK를 쓰지 않고 좌표를 직접 투영해 그린다 (원칙 제4조 — 외부 스크립트·API 키 없음).
// 해안선은 실제 좌표를 뽑아 단순화한 것이며, 센터 핀과 같은 투영을 쓰므로
// 핀의 상대 위치는 실제 위경도 그대로다.
const MAP_BOUNDS = { lat0: 33.05, lat1: 38.65, lng0: 125.95, lng1: 129.85 };

// 시계방향: 휴전선(서→동) → 동해안(북→남) → 남해안(동→서) → 서해안(남→북)
const KOREA_OUTLINE = [
  [37.78, 126.68], [37.95, 126.70], [38.02, 126.95], [38.10, 127.10], [38.20, 127.20],
  [38.31, 127.40], [38.30, 127.80], [38.32, 128.10], [38.42, 128.36],
  [38.20, 128.55], [37.98, 128.75], [37.80, 128.95], [37.45, 129.17], [37.10, 129.35],
  [36.99, 129.40], [36.60, 129.46], [36.10, 129.42], [36.08, 129.58], [35.72, 129.48],
  [35.50, 129.42], [35.32, 129.30], [35.10, 129.15],
  [35.02, 128.95], [35.09, 128.65], [34.90, 128.60], [34.84, 128.43], [34.90, 128.10],
  [34.88, 127.90], [34.75, 127.75], [34.60, 127.45], [34.55, 127.10], [34.40, 126.75],
  [34.55, 126.50], [34.79, 126.39],
  [35.05, 126.30], [35.30, 126.42], [35.62, 126.50], [35.98, 126.68], [36.10, 126.61],
  [36.35, 126.50], [36.50, 126.33], [36.78, 126.13], [36.95, 126.45], [37.05, 126.72],
  [37.28, 126.62], [37.45, 126.62], [37.60, 126.68],
];

// 위도 1도의 거리는 어디서나 같지만 경도 1도는 위도에 따라 줄어든다.
// 지도의 가로세로 비를 실제 거리 비로 맞춰 남북으로 늘어나지 않게 한다.
const KM_PER_DEG = 111.195;

// 제주도는 본토와 떨어져 있어 별도 도형으로 둔다. 크기는 동서 73km · 남북 31km.
// 반경을 도 단위로 미리 환산해 둔다 — 화면 계층이 거리 상수를 다시 갖지 않게 하기 위해서다.
const JEJU = { lat: 33.38, lng: 126.53, 동서km: 73, 남북km: 31 };
JEJU.위도반경 = (JEJU.남북km / 2) / KM_PER_DEG;
JEJU.경도반경 = (JEJU.동서km / 2) / (KM_PER_DEG * Math.cos(toRad(JEJU.lat)));
function mapSize(width) {
  const b = MAP_BOUNDS;
  const 세로km = (b.lat1 - b.lat0) * KM_PER_DEG;
  const 가로km = (b.lng1 - b.lng0) * KM_PER_DEG * Math.cos(toRad((b.lat0 + b.lat1) / 2));
  return { w: width, h: width * (세로km / 가로km) };
}

// 위경도 → 지도 좌표. 북쪽이 위(y=0)다.
function projectPoint(lat, lng, size) {
  const b = MAP_BOUNDS;
  return {
    x: ((lng - b.lng0) / (b.lng1 - b.lng0)) * size.w,
    y: ((b.lat1 - lat) / (b.lat1 - b.lat0)) * size.h,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FP_SOURCE, CENTERS, FP_EXPIRY_WARN_DAYS, fpExpiryStatus,
    EARTH_RADIUS_KM, distanceKm, nearestCenters, inKorea,
    MAP_BOUNDS, KOREA_OUTLINE, JEJU, mapSize, projectPoint,
  };
}
