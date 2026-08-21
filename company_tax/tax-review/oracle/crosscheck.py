"""Python 구현의 결과를 JSON으로 출력한다.

crosscheck.js의 출력과 대조해 두 구현의 동등성을 fixture 범위 밖에서도
확인한다 (요구사항 NFR-16).
"""

import json
import re
from pathlib import Path

import calc


def to_snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


cases = json.loads((Path(__file__).parent / "crosscheck-inputs.json").read_text(encoding="utf-8"))

out = []
for case in cases:
    r = calc.calculate_inheritance_tax(**{to_snake(k): v for k, v in case.items()})
    out.append(
        {
            "totalEstate": r["total_estate"],
            "taxableValue": r["taxable_value"],
            "taxBase": r["tax_base"],
            "calculatedTax": r["calculated_tax"],
            "reportDeduction": r["report_deduction"],
            "finalTax": r["final_tax"],
        }
    )

print(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
