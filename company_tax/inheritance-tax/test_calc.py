"""상속세 계산 모듈(Python)의 검증.

기대값은 testcases.json(언어 중립 검증 기준)에서 읽는다. 동일한 fixture를
JS 구현(fixture-check.js)도 통과하므로, 두 구현이 같은 fixture를 통과하면
동등성이 성립한다 (요구사항 NFR-16, 작업 T-309).

실행: python -m pytest test_calc.py -v
"""

import json
import re
from pathlib import Path

import pytest

import calc

FIXTURE = json.loads((Path(__file__).parent / "testcases.json").read_text(encoding="utf-8"))


def to_snake(name: str) -> str:
    """fixture의 camelCase 키를 Python의 snake_case 인자명으로 변환한다."""
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def snake_kwargs(d: dict) -> dict:
    return {to_snake(k): v for k, v in d.items()}


def resolve(obj, dotted: str):
    """'breakdown.standardDeduction' 형태의 경로를 snake_case로 변환해 값을 꺼낸다."""
    value = obj
    for part in dotted.split("."):
        value = value[to_snake(part)]
    return value


def case_id(case: dict) -> str:
    return case["name"]


# ── calculate_progressive_tax ────────────────────────────────────────────────

def _progressive_params():
    params = []
    for case in FIXTURE["calculateProgressiveTax"]:
        inputs = case.get("inputs", [case.get("input")])
        for value in inputs:
            params.append(pytest.param(value, case["expected"], id=f'{case["name"]}({value})'))
    return params


@pytest.mark.parametrize("tax_base,expected", _progressive_params())
def test_calculate_progressive_tax(tax_base, expected):
    assert calc.calculate_progressive_tax(tax_base) == expected


# ── 객체 인자 · 스칼라 반환 함수 ─────────────────────────────────────────────

@pytest.mark.parametrize("case", FIXTURE["calculateStandardDeduction"], ids=case_id)
def test_calculate_standard_deduction(case):
    assert calc.calculate_standard_deduction(**snake_kwargs(case["input"])) == case["expected"]


@pytest.mark.parametrize("case", FIXTURE["calculateSpouseDeduction"], ids=case_id)
def test_calculate_spouse_deduction(case):
    actual = calc.calculate_spouse_deduction(**snake_kwargs(case["input"]))
    tolerance = case.get("tolerance")
    if tolerance is not None:
        assert abs(actual - case["expected"]) < tolerance
    else:
        assert actual == case["expected"]


@pytest.mark.parametrize("case", FIXTURE["calculateFinancialAssetDeduction"], ids=case_id)
def test_calculate_financial_asset_deduction(case):
    assert calc.calculate_financial_asset_deduction(**snake_kwargs(case["input"])) == case["expected"]


# ── 전체 오케스트레이션 ──────────────────────────────────────────────────────

@pytest.mark.parametrize("case", FIXTURE["calculateInheritanceTax"], ids=case_id)
def test_calculate_inheritance_tax(case):
    result = calc.calculate_inheritance_tax(**snake_kwargs(case["input"]))
    for dotted, expected in case["expected"].items():
        assert resolve(result, dotted) == expected, f"{dotted} 불일치"


# ── LLM 격리 검증 (NFR-14 · NFR-16) ──────────────────────────────────────────

def test_calc_module_has_no_network_or_llm_dependency():
    """계산 모듈은 네트워크·LLM을 일절 참조하지 않아야 한다 (원칙 제7·11조, NFR-14·16)."""
    source = (Path(__file__).parent / "calc.py").read_text(encoding="utf-8")
    forbidden = ["requests", "urllib", "httpx", "openai", "socket", "http.client"]
    found = [token for token in forbidden if token in source]
    assert not found, f"계산 모듈에 금지된 의존성이 있습니다: {found}"
