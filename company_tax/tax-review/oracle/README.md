# oracle/ — 상속세 독립 구현 (교차검증용)

이 폴더는 **지우면 안 되는 중복 코드**다. `../calc.js`와 같은 세금을 계산하지만,
일부러 다른 방식으로 짜여 있고 그 차이가 곧 검증 수단이다.

| | `../calc.js` (본 구현) | `oracle/calc.js` (이 폴더) |
|---|---|---|
| 세액 산식 형태 | 구간별 한계세율 누적 | 세율 × 과세표준 − 누진공제액 |
| 범위 | 8세목 | 상속세만 |
| 역할 | 상담 화면이 쓰는 계산 모듈 | 본 구현을 대조하는 오라클 |

두 형태가 같은 입력에 같은 값을 내면, 한쪽의 산식 오타나 구간 경계 실수가 드러난다.
`../audit.test.js`의 감사 ID `F-1`·`F-2`가 이 대조를 수행한다.
같은 사람이 같은 해석으로 코드와 테스트를 함께 쓰면 해석 오류를 서로 확인해 주지 못하므로,
형태가 다른 두 구현을 남겨 두는 것이다.

원래 `company_tax/inheritance-tax/`에 있었고, 2026-08-20에 폴더를 하나로 합치면서 이 위치로 옮겼다.
파일 내용과 폴더 내부 상대경로는 그대로다.

## 구성

| 파일 | 역할 |
|---|---|
| `calc.js` | 상속세 독립 구현 (JS) |
| `calc.test.js` | 위 구현의 테스트 26건 |
| `testcases.json` | 법정 산식에서 직접 도출한 기대값. `../calc.test.js`의 상속세 6건이 여기서 전사됐다 |
| `calc.py` | 같은 산식의 Python 포팅 (작업분해서 `T-309`) |
| `test_calc.py` | Python 테스트 (pytest) |
| `crosscheck.py` · `crosscheck-run.js` · `crosscheck-inputs.json` | JS↔Python 대량 차분 검증 |
| `fixture-check.js` | `testcases.json` 픽스처 대조 |
| `index.html` | 상속세 단일 계산기 화면. `../index.html`(8세목 위저드)이 대체했으므로 현역이 아니다 |

## 실행

```bash
node company_tax/tax-review/oracle/calc.test.js      # 오라클 자체 테스트
node company_tax/tax-review/oracle/fixture-check.js  # 픽스처 대조
node company_tax/tax-review/audit.test.js            # F-1·F-2 차분 검증 포함
```

Python 계열(`test_calc.py`, `crosscheck.py`)은 실행 환경에 Python이 설치돼 있어야 한다.
