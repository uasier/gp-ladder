"""精选规则与散户指数筛选。"""

from __future__ import annotations

from typing import Dict, List

from gp.constants import HIGHLIGHT_RULE
from gp.formatters import parse_percent, to_optional_float


def parse_retail_index(row: Dict[str, str]) -> float | None:
    """读取散户指数；缺失时返回 None，避免把空值当成 0。"""

    return to_optional_float(row.get("散户指数"))


def matches_retail_index(
    row: Dict[str, str],
    min_value: float | None,
    max_value: float | None,
) -> bool:
    """判断散户指数是否落在闭区间 [min_value, max_value] 内。"""

    if min_value is None and max_value is None:
        return True
    value = parse_retail_index(row)
    if value is None:
        return False
    if min_value is not None and value < min_value:
        return False
    if max_value is not None and value > max_value:
        return False
    return True


def filter_rows_by_retail_index(
    rows: List[Dict[str, str]],
    min_value: float | None,
    max_value: float | None,
) -> List[Dict[str, str]]:
    if min_value is None and max_value is None:
        return rows
    return [row for row in rows if matches_retail_index(row, min_value, max_value)]


def highlight_avg_pct(row: Dict[str, str]) -> float | None:
    annotated = to_optional_float(row.get("平均涨幅/天"))
    if annotated is not None:
        return annotated
    try:
        days = int((row.get("连涨天数") or "0").strip())
    except (TypeError, ValueError):
        days = 0
    days = max(1, days)
    return parse_percent(row.get("连续涨跌幅")) / days


def is_highlight_stock(row: Dict[str, str]) -> bool:
    """精选：散户指数 < -5%，当日换手率 < 10%，平均日涨幅 > 1%。"""

    retail = parse_retail_index(row)
    retail_max = HIGHLIGHT_RULE.get("retailMax")
    if retail is None or retail_max is None or retail >= float(retail_max):
        return False

    today_turnover = to_optional_float(row.get("今日换手率"))
    turnover_max = HIGHLIGHT_RULE.get("todayTurnoverMax")
    if today_turnover is None or turnover_max is None or today_turnover >= float(turnover_max):
        return False

    avg_pct = highlight_avg_pct(row)
    avg_pct_min = HIGHLIGHT_RULE.get("avgPctMin")
    if avg_pct is None or avg_pct_min is None or avg_pct <= float(avg_pct_min):
        return False
    return True
