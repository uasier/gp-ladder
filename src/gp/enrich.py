"""为榜单记录补充平均值与当日行情。"""

from __future__ import annotations

from typing import Callable, Dict, List

from gp.formatters import to_optional_float
from gp.quotes import annotate_with_live_quotes


def annotate_with_averages(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """追加平均涨幅/天、平均换手/天。"""

    for row in rows:
        try:
            days = int((row.get("连涨天数") or "0").strip())
        except (TypeError, ValueError):
            days = 0
        days = max(1, days)
        total_pct = to_optional_float(row.get("连续涨跌幅")) or 0.0
        total_turnover = to_optional_float(row.get("累计换手率")) or 0.0
        row["平均涨幅/天"] = f"{total_pct / days:.2f}%"
        row["平均换手/天"] = f"{total_turnover / days:.2f}%"
    return rows


def enrich_output_rows(
    rows: List[Dict[str, str]],
    *,
    with_pe: bool = False,
    on_progress: Callable[[str], None] | None = None,
) -> List[Dict[str, str]]:
    """补充平均值、当日行情、散户指数与市盈率。"""

    del with_pe
    if on_progress:
        on_progress("正在计算均涨与均换手")
    rows = annotate_with_averages(rows)
    return annotate_with_live_quotes(rows, on_progress=on_progress)
