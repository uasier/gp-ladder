"""同花顺连涨榜抓取与解析。"""

from __future__ import annotations

import html
import re
import sys
from typing import Callable, Dict, List

import requests

from gp.constants import BASE_URL, FIELDS, HEADERS

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
        rows.append(dict(zip(FIELDS, cells[: len(FIELDS)])))
    return rows


def crawl_all_pages(
    max_pages: int | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> List[Dict[str, str]]:
    """依次抓取所有页面，直到没有数据或达到页数上限。"""

    page = 1
    all_rows: List[Dict[str, str]] = []
    while True:
        if max_pages and page > max_pages:
            break
        if on_progress:
            on_progress(f"正在抓取连涨榜第 {page} 页")
        try:
            html_text = fetch_page_html(page)
        except requests.RequestException as exc:  # pragma: no cover
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
        if on_progress:
            on_progress(f"已抓取 {len(all_rows)} 只，正在翻第 {page + 1} 页")
        page += 1

    return all_rows
