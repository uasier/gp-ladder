"""数值解析与展示格式化。"""

from __future__ import annotations

from datetime import datetime


def to_optional_float(value: object) -> float | None:
    """将接口返回值转为浮点数；空值、占位符与非法文本返回 None。"""

    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        if number != number:  # NaN
            return None
        return number
    text = str(value).strip().replace("%", "").replace(",", "")
    if not text or text in {"-", "--", "None", "null", "NaN"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_percent(value: str | None) -> float:
    if value is None:
        return 0.0
    text = str(value).replace("%", "").strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


def format_signed_percent(value: float | None) -> str:
    """格式化带正负号的百分比，例如 -2.39%。"""

    if value is None:
        return ""
    return f"{value:.2f}%"


def format_fund_amount(value: float | None) -> str:
    """将金额（元）格式化为万/亿。"""

    if value is None:
        return ""
    abs_value = abs(value)
    if abs_value >= 1e8:
        return f"{value / 1e8:.2f}亿"
    return f"{value / 1e4:.2f}万"


def format_price(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"


def format_quote_time(timestamp: float | None) -> str:
    """将行情 unix 时间戳格式化为本地时间。"""

    if timestamp is None:
        return ""
    try:
        return datetime.fromtimestamp(int(timestamp)).strftime("%Y-%m-%d %H:%M:%S")
    except (OSError, OverflowError, TypeError, ValueError):
        return ""


def format_optional_number(value: float | None) -> str:
    if value is None:
        return ""
    number = float(value)
    if number.is_integer():
        return str(int(number))
    return str(number)
