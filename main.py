"""爬取同花顺连涨股票榜单并输出 CSV 或 JSON。

运行示例：

    python main.py -f json -o output.json

"""

from __future__ import annotations

import argparse
import csv
import json
import html
import re
import sys
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

import requests

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

PE_API = "https://push2.eastmoney.com/api/qt/stock/get"

TABLE_BODY_RE = re.compile(r"<tbody[^>]*>(.*?)</tbody>", re.S | re.IGNORECASE)
ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.IGNORECASE)
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S | re.IGNORECASE)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def fetch_page_html(page: int, timeout: int = 15) -> str:
    """下载指定页的 HTML 内容。"""

    url = BASE_URL.format(page=page)
    response = requests.get(url, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    if not response.encoding:
        response.encoding = response.apparent_encoding or "gbk"
    return response.text


def strip_html(value: str) -> str:
    """去掉 HTML 标签与注释并返回纯文本。"""

    without_comments = COMMENT_RE.sub("", value)
    without_tags = TAG_RE.sub("", without_comments)
    return html.unescape(without_tags).replace("\xa0", " ").strip()


def parse_stock_rows(page_html: str) -> List[Dict[str, str]]:
    """从页面 HTML 中提取榜单数据。"""

    body_match = TABLE_BODY_RE.search(page_html)
    if not body_match:
        return []

    rows_html = body_match.group(1)
    rows: List[Dict[str, str]] = []
    for row_html in ROW_RE.findall(rows_html):
        cells = [strip_html(cell) for cell in CELL_RE.findall(row_html)]
        if len(cells) < len(FIELDS):
            continue
        record = dict(zip(FIELDS, cells[: len(FIELDS)]))
        rows.append(record)
    return rows


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


def fetch_pe_ratios(
    rows: List[Dict[str, str]], timeout: int = 10, max_workers: int = 6
) -> Dict[str, float]:
    """并发获取股票市盈率数据，避免串行阻塞。"""

    codes = sorted({row.get("股票代码", "").strip() for row in rows if row.get("股票代码")})
    ratios: Dict[str, float] = {}

    def fetch_single(code: str) -> Tuple[str, float | None]:
        secid = build_eastmoney_secid(code)
        if not secid:
            return code, None
        params = {
            "fltt": "2",
            "invt": "2",
            "fields": "f162",
            "secid": secid,
        }
        try:
            response = requests.get(PE_API, params=params, timeout=timeout)
            response.raise_for_status()
            data = response.json().get("data") or {}
        except requests.RequestException as exc:  # pragma: no cover - 依赖网络
            print(f"获取 {code} 市盈率失败: {exc}", file=sys.stderr)
            return code, None

        raw_value = data.get("f162")
        try:
            return code, float(raw_value) if raw_value is not None else None
        except (TypeError, ValueError):
            return code, None

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_single, code): code for code in codes}
        for future in as_completed(futures):
            code, ratio = future.result()
            if ratio is not None:
                ratios[code] = ratio

    return ratios


def annotate_with_pe_ratio(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """为每条记录补充市盈率。"""

    ratios = fetch_pe_ratios(rows)
    for row in rows:
        code = row.get("股票代码", "").strip()
        ratio = ratios.get(code)
        row["市盈率"] = f"{ratio:.2f}" if ratio is not None else ""
    return rows


def annotate_with_averages(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """基于连涨天数计算平均涨幅/天 与 平均换手/天，并追加到每条记录。

    - 平均涨幅/天 = 连续涨跌幅 / 连涨天数
    - 平均换手/天 = 累计换手率 / 连涨天数

    结果以百分号字符串保留两位小数，例如 "3.25%"。
    """

    def _to_float(value: str | None) -> float:
        if value is None:
            return 0.0
        s = str(value).replace("%", "").strip()
        try:
            return float(s)
        except ValueError:
            return 0.0

    for row in rows:
        try:
            days = int((row.get("连涨天数") or "0").strip())
        except (TypeError, ValueError):
            days = 0
        days = max(1, days)

        total_pct = _to_float(row.get("连续涨跌幅"))
        total_turnover = _to_float(row.get("累计换手率"))
        avg_pct = total_pct / days
        avg_turnover = total_turnover / days
        row["平均涨幅/天"] = f"{avg_pct:.2f}%"
        row["平均换手/天"] = f"{avg_turnover:.2f}%"

    return rows


def crawl_all_pages(max_pages: int | None = None) -> List[Dict[str, str]]:
    """依次抓取所有页面，直到没有数据或达到页数上限。"""

    page = 1
    all_rows: List[Dict[str, str]] = []
    while True:
        if max_pages and page > max_pages:
            break

        try:
            html_text = fetch_page_html(page)
        except requests.RequestException as exc:  # pragma: no cover - 网络环境不稳定
            print(f"抓取第{page}页失败: {exc}", file=sys.stderr)
            break

        page_rows = parse_stock_rows(html_text)
        if not page_rows:
            if page == 1:
                print("未在页面中解析到数据", file=sys.stderr)
            else:
                print(f"第{page}页无数据，抓取结束。")
            break

        print(f"抓取第{page}页数据：{len(page_rows)} 条")
        all_rows.extend(page_rows)
        page += 1

    return all_rows


def save_to_csv(rows: List[Dict[str, str]], output_path: Path) -> None:
    """将提取的数据写入 CSV 文件。"""

    # 先补充平均值列
    rows = annotate_with_averages(rows)

    # 动态列：在默认字段后追加平均相关字段
    fieldnames = list(FIELDS)
    for extra in ("平均涨幅/天", "平均换手/天"):
        if any(extra in r for r in rows):
            if extra not in fieldnames:
                fieldnames.append(extra)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def save_to_json(rows: List[Dict[str, str]], output_path: Path) -> None:
    """将提取的数据写入 JSON 文件。"""

    # 先补充平均值列
    rows = annotate_with_averages(rows)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as json_file:
        json.dump(rows, json_file, ensure_ascii=False, indent=2)


def generate_html_content(rows: List[Dict[str, str]]) -> str:
    """构建连涨天梯页面内容，附带交互筛选。"""

    total = len(rows)
    max_days = 0
    industries = set()
    for row in rows:
        industry = row.get("所属行业") or "未知"
        industries.add(industry)
        try:
            days = int(row.get("连涨天数", "0") or 0)
        except ValueError:
            days = 0
        max_days = max(max_days, days)

    data_json = json.dumps(rows, ensure_ascii=False)
    industries_json = json.dumps(sorted(industries), ensure_ascii=False)
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    template = """
    <!DOCTYPE html>
    <html lang=\"zh-CN\">
    <head>
      <meta charset=\"utf-8\" />
      <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
      <title>连涨天梯榜单</title>
      <style>
        :root {{
          color-scheme: light;
          --bg: #f3f6ff;
          --panel: rgba(255, 255, 255, 0.9);
          --panel-border: rgba(15, 23, 42, 0.08);
          --card: rgba(255, 255, 255, 0.95);
          --accent: #ff6b3d;
          --accent-2: #2f80ed;
          --text: #0f172a;
          --muted: #64748b;
          --success: #16a34a;
          --shadow: rgba(79, 70, 229, 0.15);
        }}
        * {{ box-sizing: border-box; }}
        body {{
          font-family: 'HarmonyOS Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
          margin: 0;
          background: radial-gradient(circle at 10% 15%, rgba(255, 220, 180, .45), transparent 45%),
                     radial-gradient(circle at 85% 10%, rgba(168, 210, 255, .45), transparent 40%),
                     var(--bg);
          color: var(--text);
          min-height: 100vh;
        }}
        header.hero {{
          padding: 48px 6vw 24px;
          position: relative;
          overflow: hidden;
        }}
        header.hero::after {{
          content: '';
          position: absolute;
          inset: 10% auto auto 65%;
          width: 200px;
          height: 200px;
          filter: blur(60px);
          background: radial-gradient(circle, rgba(34,211,238,.5), transparent 60%);
          z-index: 0;
        }}
        .hero-content {{
          position: relative;
          z-index: 1;
        }}
        .hero h1 {{
          margin: 0;
          font-size: clamp(34px, 5vw, 56px);
          letter-spacing: 2px;
        }}
        .hero p {{
          margin: 12px 0 0;
          color: var(--muted);
          font-size: 18px;
        }}
        .stats {{
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-top: 28px;
        }}
        .stat-card {{
          background: var(--panel);
          border: 1px solid var(--panel-border);
          border-radius: 18px;
          padding: 16px 20px;
          position: relative;
          overflow: hidden;
        }}
        .stat-card::after {{
          content: '';
          position: absolute;
          inset: auto -30% -50% auto;
          width: 120px;
          height: 120px;
          background: linear-gradient(120deg, rgba(255,107,61,.35), transparent 60%);
          transform: rotate(35deg);
        }}
        .stat-card dt {{
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--muted);
        }}
        .stat-card dd {{
          margin: 6px 0 0;
          font-size: 32px;
          font-weight: 700;
        }}
        .filters {{
          margin: 0 6vw 32px;
          padding: 28px;
          background: rgba(255,255,255,0.95);
          border-radius: 24px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 24px;
          backdrop-filter: blur(18px);
          box-shadow: 0 30px 45px rgba(15, 23, 42, 0.15);
        }}
        .filter-item {{
          background: rgba(245, 248, 255, 0.88);
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6);
        }}
        .filter-item label {{
          display: block;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--muted);
        }}
        .filter-checkbox label {{
          text-transform: none;
          letter-spacing: 0;
          font-size: 15px;
          color: var(--text);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0;
        }}
        .filter-checkbox label span {{
          font-weight: 600;
        }}
        .filter-checkbox input {{
          appearance: none;
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.6);
          position: relative;
          cursor: pointer;
          transition: background .2s ease;
        }}
        .filter-checkbox input::after {{
          content: '';
          position: absolute;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          top: 3px;
          left: 4px;
          box-shadow: 0 4px 8px rgba(15, 23, 42, 0.2);
          transition: transform .2s ease;
        }}
        .filter-checkbox input:checked {{
          background: linear-gradient(120deg, #2f80ed, #ff6b3d);
        }}
        .filter-checkbox input:checked::after {{
          transform: translateX(16px);
        }}
        .filter-item input,
        .filter-item select {{
          width: 100%;
          border-radius: 999px;
          border: 1px solid rgba(100,116,139,.2);
          background: rgba(255,255,255,0.95);
          color: var(--text);
          padding: 10px 16px;
          font-size: 15px;
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
        }}
        .filter-item input:focus,
        .filter-item select:focus {{
          outline: none;
          border-color: rgba(47, 128, 237, 0.6);
          box-shadow: 0 0 0 3px rgba(47,128,237,0.2);
        }}
        .filter-range {{
          display: flex;
          align-items: center;
          gap: 14px;
        }}
        .filter-range input[type=range] {{
          flex: 1;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, #2f80ed, #ff6b3d);
        }}
        .filter-range input[type=range]::-webkit-slider-thumb {{
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #2f80ed;
          box-shadow: 0 4px 10px rgba(47,128,237,0.4);
        }}
        .filter-range input[type=range]::-moz-range-thumb {{
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #2f80ed;
          box-shadow: 0 4px 10px rgba(47,128,237,0.4);
        }}
        .range-value {{
          min-width: 38px;
          text-align: center;
          border-radius: 999px;
          background: rgba(47, 128, 237, 0.12);
          color: #1d4ed8;
          font-weight: 600;
          padding: 4px 10px;
        }}
        main {{
          padding: 0 6vw 60px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }}
        .ladder-group {{
          background: var(--panel);
          border-radius: 24px;
          border: 1px solid var(--panel-border);
          padding: 24px;
          box-shadow: 0 25px 50px var(--shadow);
        }}
        .ladder-head {{
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          gap: 16px;
        }}
        .ladder-title {{
          display: flex;
          align-items: baseline;
          gap: 16px;
        }}
        .ladder-day {{
          font-size: clamp(42px, 5vw, 60px);
          font-weight: 700;
          color: var(--accent);
          line-height: 1;
        }}
        .ladder-sub {{
          color: var(--muted);
          font-size: 16px;
          letter-spacing: 6px;
        }}
        .ladder-count {{
          font-size: 16px;
          color: var(--muted);
        }}
        .ladder-cards {{
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
          overflow: visible;
        }}
        .stock-card {{
          background: var(--card);
          border-radius: 18px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          padding: 20px;
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: flex-start;
          position: relative;
          overflow: visible;
          transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
          z-index: 1;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
        }}
        .stock-card.highlight {{
          border-color: rgba(234, 179, 8, 0.6);
          box-shadow: 0 24px 40px rgba(234, 179, 8, 0.35);
        }}
        .stock-card:hover {{
          transform: translateY(-6px);
          border-color: rgba(47, 128, 237, 0.5);
          box-shadow: 0 18px 30px rgba(15, 23, 42, 0.15);
          z-index: 60;
        }}
        .highlight-badge {{
          position: absolute;
          top: 18px;
          right: 18px;
          padding: 4px 10px;
          background: linear-gradient(120deg, #fbbf24, #f59e0b);
          color: #fff;
          font-size: 12px;
          border-radius: 999px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }}
        .stock-name {{
          font-size: 18px;
          font-weight: 600;
          color: var(--text);
        }}
        .pct-block {{
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }}
        .pct-value {{
          font-size: 40px;
          font-weight: 700;
        }}
        .pct-value.up {{ color: #dc2626; }}
        .pct-value.down {{ color: #0f7a25; }}
        .pct-value.flat {{ color: #475569; }}
        .industry-chip {{
          padding: 6px 14px;
          background: rgba(47, 128, 237, 0.12);
          color: #1d4ed8;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 600;
        }}
        .stock-tooltip {{
          position: absolute;
          bottom: calc(100% + 12px);
          left: 0;
          transform: translateY(10px);
          background: #ffffff;
          color: #0f172a;
          border-radius: 16px;
          border: 1px solid rgba(15, 23, 42, 0.1);
          box-shadow: 0 18px 30px rgba(15, 23, 42, 0.15);
          padding: 16px 20px;
          min-width: 240px;
          opacity: 0;
          pointer-events: none;
          transition: opacity .2s ease, transform .2s ease;
          z-index: 50;
        }}
        .stock-card:hover .stock-tooltip {{
          opacity: 1;
          transform: translateY(0);
          z-index: 60;
        }}
        .stock-tooltip h4 {{
          margin: 0 0 10px;
          font-size: 16px;
        }}
        .stock-tooltip ul {{
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 8px;
        }}
        .stock-tooltip li {{
          font-size: 13px;
          color: #475569;
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }}
        .stock-tooltip li strong {{
          color: #111827;
        }}
        .empty {{
          text-align: center;
          color: var(--muted);
          padding: 60px 0;
        }}
        @media (max-width: 720px) {{
          .filters {{
            margin: 0 16px 32px;
          }}
          main {{
            padding: 0 16px 60px;
          }}
          header.hero {{
            padding: 40px 16px;
          }}
        }}
      </style>
    </head>
    <body>
      <header class=\"hero\">
        <div class=\"hero-content\">
          <h1>连涨天梯</h1>
          <p>自动抓取同花顺连涨榜数据，可视化展示并支持交互筛选</p>
          <dl class=\"stats\">
            <div class=\"stat-card\">
              <dt>覆盖个股</dt>
              <dd>__TOTAL__</dd>
            </div>
            <div class=\"stat-card\">
              <dt>最高连涨天数</dt>
              <dd>__MAX_DAYS__</dd>
            </div>
            <div class=\"stat-card\">
              <dt>页面生成时间</dt>
              <dd>__GENERATED_AT__</dd>
            </div>
          </dl>
        </div>
      </header>
      <section class=\"filters\">
        <div class=\"filter-item\">
          <label>关键字 / 代码</label>
          <input id=\"keywordInput\" type=\"search\" placeholder=\"搜索股票...\" />
        </div>
        <div class=\"filter-item\">
          <label>所属行业</label>
          <select id=\"industrySelect\"></select>
        </div>
        <div class=\"filter-item\">
          <label>平均涨幅区间</label>
          <select id=\"pctRange\">
            <option value=\"all\">全部平均涨幅</option>
            <option value=\"0-5\">0% - 5%</option>
            <option value=\"5-10\">5% - 10%</option>
            <option value=\"10-15\">10% - 15%</option>
            <option value=\"15+\">15%+</option>
          </select>
        </div>
        <div class=\"filter-item\">
          <label>平均换手率区间</label>
          <select id=\"turnoverRange\">
            <option value=\"all\">全部平均换手率</option>
            <option value=\"0-5\">0% - 5%</option>
            <option value=\"5-10\">5% - 10%</option>
            <option value=\"10-20\">10% - 20%</option>
            <option value=\"20+\">20%+</option>
          </select>
        </div>
        <div class=\"filter-item\">
          <label>最低连涨天数</label>
          <div class=\"filter-range\">
            <input id=\"daysRange\" type=\"range\" min=\"0\" max=\"__MAX_DAYS__\" value=\"0\" />
            <span id=\"daysValue\" class=\"range-value\">0</span>
          </div>
        </div>
        <div class=\"filter-item\">
          <label>排序</label>
          <select id=\"sortSelect\">
            <option value=\"days\">连涨天数（高→低）</option>
            <option value=\"pct\">累计涨跌幅（高→低）</option>
            <option value=\"avgPct\">平均涨幅/天（高→低）</option>
            <option value=\"avgTurnover\">平均换手/天（高→低）</option>
            <option value=\"close\">收盘价（高→低）</option>
          </select>
        </div>
        <div class=\"filter-item filter-checkbox\">
          <label for=\"excludeSt\">
            <span>仅展示非 ST 股票</span>
            <input type=\"checkbox\" id=\"excludeSt\" checked />
          </label>
        </div>
        <div class=\"filter-item filter-checkbox\">
          <label for=\"onlyHighlight\">
            <span>仅显示精选股票</span>
            <input type=\"checkbox\" id=\"onlyHighlight\" />
          </label>
        </div>
        <div class=\"filter-item\">\n          <label>精选条件（平均/天）</label>\n          <div class=\"filter-range\" style=\"margin-top: 6px;\">\n            <input id=\"avgPctMin\" type=\"number\" step=\"0.1\" placeholder=\"涨幅下限\" />\n            <span>≤ 平均涨幅 ≤</span>\n            <input id=\"avgPctMax\" type=\"number\" step=\"0.1\" placeholder=\"涨幅上限\" />\n          </div>\n          <div class=\"filter-range\" style=\"margin-top: 8px;\">\n            <input id=\"avgTurnMin\" type=\"number\" step=\"0.1\" placeholder=\"换手下限\" />\n            <span>≤ 平均换手 ≤</span>\n            <input id=\"avgTurnMax\" type=\"number\" step=\"0.1\" placeholder=\"换手上限\" />\n          </div>\n        </div>\n      </section>
      <main>
        <div id=\"ladderContainer\" class=\"ladder-list\"></div>
      </main>
      <script id=\"stock-data\" type=\"application/json\">__DATA_JSON__</script>
      <script id=\"industry-data\" type=\"application/json\">__INDUSTRIES_JSON__</script>
      <script>
        const data = JSON.parse(document.getElementById('stock-data').textContent);
        const industries = JSON.parse(document.getElementById('industry-data').textContent);
        const keywordInput = document.getElementById('keywordInput');
        const industrySelect = document.getElementById('industrySelect');
        const pctRangeSelect = document.getElementById('pctRange');
        const turnoverRangeSelect = document.getElementById('turnoverRange');
        const daysRange = document.getElementById('daysRange');
        const daysValue = document.getElementById('daysValue');
        const sortSelect = document.getElementById('sortSelect');
        const excludeStCheckbox = document.getElementById('excludeSt');
        const onlyHighlightCheckbox = document.getElementById('onlyHighlight');
        const avgPctMinInput = document.getElementById('avgPctMin');
        const avgPctMaxInput = document.getElementById('avgPctMax');
        const avgTurnMinInput = document.getElementById('avgTurnMin');
        const avgTurnMaxInput = document.getElementById('avgTurnMax');
        const container = document.getElementById('ladderContainer');

        function getParams() {
          const source = location.search || (location.hash ? '?' + location.hash.substring(1) : '');
          return new URLSearchParams(source);
        }

        function parseMinMax(text) {
          if (!text) return { min: null, max: null };
          const [minStr, maxStr] = String(text).split('-');
          const min = minStr !== undefined && minStr !== '' ? Number(minStr) : null;
          const max = maxStr !== undefined && maxStr !== '' ? Number(maxStr) : null;
          return { min, max };
        }

        function applyHighlightRuleFromParams() {
          const params = getParams();
          const avgPctRange = params.get('avgPct'); // e.g., 2-8
          const avgTurnRange = params.get('avgTurnover'); // e.g., 3-12
          if (avgPctRange) {
            const { min, max } = parseMinMax(avgPctRange);
            if (min !== null) HIGHLIGHT_RULE.avgPctMin = min;
            if (max !== null) HIGHLIGHT_RULE.avgPctMax = max;
          }
          if (avgTurnRange) {
            const { min, max } = parseMinMax(avgTurnRange);
            if (min !== null) HIGHLIGHT_RULE.avgTurnoverMin = min;
            if (max !== null) HIGHLIGHT_RULE.avgTurnoverMax = max;
          }
        }

        function syncHighlightInputsFromRule() {
          if (avgPctMinInput) avgPctMinInput.value = HIGHLIGHT_RULE.avgPctMin ?? '';
          if (avgPctMaxInput) avgPctMaxInput.value = HIGHLIGHT_RULE.avgPctMax ?? '';
          if (avgTurnMinInput) avgTurnMinInput.value = HIGHLIGHT_RULE.avgTurnoverMin ?? '';
          if (avgTurnMaxInput) avgTurnMaxInput.value = HIGHLIGHT_RULE.avgTurnoverMax ?? '';
        }

        function updateHighlightRuleFromInputs() {
          const pctMin = Number(avgPctMinInput.value);
          const pctMax = Number(avgPctMaxInput.value);
          const turnMin = Number(avgTurnMinInput.value);
          const turnMax = Number(avgTurnMaxInput.value);
          HIGHLIGHT_RULE.avgPctMin = Number.isNaN(pctMin) ? HIGHLIGHT_RULE.avgPctMin : pctMin;
          HIGHLIGHT_RULE.avgPctMax = Number.isNaN(pctMax) ? HIGHLIGHT_RULE.avgPctMax : pctMax;
          HIGHLIGHT_RULE.avgTurnoverMin = Number.isNaN(turnMin) ? HIGHLIGHT_RULE.avgTurnoverMin : turnMin;
          HIGHLIGHT_RULE.avgTurnoverMax = Number.isNaN(turnMax) ? HIGHLIGHT_RULE.avgTurnoverMax : turnMax;
        }

        function initFilters() {
          industrySelect.innerHTML = ['<option value="all">全部行业</option>', ...industries.map(item => `<option value="${item}">${item}</option>`)].join('');
          keywordInput.addEventListener('input', handleChange);
          industrySelect.addEventListener('change', handleChange);
          pctRangeSelect.addEventListener('change', handleChange);
          turnoverRangeSelect.addEventListener('change', handleChange);
          sortSelect.addEventListener('change', handleChange);
          excludeStCheckbox.addEventListener('change', handleChange);
          onlyHighlightCheckbox.addEventListener('change', handleChange);
          daysRange.addEventListener('input', () => {
            daysValue.textContent = daysRange.value;
            handleChange();
          });

          // 初始化精选阈值：先处理 URL 参数，再同步到输入框
          applyHighlightRuleFromParams();
          syncHighlightInputsFromRule();
          const onHLChange = () => { updateHighlightRuleFromInputs(); handleChange(); };
          if (avgPctMinInput) avgPctMinInput.addEventListener('input', onHLChange);
          if (avgPctMaxInput) avgPctMaxInput.addEventListener('input', onHLChange);
          if (avgTurnMinInput) avgTurnMinInput.addEventListener('input', onHLChange);
          if (avgTurnMaxInput) avgTurnMaxInput.addEventListener('input', onHLChange);
        }

        function normalizeNumber(value) {
          if (!value) return 0;
          const cleaned = value.replace('%', '');
          const num = Number(cleaned);
          return Number.isNaN(num) ? 0 : num;
        }

        function getPctRange(rangeValue) {
          const mapping = {
            '0-5': { min: 0, max: 5 },
            '5-10': { min: 5, max: 10 },
            '10-15': { min: 10, max: 15 },
            '15+': { min: 15, max: null },
          };
          return mapping[rangeValue] || { min: null, max: null };
        }

        function getTurnoverRange(rangeValue) {
          const mapping = {
            '0-5': { min: 0, max: 5 },
            '5-10': { min: 5, max: 10 },
            '10-20': { min: 10, max: 20 },
            '20+': { min: 20, max: null },
          };
          return mapping[rangeValue] || { min: null, max: null };
        }

        // 精选规则参数（使用“平均/天”的门槛，可按需微调）
        const HIGHLIGHT_RULE = {
          avgTurnoverMin: 3,   // 平均换手率下限（%/天）
          avgTurnoverMax: 12,  // 平均换手率上限（%/天）
          avgPctMin: 2,        // 平均涨幅下限（%/天）
          avgPctMax: 8,        // 平均涨幅上限（%/天）
        };

        function getAvgTurnover(item) {
          const days = Math.max(1, Number(item['连涨天数']) || 0);
          const turnover = normalizeNumber(item['累计换手率']);
          return turnover / days;
        }

        function getAvgPct(item) {
          const days = Math.max(1, Number(item['连涨天数']) || 0);
          const pct = normalizeNumber(item['连续涨跌幅']);
          return pct / days;
        }

        function shouldHighlight(item) {
          const avgTurnover = getAvgTurnover(item);
          const avgPct = getAvgPct(item);
          return (
            avgTurnover >= HIGHLIGHT_RULE.avgTurnoverMin &&
            (HIGHLIGHT_RULE.avgTurnoverMax === null || avgTurnover <= HIGHLIGHT_RULE.avgTurnoverMax) &&
            avgPct >= HIGHLIGHT_RULE.avgPctMin &&
            (HIGHLIGHT_RULE.avgPctMax === null || avgPct <= HIGHLIGHT_RULE.avgPctMax)
          );
        }

        function isStStock(name) {
          if (!name) return false;
          return name.toUpperCase().includes('ST');
        }

        function filterData() {
          const keyword = keywordInput.value.trim();
          const industry = industrySelect.value;
          const pctRange = pctRangeSelect.value;
          const turnoverRange = turnoverRangeSelect.value;
          const minDays = Number(daysRange.value);
          const sort = sortSelect.value;
          const excludeSt = excludeStCheckbox.checked;
          const onlyHighlight = onlyHighlightCheckbox.checked;
          const { min: pctMin, max: pctMax } = getPctRange(pctRange);
          const { min: turnoverMin, max: turnoverMax } = getTurnoverRange(turnoverRange);

          let filtered = data.filter(item => {
            const day = Number(item['连涨天数']) || 0;
            const pct = normalizeNumber(item['连续涨跌幅']); // 累计涨跌幅（兼容旧排序）
            const turnover = normalizeNumber(item['累计换手率']); // 累计换手率（兼容旧用途）
            const avgPct = getAvgPct(item);
            const avgTurnover = getAvgTurnover(item);
            if (day < minDays) return false;
            if (industry !== 'all' && item['所属行业'] !== industry) return false;
            if (pctRange !== 'all') {
              if (pctMin !== null && avgPct < pctMin) return false;
              if (pctMax !== null && avgPct >= pctMax) return false;
            }
            if (turnoverRange !== 'all') {
              if (turnoverMin !== null && avgTurnover < turnoverMin) return false;
              if (turnoverMax !== null && avgTurnover >= turnoverMax) return false;
            }
            if (excludeSt && isStStock(item['股票简称'])) return false;
            if (onlyHighlight && !shouldHighlight(item)) return false;
            if (keyword) {
              return item['股票简称'].includes(keyword) || item['股票代码'].includes(keyword);
            }
            return true;
          });

          const sorters = {
            days: (a, b) => (Number(b['连涨天数']) || 0) - (Number(a['连涨天数']) || 0),
            pct: (a, b) => normalizeNumber(b['连续涨跌幅']) - normalizeNumber(a['连续涨跌幅']),
            avgPct: (a, b) => getAvgPct(b) - getAvgPct(a),
            avgTurnover: (a, b) => getAvgTurnover(b) - getAvgTurnover(a),
            close: (a, b) => normalizeNumber(b['收盘价(元)']) - normalizeNumber(a['收盘价(元)']),
          };
          filtered = filtered.sort(sorters[sort]);
          return filtered;
        }

        function groupByDays(list) {
          return list.reduce((acc, item) => {
            const day = Number(item['连涨天数']) || 0;
            (acc[day] = acc[day] || []).push(item);
            return acc;
          }, {});
        }

        function createTooltip(item) {
          const avgTurnover = getAvgTurnover(item);
          const avgPct = getAvgPct(item);
          return `
            <div class="stock-tooltip">
              <h4>${item['股票简称']} · ${item['股票代码']}</h4>
              <ul>
                <li><span>收盘价</span><strong>${item['收盘价(元)']}</strong></li>
                <li><span>最高价</span><strong>${item['最高价(元)']}</strong></li>
                <li><span>最低价</span><strong>${item['最低价(元)']}</strong></li>
                <li><span>连续天数</span><strong>${item['连涨天数']}天</strong></li>
                <li><span>累计换手率</span><strong>${item['累计换手率']}</strong></li>
                <li><span>市盈率</span><strong>${item['市盈率'] || '--'}</strong></li>
                <li><span>平均涨幅/天</span><strong>${avgPct.toFixed(2)}%</strong></li>
                <li><span>平均换手/天</span><strong>${avgTurnover.toFixed(2)}%</strong></li>
              </ul>
            </div>`;
        }

        function buildDetailUrl(code) {
          if (!code) return '#';
          const trimmed = code.trim();
          const prefix = trimmed.startsWith('6') ? 'sh' : 'sz';
          return `https://quote.eastmoney.com/${prefix}${trimmed}.html`;
        }

        function render(list) {
          if (!list.length) {
            container.innerHTML = '<p class="empty">未找到符合条件的股票</p>';
            return;
          }

          const grouped = groupByDays(list);
          const sortedDays = Object.keys(grouped)
            .map(Number)
            .sort((a, b) => b - a);

          container.innerHTML = sortedDays.map(day => {
            const stocks = grouped[day];
            const cards = stocks
              .map(item => {
                const pctValue = normalizeNumber(item['连续涨跌幅']);
                const pctClass = pctValue > 0 ? 'up' : pctValue < 0 ? 'down' : 'flat';
                const pctDisplay = item['连续涨跌幅'] || `${pctValue}%`;
                const industry = item['所属行业'] || '未知';
                const detailUrl = buildDetailUrl(item['股票代码']);
                const highlight = shouldHighlight(item);
                const highlightClass = highlight ? ' highlight' : '';
                const highlightBadge = highlight ? '<span class="highlight-badge">精选</span>' : '';
                return `
                <a class="stock-card${highlightClass}" href="${detailUrl}" target="_blank" rel="noopener noreferrer">
                  ${highlightBadge}
                  <div class="stock-name">${item['股票简称']}</div>
                  <div class="pct-block">
                    <span class="pct-value ${pctClass}">${pctDisplay}</span>
                  </div>
                  <span class="industry-chip">${industry}</span>
                  ${createTooltip(item)}
                </a>
              `;
              })
              .join('');

            return `
              <section class="ladder-group">
                <div class="ladder-head">
                  <div class="ladder-title">
                    <span class="ladder-day">${day}</span>
                    <span class="ladder-sub">连涨天</span>
                  </div>
                  <div class="ladder-count">共 ${stocks.length} 只</div>
                </div>
                <div class="ladder-cards">${cards}</div>
              </section>
            `;
          }).join('');
        }

        function handleChange() {
          const filtered = filterData();
          render(filtered);
        }

        initFilters();
        render(data);
      </script>
    </body>
    </html>
    """

    html_text = (
        template.replace("__TOTAL__", str(total))
        .replace("__MAX_DAYS__", str(max_days))
        .replace("__GENERATED_AT__", generated_at)
        .replace("__DATA_JSON__", data_json)
        .replace("__INDUSTRIES_JSON__", industries_json)
    )
    return html_text.replace("{{", "{").replace("}}", "}")


def save_to_html(rows: List[Dict[str, str]], output_path: Path) -> None:
    """生成并写入 HTML 页面。"""

    # 同步补充平均值与市盈率
    rows = annotate_with_averages(rows)
    enriched_rows = annotate_with_pe_ratio(rows)
    content = generate_html_content(enriched_rows)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="爬取连涨股票榜单数据并保存为 CSV/JSON。")
    parser.add_argument(
        "-o",
        "--output",
        help="输出文件路径 (默认: 根据格式自动命名)",
    )
    parser.add_argument(
        "-m",
        "--max-pages",
        type=int,
        help="可选，限制抓取的最大页数",
    )
    parser.add_argument(
        "-f",
        "--format",
        choices=("csv", "json", "html"),
        default="html",
        help="输出数据格式，支持 csv/json/html，默认 json",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_name = f"lxsz_rankings_{timestamp}.{args.format}"
    output_path = Path(args.output or default_name).expanduser().resolve()
    rows = crawl_all_pages(args.max_pages)

    if not rows:
        raise SystemExit("未获取到任何数据，程序结束。")

    if args.format == "csv":
        save_to_csv(rows, output_path)
    elif args.format == "json":
        save_to_json(rows, output_path)
    else:
        save_to_html(rows, output_path)

    print(f"共抓取 {len(rows)} 条记录，已保存至 {output_path}。")


if __name__ == "__main__":
    main()
