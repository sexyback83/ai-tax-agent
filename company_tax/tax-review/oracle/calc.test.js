'use strict';
const assert = require('node:assert/strict');
const {
  calculateProgressiveTax,
  calculateStandardDeduction,
  calculateSpouseDeduction,
  calculateFinancialAssetDeduction,
  calculateInheritanceTax,
} = require('./calc.js');

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

if (failed) process.exitCode = 1;
