# 상속세 계산기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** company_tax 프로젝트의 첫 번째 세무계산기인 상속세 계산기를, 계산 로직(Node에서 테스트 가능)과 화면(브라우저)을 분리한 구조로 구현한다.

**Architecture:** `calc.js`에 상속세 계산 순수 함수들을 작성하고(누진세율, 일괄공제/기초공제, 배우자공제, 금융재산공제, 전체 오케스트레이션), `calc.test.js`로 Node에서 assert 기반 자동 테스트를 돌린다. `index.html`은 `calc.js`를 `<script>` 태그로 불러와 브라우저에서 간단/상세 모드 폼과 결과 화면을 제공한다. 빌드 도구·프레임워크·npm 의존성 없음.

**Tech Stack:** Vanilla JavaScript (Node 내장 `assert` 모듈만 사용), HTML, CSS. 외부 라이브러리 없음.

**Spec:** [company_tax/docs/superpowers/specs/2026-08-19-inheritance-tax-calculator-design.md](../specs/2026-08-19-inheritance-tax-calculator-design.md)

## Global Constraints

- 프레임워크·빌드 도구·번들러·npm 의존성 사용 금지. `index.html`은 브라우저에서 바로 열면 동작해야 한다.
- `calc.js`는 DOM에 의존하지 않는 순수 함수로만 구성하고, Node에서 `require('./calc.js')`로 불러올 수 있어야 한다.
- **가업상속공제는 이번 계산기 범위에서 제외**한다 (별도 "가업승계" 서브프로젝트에서 다룸).
- 8개 세무계산기의 통합(공통 UI 셸)은 이번 단계에서 하지 않는다. 폴더 구조만 `company_tax/inheritance-tax/`로 일관되게 유지한다.
- 신고세액공제율은 3%로 고정 적용한다.
- 모든 금액 계산은 최종적으로 원 단위 정수로 반올림(`Math.round`)한다.

---

## Task 1: 누진세율 계산 함수

**Files:**
- Create: `company_tax/inheritance-tax/calc.js`
- Test: `company_tax/inheritance-tax/calc.test.js`

**Interfaces:**
- Produces: `BRACKETS` (배열), `calculateProgressiveTax(taxBase: number): number` — 과세표준을 받아 산출세액(누진공제 반영, 반올림 없는 원 단위 실수)을 반환

- [ ] **Step 1: 실패하는 테스트 작성**

`company_tax/inheritance-tax/calc.test.js` 새로 작성:

```js
'use strict';
const assert = require('node:assert/strict');
const { calculateProgressiveTax } = require('./calc.js');

let failed = false;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL: ${name}`);
    console.error(err.message);
  }
}

test('calculateProgressiveTax: 과세표준 0 이하는 0원', () => {
  assert.equal(calculateProgressiveTax(0), 0);
  assert.equal(calculateProgressiveTax(-1000), 0);
});

test('calculateProgressiveTax: 1억원 이하 10% 구간', () => {
  assert.equal(calculateProgressiveTax(50000000), 5000000);
});

test('calculateProgressiveTax: 1억초과 5억이하 20% 구간', () => {
  assert.equal(calculateProgressiveTax(300000000), 50000000);
});

test('calculateProgressiveTax: 5억초과 10억이하 30% 구간', () => {
  assert.equal(calculateProgressiveTax(700000000), 150000000);
});

test('calculateProgressiveTax: 10억초과 30억이하 40% 구간', () => {
  assert.equal(calculateProgressiveTax(2000000000), 640000000);
});

test('calculateProgressiveTax: 30억초과 50% 구간', () => {
  assert.equal(calculateProgressiveTax(5000000000), 2040000000);
});

if (failed) process.exitCode = 1;
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: `Cannot find module './calc.js'` 에러로 실패 (calc.js가 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

`company_tax/inheritance-tax/calc.js` 새로 작성:

```js
'use strict';

const BRACKETS = [
  { limit: 100000000, rate: 0.10, deduction: 0 },           // 1억원 이하
  { limit: 500000000, rate: 0.20, deduction: 10000000 },    // 1억초과 5억이하
  { limit: 1000000000, rate: 0.30, deduction: 60000000 },   // 5억초과 10억이하
  { limit: 3000000000, rate: 0.40, deduction: 160000000 },  // 10억초과 30억이하
  { limit: Infinity, rate: 0.50, deduction: 460000000 },    // 30억초과
];

function calculateProgressiveTax(taxBase) {
  if (taxBase <= 0) return 0;
  const bracket = BRACKETS.find((b) => taxBase <= b.limit);
  return taxBase * bracket.rate - bracket.deduction;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BRACKETS, calculateProgressiveTax };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: 6개 테스트 모두 `PASS`, exit code 0

- [ ] **Step 5: 커밋**

```bash
git add company_tax/inheritance-tax/calc.js company_tax/inheritance-tax/calc.test.js
git commit -m "feat: 상속세 누진세율 계산 함수 추가"
```

---

## Task 2: 일괄공제/기초공제+인적공제 선택 함수

**Files:**
- Modify: `company_tax/inheritance-tax/calc.js`
- Modify: `company_tax/inheritance-tax/calc.test.js`

**Interfaces:**
- Consumes: 없음 (독립 함수)
- Produces: `calculateStandardDeduction({ numChildren: number, minorYearsTotal?: number, numElderly?: number, disabledYearsTotal?: number, isSpouseSoleHeir?: boolean }): number`

- [ ] **Step 1: 실패하는 테스트 추가**

`calc.test.js`에 `calculateProgressiveTax` import 옆에 `calculateStandardDeduction`도 추가하고, `if (failed)` 줄 바로 위에 테스트 추가:

```js
const { calculateProgressiveTax, calculateStandardDeduction } = require('./calc.js');
```

(기존 `const { calculateProgressiveTax } = require('./calc.js');` 줄을 이걸로 교체)

```js
test('calculateStandardDeduction: 자녀 2명, 일괄공제(5억)가 더 큼', () => {
  const result = calculateStandardDeduction({ numChildren: 2 });
  assert.equal(result, 500000000);
});

test('calculateStandardDeduction: 자녀 8명, 인적공제 합계가 일괄공제보다 큼', () => {
  const result = calculateStandardDeduction({ numChildren: 8 });
  assert.equal(result, 600000000); // 기초공제 2억 + 자녀 8명×5천만 = 6억
});

test('calculateStandardDeduction: 배우자 단독상속인은 일괄공제 불가', () => {
  const result = calculateStandardDeduction({ numChildren: 0, isSpouseSoleHeir: true });
  assert.equal(result, 200000000); // 기초공제 2억만 (일괄공제 5억보다 작아도 이걸 씀)
});

test('calculateStandardDeduction: 미성년자공제가 반영되어 인적공제 합계가 일괄공제를 넘음', () => {
  const result = calculateStandardDeduction({ numChildren: 3, minorYearsTotal: 20 });
  assert.equal(result, 550000000); // 2억 + 3×5천만(1.5억) + 20×1천만(2억) = 5.5억
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: `calculateStandardDeduction is not a function` 관련 에러로 새 테스트 4개 FAIL, 기존 6개는 여전히 PASS

- [ ] **Step 3: 구현 작성**

`calc.js`의 `module.exports` 줄 바로 위에 추가:

```js
function calculateStandardDeduction({
  numChildren,
  minorYearsTotal = 0,
  numElderly = 0,
  disabledYearsTotal = 0,
  isSpouseSoleHeir = false,
}) {
  const lumpSum = 500000000;
  const basicDeduction = 200000000;
  const childDeduction = numChildren * 50000000;
  const minorDeduction = minorYearsTotal * 10000000;
  const elderlyDeduction = numElderly * 50000000;
  const disabledDeduction = disabledYearsTotal * 10000000;
  const personalTotal = basicDeduction + childDeduction + minorDeduction + elderlyDeduction + disabledDeduction;

  if (isSpouseSoleHeir) return personalTotal;
  return Math.max(lumpSum, personalTotal);
}
```

`module.exports` 객체에 `calculateStandardDeduction` 추가:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BRACKETS, calculateProgressiveTax, calculateStandardDeduction };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: 10개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add company_tax/inheritance-tax/calc.js company_tax/inheritance-tax/calc.test.js
git commit -m "feat: 일괄공제/기초공제+인적공제 선택 함수 추가"
```

---

## Task 3: 배우자상속공제 함수

**Files:**
- Modify: `company_tax/inheritance-tax/calc.js`
- Modify: `company_tax/inheritance-tax/calc.test.js`

**Interfaces:**
- Consumes: 없음 (독립 함수)
- Produces: `calculateSpouseDeduction({ hasSpouse: boolean, netEstate: number, numChildren: number, actualSpouseShare?: number|null }): number`

- [ ] **Step 1: 실패하는 테스트 추가**

import 줄 교체:

```js
const { calculateProgressiveTax, calculateStandardDeduction, calculateSpouseDeduction } = require('./calc.js');
```

`if (failed)` 위에 테스트 추가:

```js
test('calculateSpouseDeduction: 배우자 없으면 0', () => {
  const result = calculateSpouseDeduction({ hasSpouse: false, netEstate: 2000000000, numChildren: 2 });
  assert.equal(result, 0);
});

test('calculateSpouseDeduction: 배우자+자녀2명, 법정상속분(3/7) 적용', () => {
  const result = calculateSpouseDeduction({ hasSpouse: true, netEstate: 2000000000, numChildren: 2, actualSpouseShare: null });
  assert.ok(Math.abs(result - (2000000000 * 3 / 7)) < 0.001);
});

test('calculateSpouseDeduction: 법정상속분이 5억 미만이면 5억으로 floor', () => {
  const result = calculateSpouseDeduction({ hasSpouse: true, netEstate: 600000000, numChildren: 5, actualSpouseShare: null });
  assert.equal(result, 500000000);
});

test('calculateSpouseDeduction: 법정상속분이 30억 넘으면 30억으로 cap', () => {
  const result = calculateSpouseDeduction({ hasSpouse: true, netEstate: 10000000000, numChildren: 1, actualSpouseShare: null });
  assert.equal(result, 3000000000);
});

test('calculateSpouseDeduction: 배우자 실제 상속액을 직접 입력하면 그 값 기준(법정상속분 상한 내)', () => {
  const result = calculateSpouseDeduction({ hasSpouse: true, netEstate: 2000000000, numChildren: 2, actualSpouseShare: 600000000 });
  assert.equal(result, 600000000); // 실제 상속액(6억)이 법정상속분(약 8.57억)보다 작으므로 그대로 인정
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: `calculateSpouseDeduction is not a function` 에러로 새 테스트 5개 FAIL

- [ ] **Step 3: 구현 작성**

`calc.js`의 `module.exports` 줄 바로 위에 추가:

```js
function calculateSpouseDeduction({ hasSpouse, netEstate, numChildren, actualSpouseShare = null }) {
  if (!hasSpouse) return 0;

  const spouseRatio = 1.5 / (1.5 + numChildren); // 배우자:자녀 = 1.5:1
  const statutoryShare = netEstate * spouseRatio;
  const actual = actualSpouseShare !== null ? actualSpouseShare : statutoryShare;
  const capped = Math.min(actual, statutoryShare, 3000000000);
  return Math.max(capped, 500000000);
}
```

`module.exports`에 추가:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BRACKETS,
    calculateProgressiveTax,
    calculateStandardDeduction,
    calculateSpouseDeduction,
  };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: 15개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add company_tax/inheritance-tax/calc.js company_tax/inheritance-tax/calc.test.js
git commit -m "feat: 배우자상속공제 함수 추가"
```

---

## Task 4: 금융재산상속공제 함수

**Files:**
- Modify: `company_tax/inheritance-tax/calc.js`
- Modify: `company_tax/inheritance-tax/calc.test.js`

**Interfaces:**
- Consumes: 없음 (독립 함수)
- Produces: `calculateFinancialAssetDeduction({ cash: number, financialDebt?: number }): number`

- [ ] **Step 1: 실패하는 테스트 추가**

import 줄 교체:

```js
const {
  calculateProgressiveTax,
  calculateStandardDeduction,
  calculateSpouseDeduction,
  calculateFinancialAssetDeduction,
} = require('./calc.js');
```

`if (failed)` 위에 테스트 추가:

```js
test('calculateFinancialAssetDeduction: 순금융재산 2억, 20%가 2천만 이상', () => {
  const result = calculateFinancialAssetDeduction({ cash: 200000000 });
  assert.equal(result, 40000000);
});

test('calculateFinancialAssetDeduction: 순금융재산 5천만, 20%가 2천만 미만이면 2천만 한도로 전액', () => {
  const result = calculateFinancialAssetDeduction({ cash: 50000000 });
  assert.equal(result, 20000000);
});

test('calculateFinancialAssetDeduction: 순금융재산 1천만, 2천만 한도 내 전액', () => {
  const result = calculateFinancialAssetDeduction({ cash: 10000000 });
  assert.equal(result, 10000000);
});

test('calculateFinancialAssetDeduction: 순금융재산 30억, 2억으로 cap', () => {
  const result = calculateFinancialAssetDeduction({ cash: 3000000000 });
  assert.equal(result, 200000000);
});

test('calculateFinancialAssetDeduction: 금융채무 차감', () => {
  const result = calculateFinancialAssetDeduction({ cash: 300000000, financialDebt: 100000000 });
  assert.equal(result, 40000000); // 순금융재산 2억 기준 20% = 4천만
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: `calculateFinancialAssetDeduction is not a function` 에러로 새 테스트 5개 FAIL

- [ ] **Step 3: 구현 작성**

`calc.js`의 `module.exports` 줄 바로 위에 추가:

```js
function calculateFinancialAssetDeduction({ cash, financialDebt = 0 }) {
  const net = Math.max(0, cash - financialDebt);
  const twentyPercent = net * 0.2;

  if (twentyPercent < 20000000) {
    return Math.min(net, 20000000);
  }
  return Math.min(twentyPercent, 200000000);
}
```

`module.exports`에 추가:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BRACKETS,
    calculateProgressiveTax,
    calculateStandardDeduction,
    calculateSpouseDeduction,
    calculateFinancialAssetDeduction,
  };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: 20개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add company_tax/inheritance-tax/calc.js company_tax/inheritance-tax/calc.test.js
git commit -m "feat: 금융재산상속공제 함수 추가"
```

---

## Task 5: 전체 오케스트레이션 함수 + 스펙 기준 시나리오 테스트

**Files:**
- Modify: `company_tax/inheritance-tax/calc.js`
- Modify: `company_tax/inheritance-tax/calc.test.js`

**Interfaces:**
- Consumes: `calculateProgressiveTax`, `calculateStandardDeduction`, `calculateSpouseDeduction`, `calculateFinancialAssetDeduction` (Task 1~4에서 정의)
- Produces: `calculateInheritanceTax(input): { totalEstate, taxableValue, taxBase, calculatedTax, reportDeduction, finalTax, breakdown: { standardDeduction, spouseDeduction, financialDeduction, totalDeduction } }`

  `input` 필드: `realEstate, cash, other=0, hasSpouse, numChildren, debt=0, funeralCost=0, priorGift=0, financialDebt=0, actualSpouseShare=null, minorYearsTotal=0, numElderly=0, disabledYearsTotal=0`

- [ ] **Step 1: 실패하는 테스트 추가 (스펙 시나리오 1)**

import 줄 교체:

```js
const {
  calculateProgressiveTax,
  calculateStandardDeduction,
  calculateSpouseDeduction,
  calculateFinancialAssetDeduction,
  calculateInheritanceTax,
} = require('./calc.js');
```

`if (failed)` 위에 테스트 추가:

```js
test('calculateInheritanceTax: 스펙 시나리오1 - 배우자+자녀2명, 부동산18억+현금2억', () => {
  const result = calculateInheritanceTax({
    realEstate: 1800000000,
    cash: 200000000,
    hasSpouse: true,
    numChildren: 2,
  });
  assert.equal(result.totalEstate, 2000000000);
  assert.equal(result.taxBase, 602857143);
  assert.equal(result.calculatedTax, 120857143);
  assert.equal(result.finalTax, 117231429);
  assert.equal(result.breakdown.standardDeduction, 500000000);
  assert.equal(result.breakdown.financialDeduction, 40000000);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: `calculateInheritanceTax is not a function` 에러로 새 테스트 FAIL

- [ ] **Step 3: 구현 작성**

`calc.js`의 `module.exports` 줄 바로 위에 추가:

```js
function calculateInheritanceTax(input) {
  const {
    realEstate,
    cash,
    other = 0,
    hasSpouse,
    numChildren,
    debt = 0,
    funeralCost = 0,
    priorGift = 0,
    financialDebt = 0,
    actualSpouseShare = null,
    minorYearsTotal = 0,
    numElderly = 0,
    disabledYearsTotal = 0,
  } = input;

  const totalEstate = realEstate + cash + other;
  const taxableValue = totalEstate - debt - funeralCost + priorGift;
  const isSpouseSoleHeir = hasSpouse && numChildren === 0;

  const standardDeduction = calculateStandardDeduction({
    numChildren,
    minorYearsTotal,
    numElderly,
    disabledYearsTotal,
    isSpouseSoleHeir,
  });
  const spouseDeduction = calculateSpouseDeduction({
    hasSpouse,
    netEstate: taxableValue,
    numChildren,
    actualSpouseShare,
  });
  const financialDeduction = calculateFinancialAssetDeduction({ cash, financialDebt });

  const totalDeduction = standardDeduction + spouseDeduction + financialDeduction;
  const taxBase = Math.max(0, Math.round(taxableValue - totalDeduction));
  const calculatedTax = Math.round(calculateProgressiveTax(taxBase));
  const reportDeduction = Math.round(calculatedTax * 0.03);
  const finalTax = calculatedTax - reportDeduction;

  return {
    totalEstate,
    taxableValue,
    taxBase,
    calculatedTax,
    reportDeduction,
    finalTax,
    breakdown: { standardDeduction, spouseDeduction, financialDeduction, totalDeduction },
  };
}
```

`module.exports`에 추가:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BRACKETS,
    calculateProgressiveTax,
    calculateStandardDeduction,
    calculateSpouseDeduction,
    calculateFinancialAssetDeduction,
    calculateInheritanceTax,
  };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: 21개 테스트 모두 PASS (특히 스펙 시나리오1의 `finalTax === 117231429` 확인)

- [ ] **Step 5: 커밋**

```bash
git add company_tax/inheritance-tax/calc.js company_tax/inheritance-tax/calc.test.js
git commit -m "feat: 상속세 전체 계산 오케스트레이션 함수 추가"
```

---

## Task 6: 추가 시나리오 테스트 (배우자 없음 / 금융공제 cap / 단독상속인 / 미성년자 / 채무·사전증여)

**Files:**
- Modify: `company_tax/inheritance-tax/calc.test.js`

**Interfaces:**
- Consumes: `calculateInheritanceTax` (Task 5)
- Produces: 없음 (테스트 커버리지 확장만)

- [ ] **Step 1: 시나리오 테스트 5개 추가**

`if (failed)` 위에 테스트 추가:

```js
test('calculateInheritanceTax: 시나리오A - 배우자 없이 자녀2명, 부동산10억', () => {
  const result = calculateInheritanceTax({
    realEstate: 1000000000,
    cash: 0,
    hasSpouse: false,
    numChildren: 2,
  });
  assert.equal(result.taxBase, 500000000);
  assert.equal(result.calculatedTax, 90000000);
  assert.equal(result.finalTax, 87300000);
});

test('calculateInheritanceTax: 시나리오B - 금융재산공제 2억 cap 적용', () => {
  const result = calculateInheritanceTax({
    realEstate: 0,
    cash: 3000000000,
    hasSpouse: false,
    numChildren: 1,
  });
  assert.equal(result.breakdown.financialDeduction, 200000000);
  assert.equal(result.taxBase, 2300000000);
  assert.equal(result.finalTax, 737200000);
});

test('calculateInheritanceTax: 시나리오C - 배우자 단독상속(자녀 없음), 공제가 재산을 초과하면 세액 0', () => {
  const result = calculateInheritanceTax({
    realEstate: 1000000000,
    cash: 0,
    hasSpouse: true,
    numChildren: 0,
  });
  assert.equal(result.breakdown.standardDeduction, 200000000); // 단독상속이라 일괄공제 불가
  assert.equal(result.taxBase, 0);
  assert.equal(result.finalTax, 0);
});

test('calculateInheritanceTax: 시나리오D - 미성년자공제가 결과에 반영됨', () => {
  const result = calculateInheritanceTax({
    realEstate: 1500000000,
    cash: 0,
    hasSpouse: true,
    numChildren: 2,
    minorYearsTotal: 25,
  });
  assert.equal(result.breakdown.standardDeduction, 550000000); // 인적공제 합계가 일괄공제(5억)보다 큼
  assert.equal(result.taxBase, 307142857);
  assert.equal(result.finalTax, 49885714);
});

test('calculateInheritanceTax: 시나리오E - 채무·장례비용·사전증여재산이 과세가액에 반영됨', () => {
  const result = calculateInheritanceTax({
    realEstate: 1000000000,
    cash: 0,
    hasSpouse: false,
    numChildren: 1,
    debt: 100000000,
    funeralCost: 10000000,
    priorGift: 50000000,
  });
  assert.equal(result.taxableValue, 940000000); // 10억 - 채무1억 - 장례비1천만 + 사전증여5천만
  assert.equal(result.taxBase, 440000000); // 940,000,000 - 일괄공제 5억
  assert.equal(result.calculatedTax, 78000000);
  assert.equal(result.finalTax, 75660000);
});
```

- [ ] **Step 2: 테스트 실행해서 통과 확인**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: 26개 테스트 모두 PASS (Task 5까지 구현이 맞다면 새 테스트도 바로 통과해야 함 — 실패하면 Task 5 구현을 다시 확인)

- [ ] **Step 3: 커밋**

```bash
git add company_tax/inheritance-tax/calc.test.js
git commit -m "test: 상속세 계산 추가 시나리오(배우자 없음/금융공제 cap/단독상속/미성년자/채무·사전증여) 검증"
```

---

## Task 7: 간단 모드 화면 (index.html)

**Files:**
- Create: `company_tax/inheritance-tax/index.html`

**Interfaces:**
- Consumes: `calc.js`의 `calculateInheritanceTax` (전역 함수로 로드됨)

- [ ] **Step 1: index.html 작성**

`company_tax/inheritance-tax/index.html` 새로 작성:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>상속세 계산기</title>
<style>
  body { font-family: -apple-system, "Malgun Gothic", sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #1a1a1a; }
  h1 { font-size: 22px; }
  label { display: block; margin-top: 14px; font-size: 14px; font-weight: 600; }
  input[type="number"] { width: 100%; padding: 8px; font-size: 15px; box-sizing: border-box; margin-top: 4px; }
  .checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
  .checkbox-row label { margin: 0; }
  button { margin-top: 20px; padding: 10px 20px; font-size: 15px; cursor: pointer; }
  #result { margin-top: 24px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; display: none; }
  #result table { width: 100%; border-collapse: collapse; }
  #result td { padding: 6px 0; font-size: 14px; }
  #result td.value { text-align: right; }
  #result .final-row td { font-weight: 700; font-size: 17px; border-top: 1px solid #ccc; padding-top: 10px; }
  .error { color: #c0392b; margin-top: 12px; font-size: 14px; }
</style>
</head>
<body>
  <h1>상속세 계산기 (간단 모드)</h1>

  <label for="realEstate">부동산가액 (원)</label>
  <input type="number" id="realEstate" min="0" value="0">

  <label for="cash">현금(금융자산)가액 (원)</label>
  <input type="number" id="cash" min="0" value="0">

  <label for="other">기타자산가액 (원)</label>
  <input type="number" id="other" min="0" value="0">

  <div class="checkbox-row">
    <input type="checkbox" id="hasSpouse">
    <label for="hasSpouse">배우자 있음</label>
  </div>

  <label for="numChildren">자녀 수</label>
  <input type="number" id="numChildren" min="0" value="0">

  <button id="calcBtn">계산하기</button>

  <div class="error" id="errorBox"></div>

  <div id="result">
    <table>
      <tr><td>총 상속재산가액</td><td class="value" id="rTotalEstate"></td></tr>
      <tr><td>과세표준</td><td class="value" id="rTaxBase"></td></tr>
      <tr><td>산출세액</td><td class="value" id="rCalculatedTax"></td></tr>
      <tr><td>신고세액공제(3%)</td><td class="value" id="rReportDeduction"></td></tr>
      <tr class="final-row"><td>최종 납부세액</td><td class="value" id="rFinalTax"></td></tr>
    </table>
  </div>

  <script src="calc.js"></script>
  <script>
    function formatWon(n) {
      return Math.round(n).toLocaleString('ko-KR') + '원';
    }

    document.getElementById('calcBtn').addEventListener('click', () => {
      const errorBox = document.getElementById('errorBox');
      errorBox.textContent = '';

      const realEstate = Number(document.getElementById('realEstate').value);
      const cash = Number(document.getElementById('cash').value);
      const other = Number(document.getElementById('other').value);
      const hasSpouse = document.getElementById('hasSpouse').checked;
      const numChildren = Number(document.getElementById('numChildren').value);

      if ([realEstate, cash, other, numChildren].some((v) => Number.isNaN(v) || v < 0)) {
        errorBox.textContent = '자산가액과 자녀 수는 0 이상의 숫자여야 합니다.';
        document.getElementById('result').style.display = 'none';
        return;
      }

      const result = calculateInheritanceTax({ realEstate, cash, other, hasSpouse, numChildren });

      document.getElementById('rTotalEstate').textContent = formatWon(result.totalEstate);
      document.getElementById('rTaxBase').textContent = formatWon(result.taxBase);
      document.getElementById('rCalculatedTax').textContent = formatWon(result.calculatedTax);
      document.getElementById('rReportDeduction').textContent = formatWon(result.reportDeduction);
      document.getElementById('rFinalTax').textContent = formatWon(result.finalTax);
      document.getElementById('result').style.display = 'block';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: 브라우저에서 스펙 시나리오1 값으로 수동 확인**

`company_tax/inheritance-tax/index.html`을 브라우저로 열고 다음을 입력:
- 부동산가액: 1800000000
- 현금(금융자산)가액: 200000000
- 기타자산가액: 0
- 배우자 있음: 체크
- 자녀 수: 2

"계산하기" 클릭 후 "최종 납부세액"이 **117,231,429원**으로 표시되는지 확인 (Task 5 테스트와 동일한 값).

- [ ] **Step 3: 커밋**

```bash
git add company_tax/inheritance-tax/index.html
git commit -m "feat: 상속세 계산기 간단 모드 화면 추가"
```

---

## Task 8: 상세 모드 토글 추가

**Files:**
- Modify: `company_tax/inheritance-tax/index.html`

**Interfaces:**
- Consumes: `calculateInheritanceTax`의 확장 필드(`debt, funeralCost, priorGift, financialDebt, actualSpouseShare, minorYearsTotal, numElderly, disabledYearsTotal`) — 모두 Task 5에서 이미 정의됨

- [ ] **Step 1: 상세 모드 토글 버튼과 추가 입력 필드 삽입**

`<button id="calcBtn">계산하기</button>` 줄 **바로 위**에 추가:

```html
  <div class="checkbox-row">
    <input type="checkbox" id="detailedMode">
    <label for="detailedMode">상세 모드 (세무사/FC용)</label>
  </div>

  <div id="detailedFields" style="display: none;">
    <label for="debt">채무 (원)</label>
    <input type="number" id="debt" min="0" value="0">

    <label for="financialDebt">금융채무 (원, 순금융재산 계산용)</label>
    <input type="number" id="financialDebt" min="0" value="0">

    <label for="funeralCost">장례비용 (원)</label>
    <input type="number" id="funeralCost" min="0" value="0">

    <label for="priorGift">사전증여재산 (원)</label>
    <input type="number" id="priorGift" min="0" value="0">

    <label for="actualSpouseShare">배우자 실제 상속액 (원, 비워두면 법정상속분으로 계산)</label>
    <input type="number" id="actualSpouseShare" min="0" placeholder="법정상속분 자동 계산">

    <label for="minorYearsTotal">미성년자 잔여연수 합계</label>
    <input type="number" id="minorYearsTotal" min="0" value="0">

    <label for="numElderly">65세 이상 연로자 수</label>
    <input type="number" id="numElderly" min="0" value="0">

    <label for="disabledYearsTotal">장애인 기대여명 합계</label>
    <input type="number" id="disabledYearsTotal" min="0" value="0">
  </div>
```

`<script>` 블록 안, `document.getElementById('calcBtn').addEventListener(...)` **위**에 추가:

```js
    document.getElementById('detailedMode').addEventListener('change', (e) => {
      document.getElementById('detailedFields').style.display = e.target.checked ? 'block' : 'none';
    });
```

- [ ] **Step 2: calcBtn 클릭 핸들러에서 상세 필드 읽어오도록 수정**

기존 클릭 핸들러의

```js
      const result = calculateInheritanceTax({ realEstate, cash, other, hasSpouse, numChildren });
```

줄을 아래로 교체:

```js
      const isDetailed = document.getElementById('detailedMode').checked;
      const extra = isDetailed ? {
        debt: Number(document.getElementById('debt').value) || 0,
        financialDebt: Number(document.getElementById('financialDebt').value) || 0,
        funeralCost: Number(document.getElementById('funeralCost').value) || 0,
        priorGift: Number(document.getElementById('priorGift').value) || 0,
        actualSpouseShare: document.getElementById('actualSpouseShare').value === ''
          ? null
          : Number(document.getElementById('actualSpouseShare').value),
        minorYearsTotal: Number(document.getElementById('minorYearsTotal').value) || 0,
        numElderly: Number(document.getElementById('numElderly').value) || 0,
        disabledYearsTotal: Number(document.getElementById('disabledYearsTotal').value) || 0,
      } : {};

      const result = calculateInheritanceTax({ realEstate, cash, other, hasSpouse, numChildren, ...extra });
```

- [ ] **Step 3: 브라우저에서 상세 모드 동작 확인**

`index.html`을 브라우저로 열고 "상세 모드" 체크 → 추가 입력 필드가 나타나는지 확인. 시나리오D 값(부동산 15억, 현금 0, 배우자 있음, 자녀 2명, 미성년자 잔여연수 합계 25)을 입력하고 계산 → 최종 납부세액이 **49,885,714원**으로 표시되는지 확인 (Task 6 테스트와 동일한 값).

- [ ] **Step 4: 커밋**

```bash
git add company_tax/inheritance-tax/index.html
git commit -m "feat: 상속세 계산기 상세 모드 토글 및 추가 공제 입력 추가"
```

---

## Task 9: 전체 회귀 테스트 및 최종 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `node company_tax/inheritance-tax/calc.test.js`
Expected: 26개 테스트 전부 PASS, exit code 0

- [ ] **Step 2: 브라우저에서 간단 모드 + 상세 모드 둘 다 최종 스모크 테스트**

`index.html`을 열어 간단 모드로 스펙 시나리오1(부동산 18억/현금 2억/배우자 있음/자녀 2명) 계산 → 117,231,429원 확인. 이어서 상세 모드로 전환해 같은 입력에 채무 0/사전증여 0을 명시적으로 넣어도 동일한 결과가 나오는지 확인 (상세 모드가 기본값과 일치하는지 회귀 확인).

- [ ] **Step 3: 최종 커밋 (필요시)**

위 확인 과정에서 코드 수정이 없었다면 커밋할 것 없음. 수정이 있었다면:

```bash
git add company_tax/inheritance-tax/
git commit -m "fix: 상속세 계산기 최종 회귀 검증 후 수정"
```
