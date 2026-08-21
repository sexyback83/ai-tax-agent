'use strict';
// JS 구현과 Python 구현이 동일한 입력에 대해 동일한 결과를 내는지 확인한다 (NFR-16).
// fixture(testcases.json)는 대표 사례만 담으므로, 여기서는 그 범위 밖의 다수 입력으로
// 두 구현을 대조한다. 특히 JS Math.round(0.5 올림)와 Python round(은행가 반올림)의
// 규칙 차이가 실제로 해소되었는지를 잡아내는 것이 목적이다.
//
// 실행: node crosscheck-run.js
// Python 경로는 환경변수 PYTHON 으로 재지정할 수 있다.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const calc = require('./calc.js');

const PYTHON =
  process.env.PYTHON ||
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe');

const inputs = JSON.parse(fs.readFileSync(path.join(__dirname, 'crosscheck-inputs.json'), 'utf-8'));

const FIELDS = ['totalEstate', 'taxableValue', 'taxBase', 'calculatedTax', 'reportDeduction', 'finalTax'];

const jsResults = inputs.map((c) => {
  const r = calc.calculateInheritanceTax(c);
  return Object.fromEntries(FIELDS.map((f) => [f, r[f]]));
});

let pyResults;
try {
  const stdout = execFileSync(PYTHON, [path.join(__dirname, 'crosscheck.py')], {
    encoding: 'utf-8',
    cwd: __dirname,
  });
  pyResults = JSON.parse(stdout);
} catch (err) {
  console.error(`Python 실행 실패 (${PYTHON}).`);
  console.error('PYTHON 환경변수로 인터프리터 경로를 지정하세요.');
  console.error(err.message);
  process.exitCode = 1;
  return;
}

if (jsResults.length !== pyResults.length) {
  console.error(`케이스 수 불일치: js=${jsResults.length} py=${pyResults.length}`);
  process.exitCode = 1;
  return;
}

let mismatches = 0;
let compared = 0;

for (let i = 0; i < jsResults.length; i += 1) {
  for (const field of FIELDS) {
    compared += 1;
    if (jsResults[i][field] !== pyResults[i][field]) {
      mismatches += 1;
      if (mismatches <= 5) {
        console.error(`FAIL case#${i} [${field}] js=${jsResults[i][field]} py=${pyResults[i][field]}`);
        console.error(`  input: ${JSON.stringify(inputs[i])}`);
      }
    }
  }
}

console.log(`crosscheck: ${inputs.length} cases, ${compared} values compared, ${mismatches} mismatched`);
if (mismatches > 0) {
  process.exitCode = 1;
} else {
  console.log('JS·Python 구현 동등성 확인됨 (NFR-16)');
}
