'use strict';
// testcases.json(검증 기준)이 JS 구현과 일치하는지 확인한다.
// 같은 fixture를 Python 구현도 통과해야 하며, 그것이 두 구현의 동등성 근거가 된다 (NFR-16).
const fs = require('fs');
const path = require('path');
const calc = require('./calc.js');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'testcases.json'), 'utf-8'));

let pass = 0;
let fail = 0;

function check(label, actual, expected, tolerance) {
  const ok = tolerance ? Math.abs(actual - expected) < tolerance : actual === expected;
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`FAIL: ${label}\n  expected=${expected} actual=${actual}`);
  }
}

// 스칼라 인자 함수
for (const c of fixture.calculateProgressiveTax) {
  const inputs = c.inputs !== undefined ? c.inputs : [c.input];
  for (const v of inputs) {
    check(`calculateProgressiveTax(${v}) — ${c.name}`, calc.calculateProgressiveTax(v), c.expected, c.tolerance);
  }
}

// 객체 인자 · 스칼라 반환 함수
for (const fnName of ['calculateStandardDeduction', 'calculateSpouseDeduction', 'calculateFinancialAssetDeduction']) {
  for (const c of fixture[fnName]) {
    check(`${fnName} — ${c.name}`, calc[fnName](c.input), c.expected, c.tolerance);
  }
}

// 객체 인자 · 객체 반환 함수 (점 표기 경로 지원)
for (const c of fixture.calculateInheritanceTax) {
  const result = calc.calculateInheritanceTax(c.input);
  for (const [pathKey, expected] of Object.entries(c.expected)) {
    const actual = pathKey.split('.').reduce((o, k) => o[k], result);
    check(`calculateInheritanceTax.${pathKey} — ${c.name}`, actual, expected, c.tolerance);
  }
}

console.log(`\nfixture assertions: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
