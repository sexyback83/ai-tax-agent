"""상속세 계산 모듈.

프로젝트 원칙 제1조(라이브러리 우선)에 따라 UI·서버·LLM에 의존하지 않는 순수
함수만 둔다. 네트워크 I/O를 수행하지 않으며, 세액 계산에 LLM을 사용하지 않는다
(요구사항 NFR-14). 이 덕분에 LLM을 교체하거나 LLM이 장애를 일으켜도 계산 결과는
변하지 않는다 (NFR-02·NFR-16).

금액 단위는 전부 '원'이다. 만원↔원 환산은 표시 계층의 책임이다.
검증 기준은 testcases.json이며 JS 구현(calc.js)과 동일한 fixture를 통과한다.

근거: 상속세 및 증여세법 / 국세청 상속세 세액계산 흐름도
"""

# 과세표준 구간별 세율과 누진공제액 (상속세 및 증여세법 §26)
BRACKETS = [
    {"limit": 100_000_000, "rate": 0.10, "deduction": 0},              # 1억원 이하
    {"limit": 500_000_000, "rate": 0.20, "deduction": 10_000_000},     # 1억초과 5억이하
    {"limit": 1_000_000_000, "rate": 0.30, "deduction": 60_000_000},   # 5억초과 10억이하
    {"limit": 3_000_000_000, "rate": 0.40, "deduction": 160_000_000},  # 10억초과 30억이하
    {"limit": float("inf"), "rate": 0.50, "deduction": 460_000_000},   # 30억초과
]

FUNERAL_COST_LIMIT = 10_000_000     # 상증령 제9조 제2항 — 장례비용 인정 한도

LUMP_SUM_DEDUCTION = 500_000_000    # 일괄공제
BASIC_DEDUCTION = 200_000_000       # 기초공제
CHILD_DEDUCTION = 50_000_000        # 자녀 1인당 인적공제
MINOR_PER_YEAR = 10_000_000         # 미성년자 잔여연수 1년당
ELDERLY_DEDUCTION = 50_000_000      # 연로자 1인당
DISABLED_PER_YEAR = 10_000_000      # 장애인 기대여명 1년당

SPOUSE_DEDUCTION_FLOOR = 500_000_000     # 배우자상속공제 최소액
SPOUSE_DEDUCTION_CAP = 3_000_000_000     # 배우자상속공제 한도
SPOUSE_STATUTORY_WEIGHT = 1.5            # 법정상속분 가중치 (배우자:자녀 = 1.5:1)

FINANCIAL_DEDUCTION_RATE = 0.20          # 순금융재산 공제율
FINANCIAL_DEDUCTION_CAP = 200_000_000    # 금융재산상속공제 한도
FINANCIAL_DEDUCTION_MIN = 20_000_000     # 20%가 이 금액 미만이면 전액(이 금액 한도)

REPORT_DEDUCTION_RATE = 0.03             # 신고세액공제율


def calculate_progressive_tax(tax_base):
    """과세표준에 누진세율을 적용해 산출세액을 구한다. 반올림하지 않는다."""
    if tax_base <= 0:
        return 0
    bracket = next(b for b in BRACKETS if tax_base <= b["limit"])
    return tax_base * bracket["rate"] - bracket["deduction"]


def calculate_standard_deduction(
    num_children,
    minor_years_total=0,
    num_elderly=0,
    disabled_years_total=0,
    is_spouse_sole_heir=False,
):
    """일괄공제와 [기초공제 + 인적공제] 중 큰 금액을 반환한다.

    배우자가 단독상속인인 경우 일괄공제를 적용할 수 없으므로, 인적공제 합계가
    일괄공제보다 작더라도 인적공제 합계를 그대로 반환한다.
    """
    personal_total = (
        BASIC_DEDUCTION
        + num_children * CHILD_DEDUCTION
        + minor_years_total * MINOR_PER_YEAR
        + num_elderly * ELDERLY_DEDUCTION
        + disabled_years_total * DISABLED_PER_YEAR
    )

    if is_spouse_sole_heir:
        return personal_total
    return max(LUMP_SUM_DEDUCTION, personal_total)


def calculate_spouse_deduction(has_spouse, net_estate, num_children, actual_spouse_share=None):
    """배우자상속공제를 구한다.

    min(실제 상속액, 법정상속분, 30억원)을 적용하되 5억원 미만이면 5억원으로 한다.
    actual_spouse_share가 None이면 법정상속분대로 분할한다고 가정한다.
    """
    if not has_spouse:
        return 0

    spouse_ratio = SPOUSE_STATUTORY_WEIGHT / (SPOUSE_STATUTORY_WEIGHT + num_children)
    statutory_share = net_estate * spouse_ratio
    actual = statutory_share if actual_spouse_share is None else actual_spouse_share
    capped = min(actual, statutory_share, SPOUSE_DEDUCTION_CAP)
    return max(capped, SPOUSE_DEDUCTION_FLOOR)


def calculate_financial_asset_deduction(cash, financial_debt=0):
    """금융재산상속공제를 구한다.

    순금융재산의 20%를 공제하되 최대 2억원. 다만 20%가 2천만원 미만이면
    순금융재산 전액(2천만원 한도)을 공제한다.
    """
    net = max(0, cash - financial_debt)
    twenty_percent = net * FINANCIAL_DEDUCTION_RATE

    if twenty_percent < FINANCIAL_DEDUCTION_MIN:
        return min(net, FINANCIAL_DEDUCTION_MIN)
    return min(twenty_percent, FINANCIAL_DEDUCTION_CAP)


def calculate_inheritance_tax(
    real_estate,
    cash,
    has_spouse,
    num_children,
    other=0,
    debt=0,
    funeral_cost=0,
    prior_gift=0,
    financial_debt=0,
    actual_spouse_share=None,
    minor_years_total=0,
    num_elderly=0,
    disabled_years_total=0,
):
    """상속세 전체 계산.

    반올림은 이 함수에서만 수행한다. 개별 공제 함수가 반올림하지 않는 이유는
    중간 단계마다 반올림하면 오차가 누적되기 때문이다.

    반환하는 breakdown의 값들은 반올림되지 않은 원시값이므로 화면에 직접
    표시하지 않는다. 표시가 필요하면 표시 계층에서 포맷한다.
    """
    total_estate = real_estate + cash + other
    taxable_value = total_estate - debt - min(funeral_cost, FUNERAL_COST_LIMIT) + prior_gift
    is_spouse_sole_heir = has_spouse and num_children == 0

    standard_deduction = calculate_standard_deduction(
        num_children=num_children,
        minor_years_total=minor_years_total,
        num_elderly=num_elderly,
        disabled_years_total=disabled_years_total,
        is_spouse_sole_heir=is_spouse_sole_heir,
    )
    spouse_deduction = calculate_spouse_deduction(
        has_spouse=has_spouse,
        net_estate=taxable_value,
        num_children=num_children,
        actual_spouse_share=actual_spouse_share,
    )
    financial_deduction = calculate_financial_asset_deduction(cash=cash, financial_debt=financial_debt)

    total_deduction = standard_deduction + spouse_deduction + financial_deduction
    tax_base = max(0, _round_half_up(taxable_value - total_deduction))
    calculated_tax = _round_half_up(calculate_progressive_tax(tax_base))
    report_deduction = _round_half_up(calculated_tax * REPORT_DEDUCTION_RATE)
    final_tax = calculated_tax - report_deduction

    return {
        "total_estate": total_estate,
        "taxable_value": taxable_value,
        "tax_base": tax_base,
        "calculated_tax": calculated_tax,
        "report_deduction": report_deduction,
        "final_tax": final_tax,
        "breakdown": {
            "standard_deduction": standard_deduction,
            "spouse_deduction": spouse_deduction,
            "financial_deduction": financial_deduction,
            "total_deduction": total_deduction,
        },
    }


def _round_half_up(value):
    """0.5를 올림하는 반올림.

    Python 내장 round()는 은행가 반올림(0.5를 짝수로)이라 JS의 Math.round와
    결과가 달라진다. 두 구현의 동등성(NFR-16)을 위해 JS와 같은 규칙을 쓴다.
    """
    import math

    return math.floor(value + 0.5)
