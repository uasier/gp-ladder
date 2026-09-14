"""导出 CSV / JSON / HTML 与精选列表。"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from importlib.resources import files
from pathlib import Path
from typing import Dict, List, Tuple

from gp.constants import EXTRA_FIELDS, FIELDS, HIGHLIGHT_RULE
from gp.enrich import enrich_output_rows
from gp.formatters import format_optional_number
from gp.highlight import filter_rows_by_retail_index, is_highlight_stock


def save_selected_stocks(
    rows: List[Dict[str, str]], output_path: Path
) -> Tuple[Path, int]:
    """将精选股票写入同目录文本文件。"""

    selected_map: Dict[str, str] = {}
    for row in rows:
        if not is_highlight_stock(row):
            continue
        code = (row.get("股票代码") or "").strip()
        name = (row.get("股票简称") or "").strip()
        if not code:
            continue
        selected_map.setdefault(code, f"{code} {name}".strip())

    selected_list = list(selected_map.values())
    selected_path = output_path.with_name(f"{output_path.stem}_selected.txt")
    selected_path.write_text(
        json.dumps(selected_list, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return selected_path, len(selected_list)


def save_to_csv(
    rows: List[Dict[str, str]],
    output_path: Path,
    *,
    retail_min: float | None = None,
    retail_max: float | None = None,
) -> None:
    rows = enrich_output_rows(rows)
    rows = filter_rows_by_retail_index(rows, retail_min, retail_max)

    fieldnames = list(FIELDS)
    for extra in EXTRA_FIELDS:
        if any(extra in r for r in rows) and extra not in fieldnames:
            fieldnames.append(extra)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def save_to_json(
    rows: List[Dict[str, str]],
    output_path: Path,
    *,
    retail_min: float | None = None,
    retail_max: float | None = None,
) -> None:
    rows = enrich_output_rows(rows)
    rows = filter_rows_by_retail_index(rows, retail_min, retail_max)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as json_file:
        json.dump(rows, json_file, ensure_ascii=False, indent=2)


def resolve_refresh_time(updated_at: str | None, *, has_rows: bool) -> str:
    """页面展示的数据刷新时间：优先用快照时间，导出无快照时用当前时间。"""

    if updated_at and updated_at.strip():
        return updated_at.strip()
    if has_rows:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return "尚未刷新"


def generate_html_content(
    rows: List[Dict[str, str]],
    *,
    retail_min: float | None = None,
    retail_max: float | None = None,
    updated_at: str | None = None,
) -> str:
    """用内置模板构建天梯页。"""

    total = len(rows)
    max_days = 0
    industries = set()
    for row in rows:
        industries.add(row.get("所属行业") or "未知")
        try:
            days = int(row.get("连涨天数", "0") or 0)
        except ValueError:
            days = 0
        max_days = max(max_days, days)

    data_json = json.dumps(rows, ensure_ascii=False)
    industries_json = json.dumps(sorted(industries), ensure_ascii=False)
    refresh_time = resolve_refresh_time(updated_at, has_rows=bool(rows))
    quote_times = [row.get("行情时间") or "" for row in rows if row.get("行情时间")]
    quote_at = max(quote_times) if quote_times else "--"
    template = files("gp").joinpath("templates/ladder.html").read_text(encoding="utf-8")
    return (
        template.replace("__TOTAL__", str(total))
        .replace("__MAX_DAYS__", str(max_days))
        .replace("__UPDATED_AT__", refresh_time)
        .replace("__GENERATED_AT__", refresh_time)
        .replace("__QUOTE_AT__", quote_at)
        .replace("__DATA_JSON__", data_json)
        .replace("__INDUSTRIES_JSON__", industries_json)
        .replace("__RETAIL_MIN__", format_optional_number(retail_min))
        .replace("__RETAIL_MAX__", format_optional_number(retail_max))
        .replace("__HL_RETAIL_MAX__", format_optional_number(HIGHLIGHT_RULE["retailMax"]))
        .replace(
            "__HL_TODAY_TURN_MAX__",
            format_optional_number(HIGHLIGHT_RULE["todayTurnoverMax"]),
        )
        .replace(
            "__HL_AVG_PCT_MIN__", format_optional_number(HIGHLIGHT_RULE["avgPctMin"])
        )
    )


def save_to_html(
    rows: List[Dict[str, str]],
    output_path: Path,
    *,
    retail_min: float | None = None,
    retail_max: float | None = None,
) -> None:
    enriched_rows = enrich_output_rows(rows, with_pe=True)
    content = generate_html_content(
        enriched_rows, retail_min=retail_min, retail_max=retail_max
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")
