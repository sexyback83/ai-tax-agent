'use strict';

// 상속세및증여세법 시행령 제9조 제2항 — 장례비용 인정 한도 1,000만원.
const FUNERAL_COST_LIMIT = 10000000;

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

function calculateSpouseDeduction({ hasSpouse, netEstate, numChildren, actualSpouseShare = null }) {
  if (!hasSpouse) return 0;

  const spouseRatio = 1.5 / (1.5 + numChildren); // 배우자:자녀 = 1.5:1
  const statutoryShare = netEstate * spouseRatio;
  const actual = actualSpouseShare !== null ? actualSpouseShare : statutoryShare;
  const capped = Math.min(actual, statutoryShare, 3000000000);
  return Math.max(capped, 500000000);
}

function calculateFinancialAssetDeduction({ cash, financialDebt = 0 }) {
  const net = Math.max(0, cash - financialDebt);
  const twentyPercent = net * 0.2;

  if (twentyPercent < 20000000) {
    return Math.min(net, 20000000);
  }
  return Math.min(twentyPercent, 200000000);
}

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
  const taxableValue = totalEstate - debt - Math.min(funeralCost, FUNERAL_COST_LIMIT) + priorGift;
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
