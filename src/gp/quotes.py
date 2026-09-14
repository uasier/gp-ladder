"""东方财富当日行情与散户资金。"""

from __future__ import annotations

import sys
from typing import Callable, Dict, List, Tuple

import requests

from gp.constants import EASTMONEY_HEADERS, EASTMONEY_ULIST_FIELDS, EASTMONEY_ULIST_URLS
from gp.formatters import (
    format_fund_amount,
    format_price,
    format_quote_time,
    format_signed_percent,
    to_optional_float,
)

_working_eastmoney_ulist: Tuple[str, bool] | None = None


def build_eastmoney_secid(code: str | None) -> str | None:
    """根据股票代码构造东方财富 secid。"""

    if not code:
        return None
    trimmed = code.strip()
    if not trimmed:
        return None
    if trimmed[0] in {"5", "6", "9"}:
        return f"1.{trimmed}"
    if trimmed[0] in {"0", "1", "2", "3", "4", "8"}:
        return f"0.{trimmed}"
    return None


def _http_get_json(
    url: str, params: Dict[str, str], timeout: int, trust_env: bool
) -> Dict[str, object]:
    with requests.Session() as session:
        session.trust_env = trust_env
        response = session.get(
            url, params=params, headers=EASTMONEY_HEADERS, timeout=timeout
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("接口返回不是 JSON 对象")
        return payload


def fetch_eastmoney_ulist(
    params: Dict[str, str], timeout: int
) -> List[Dict[str, object]]:
    """从东方财富 ulist 批量取数，自动切换域名与代理策略。"""

    global _working_eastmoney_ulist
    candidates: List[Tuple[str, bool]] = []
    if _working_eastmoney_ulist is not None:
        candidates.append(_working_eastmoney_ulist)
    for url in EASTMONEY_ULIST_URLS:
        for trust_env in (True, False):
            pair = (url, trust_env)
            if pair not in candidates:
                candidates.append(pair)

    last_error: Exception | None = None
    for url, trust_env in candidates:
        try:
            payload = _http_get_json(url, params, timeout, trust_env)
            data = payload.get("data") or {}
            if not isinstance(data, dict):
                continue
            diff = data.get("diff") or []
            if isinstance(diff, dict):
                items = list(diff.values())
            elif isinstance(diff, list):
                items = diff
            else:
                items = []
            rows = [item for item in items if isinstance(item, dict)]
            _working_eastmoney_ulist = (url, trust_env)
            return rows
        except (requests.RequestException, ValueError, TypeError) as exc:
            last_error = exc
            if _working_eastmoney_ulist == (url, trust_env):
                _working_eastmoney_ulist = None

    if last_error is not None:
        print(f"获取东方财富行情失败: {last_error}", file=sys.stderr)
    return []


def fetch_eastmoney_snapshots(
    rows: List[Dict[str, str]],
    timeout: int = 10,
    batch_size: int = 50,
    on_progress: Callable[[str], None] | None = None,
) -> Dict[str, Dict[str, float | None]]:
    """批量获取当日行情、市盈率与散户资金。"""

    codes = sorted({row.get("股票代码", "").strip() for row in rows if row.get("股票代码")})
    metrics: Dict[str, Dict[str, float | None]] = {}
    secid_pairs = [
        (code, secid) for code in codes if (secid := build_eastmoney_secid(code))
    ]
    if not secid_pairs:
        return metrics

    total_batches = (len(secid_pairs) + batch_size - 1) // batch_size
    for start in range(0, len(secid_pairs), batch_size):
        batch_index = start // batch_size + 1
        if on_progress:
            on_progress(f"正在拉取东方财富行情 {batch_index}/{total_batches}")
        chunk = secid_pairs[start : start + batch_size]
        params = {
            "fltt": "2",
            "invt": "2",
            "fields": EASTMONEY_ULIST_FIELDS,
            "secids": ",".join(secid for _, secid in chunk),
        }
        for item in fetch_eastmoney_ulist(params, timeout):
            code = str(item.get("f12") or "").strip()
            if not code:
                continue
            metrics[code] = {
                "price": to_optional_float(item.get("f2")),
                "change_pct": to_optional_float(item.get("f3")),
                "amount": to_optional_float(item.get("f6")),
                "turnover": to_optional_float(item.get("f8")),
                "pe": to_optional_float(item.get("f9")),
                "high": to_optional_float(item.get("f15")),
                "low": to_optional_float(item.get("f16")),
                "open": to_optional_float(item.get("f17")),
                "prev_close": to_optional_float(item.get("f18")),
                "retail_amount": to_optional_float(item.get("f84")),
                "retail_pct": to_optional_float(item.get("f87")),
                "quote_ts": to_optional_float(item.get("f124")),
            }
    return metrics


def fetch_retail_indexes(
    rows: List[Dict[str, str]], timeout: int = 10, batch_size: int = 50
) -> Dict[str, Dict[str, float | None]]:
    snapshots = fetch_eastmoney_snapshots(rows, timeout=timeout, batch_size=batch_size)
    return {
        code: {"pct": item.get("retail_pct"), "amount": item.get("retail_amount")}
        for code, item in snapshots.items()
    }


def annotate_with_retail_index(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    metrics = fetch_retail_indexes(rows)
    for row in rows:
        code = row.get("股票代码", "").strip()
        item = metrics.get(code) or {}
        row["散户指数"] = format_signed_percent(item.get("pct"))
        row["散户净额"] = format_fund_amount(item.get("amount"))
    return rows


def annotate_with_live_quotes(
    rows: List[Dict[str, str]],
    on_progress: Callable[[str], None] | None = None,
) -> List[Dict[str, str]]:
    """叠加现价、涨跌幅、今开高低、换手、成交额、市盈率、散户资金。"""

    snapshots = fetch_eastmoney_snapshots(rows, on_progress=on_progress)
    for row in rows:
        code = row.get("股票代码", "").strip()
        item = snapshots.get(code) or {}
        row["现价"] = format_price(item.get("price"))
        row["今日涨跌幅"] = format_signed_percent(item.get("change_pct"))
        row["今开"] = format_price(item.get("open"))
        row["今高"] = format_price(item.get("high"))
        row["今低"] = format_price(item.get("low"))
        row["今日换手率"] = format_signed_percent(item.get("turnover"))
        row["成交额"] = format_fund_amount(item.get("amount"))
        row["行情时间"] = format_quote_time(item.get("quote_ts"))
        pe = item.get("pe")
        row["市盈率"] = f"{pe:.2f}" if pe is not None else ""
        row["散户指数"] = format_signed_percent(item.get("retail_pct"))
        row["散户净额"] = format_fund_amount(item.get("retail_amount"))
    return rows
