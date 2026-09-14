"""项目常量：字段、接口与精选规则。"""

from __future__ import annotations

from typing import Any

BASE_URL = "https://data.10jqka.com.cn/rank/lxsz/field/lxts/order/desc/page/{page}/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    ),
    "Referer": "https://data.10jqka.com.cn/rank/lxsz/",
}

FIELDS = [
    "序号",
    "股票代码",
    "股票简称",
    "收盘价(元)",
    "最高价(元)",
    "最低价(元)",
    "连涨天数",
    "连续涨跌幅",
    "累计换手率",
    "所属行业",
]

EASTMONEY_HEADERS = {
    "User-Agent": HEADERS["User-Agent"],
    "Referer": "https://quote.eastmoney.com/",
}
EASTMONEY_ULIST_URLS = (
    "https://push2delay.eastmoney.com/api/qt/ulist.np/get",
    "https://push2.eastmoney.com/api/qt/ulist.np/get",
)
EASTMONEY_ULIST_FIELDS = "f12,f2,f3,f6,f8,f9,f15,f16,f17,f18,f84,f87,f124"

EXTRA_FIELDS = (
    "平均涨幅/天",
    "平均换手/天",
    "现价",
    "今日涨跌幅",
    "今开",
    "今高",
    "今低",
    "今日换手率",
    "成交额",
    "行情时间",
    "市盈率",
    "散户指数",
    "散户净额",
)

# 精选：开区间比较（小于 / 大于）
HIGHLIGHT_RULE: dict[str, Any] = {
    "retailMax": -5.0,
    "todayTurnoverMax": 10.0,
    "avgPctMin": 1.0,
}
