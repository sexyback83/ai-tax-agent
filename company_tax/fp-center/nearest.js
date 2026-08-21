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
