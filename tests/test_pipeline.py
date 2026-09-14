"""解析、格式化、精选与导出的本地验证。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from gp import constants, crawl, enrich, export, formatters, highlight, quotes

SAMPLE_HTML = """
<table><tbody>
<tr>
<td>1</td><td>000001</td><td>平安银行</td><td>10.00</td><td>10.50</td><td>9.80</td>
<td>3</td><td>9.00%</td><td>15.00%</td><td>银行</td>
</tr>
</tbody></table>
"""


class FormatHelpersTest(unittest.TestCase):
    def test_optional_float(self) -> None:
        self.assertEqual(formatters.to_optional_float(-2.39), -2.39)
        self.assertEqual(formatters.to_optional_float("3.50%"), 3.5)
        self.assertIsNone(formatters.to_optional_float("-"))
        self.assertIsNone(formatters.to_optional_float("--"))
        self.assertIsNone(formatters.to_optional_float(None))

    def test_percent_and_amount(self) -> None:
        self.assertEqual(formatters.format_signed_percent(-2.39), "-2.39%")
        self.assertEqual(formatters.format_signed_percent(None), "")
        self.assertEqual(formatters.format_fund_amount(-30486640.0), "-3048.66万")
        self.assertEqual(formatters.format_fund_amount(1.2e8), "1.20亿")
        self.assertEqual(formatters.format_fund_amount(None), "")
        self.assertEqual(formatters.format_price(18.48), "18.48")
        self.assertEqual(formatters.format_quote_time(1788766449), "2026-09-07 15:34:09")


class RetailIndexTest(unittest.TestCase):
    def test_annotate_with_mocked_fetch(self) -> None:
        rows = [{"股票代码": "000001", "股票简称": "平安银行"}]
        fake = {"000001": {"pct": -2.39, "amount": -30486640.0}}
        with patch.object(quotes, "fetch_retail_indexes", return_value=fake):
            annotated = quotes.annotate_with_retail_index(rows)
        self.assertEqual(annotated[0]["散户指数"], "-2.39%")
        self.assertEqual(annotated[0]["散户净额"], "-3048.66万")

    def test_fetch_parses_ulist_payload(self) -> None:
        rows = [{"股票代码": "000001"}]
        payload = [{"f12": "000001", "f84": -30486640.0, "f87": -2.39}]
        with patch.object(quotes, "fetch_eastmoney_ulist", return_value=payload):
            metrics = quotes.fetch_retail_indexes(rows)
        self.assertEqual(metrics["000001"]["pct"], -2.39)
        self.assertEqual(metrics["000001"]["amount"], -30486640.0)

    def test_live_quotes_from_ulist(self) -> None:
        rows = [{"股票代码": "300741", "股票简称": "华宝股份"}]
        payload = [
            {
                "f12": "300741",
                "f2": 18.48,
                "f3": 9.48,
                "f6": 297720505.87,
                "f8": 2.72,
                "f9": 51.71,
                "f15": 18.52,
                "f16": 16.69,
                "f17": 16.81,
                "f18": 16.88,
                "f84": -12555922.0,
                "f87": -4.22,
                "f124": 1788766449,
            }
        ]
        with patch.object(quotes, "fetch_eastmoney_ulist", return_value=payload):
            annotated = quotes.annotate_with_live_quotes(rows)
        self.assertEqual(annotated[0]["现价"], "18.48")
        self.assertEqual(annotated[0]["今日涨跌幅"], "9.48%")
        self.assertEqual(annotated[0]["今开"], "16.81")
        self.assertEqual(annotated[0]["今高"], "18.52")
        self.assertEqual(annotated[0]["今低"], "16.69")
        self.assertEqual(annotated[0]["今日换手率"], "2.72%")
        self.assertEqual(annotated[0]["成交额"], "2.98亿")
        self.assertEqual(annotated[0]["市盈率"], "51.71")
        self.assertEqual(annotated[0]["散户指数"], "-4.22%")
        self.assertEqual(annotated[0]["行情时间"], "2026-09-07 15:34:09")

    def test_missing_code_stays_empty(self) -> None:
        rows = [{"股票代码": "000001"}]
        with patch.object(quotes, "fetch_retail_indexes", return_value={}):
            annotated = quotes.annotate_with_retail_index(rows)
        self.assertEqual(annotated[0]["散户指数"], "")
        self.assertEqual(annotated[0]["散户净额"], "")


class OutputTest(unittest.TestCase):
    def test_parse_and_averages(self) -> None:
        rows = enrich.annotate_with_averages(crawl.parse_stock_rows(SAMPLE_HTML))
        self.assertEqual(rows[0]["股票代码"], "000001")
        self.assertEqual(rows[0]["平均涨幅/天"], "3.00%")
        self.assertEqual(rows[0]["平均换手/天"], "5.00%")

    def test_html_contains_retail_controls(self) -> None:
        rows = [
            {
                "序号": "1",
                "股票代码": "000001",
                "股票简称": "平安银行",
                "收盘价(元)": "10.00",
                "最高价(元)": "10.50",
                "最低价(元)": "9.80",
                "连涨天数": "3",
                "连续涨跌幅": "9.00%",
                "累计换手率": "15.00%",
                "所属行业": "银行",
                "散户指数": "-2.39%",
                "散户净额": "-3048.66万",
                "市盈率": "5.00",
            }
        ]
        html = export.generate_html_content(rows)
        self.assertIn("散户指数自定义区间", html)
        self.assertIn("散户指数（高→低）", html)
        self.assertIn("getRetailIndex", html)
        self.assertIn("-2.39%", html)
        self.assertIn("-3048.66万", html)
        self.assertIn('class="toolbar', html)
        self.assertIn("更多筛选与精选条件", html)
        self.assertIn("连涨累计", html)
        self.assertIn("数据刷新时间", html)
        self.assertIn("刷新实时数据", html)
        self.assertIn('id="refreshBanner"', html)
        self.assertIn('id="kpiTotal"', html)
        self.assertIn("applySnapshot", html)
        self.assertNotIn("window.location.reload()", html)
        self.assertNotIn("__TOTAL__", html)
        self.assertNotIn("__DATA_JSON__", html)
        self.assertNotIn("__UPDATED_AT__", html)

    def test_html_uses_snapshot_refresh_time(self) -> None:
        html = export.generate_html_content(
            [{"股票代码": "000001", "连涨天数": "2", "所属行业": "银行"}],
            updated_at="2026-09-11 08:00:00",
        )
        self.assertIn("2026-09-11 08:00:00", html)
        self.assertEqual(html.count("2026-09-11 08:00:00"), 2)

    def test_empty_html_shows_not_refreshed(self) -> None:
        html = export.generate_html_content([])
        self.assertIn("尚未刷新", html)
        self.assertIn("刷新实时数据", html)

    def test_csv_includes_retail_columns(self) -> None:
        rows = crawl.parse_stock_rows(SAMPLE_HTML)
        fake = {
            "000001": {
                "retail_pct": 1.25,
                "retail_amount": 250000.0,
                "price": 11.70,
                "change_pct": -1.6,
                "open": 11.87,
                "high": 11.88,
                "low": 11.65,
                "turnover": 0.56,
                "amount": 1275606340.01,
                "pe": 4.42,
                "quote_ts": 1788766449,
            }
        }
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "out.csv"
            with patch.object(quotes, "fetch_eastmoney_snapshots", return_value=fake):
                export.save_to_csv(rows, output)
            text = output.read_text(encoding="utf-8-sig")
        self.assertIn("散户指数", text)
        self.assertIn("散户净额", text)
        self.assertIn("1.25%", text)
        self.assertIn("25.00万", text)
        self.assertIn("现价", text)
        self.assertIn("今日涨跌幅", text)
        self.assertIn("-1.60%", text)

    def test_json_includes_retail_fields(self) -> None:
        rows = crawl.parse_stock_rows(SAMPLE_HTML)
        fake = {
            "000001": {
                "retail_pct": 1.25,
                "retail_amount": 250000.0,
                "price": 11.70,
                "change_pct": -1.6,
                "pe": 4.42,
            }
        }
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "out.json"
            with patch.object(quotes, "fetch_eastmoney_snapshots", return_value=fake):
                export.save_to_json(rows, output)
            payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(payload[0]["散户指数"], "1.25%")
        self.assertEqual(payload[0]["散户净额"], "25.00万")
        self.assertEqual(payload[0]["现价"], "11.70")
        self.assertEqual(payload[0]["今日涨跌幅"], "-1.60%")
        self.assertEqual(payload[0]["市盈率"], "4.42")

    def test_html_contains_retail_filter_controls(self) -> None:
        rows = [
            {
                "序号": "1",
                "股票代码": "000001",
                "股票简称": "平安银行",
                "收盘价(元)": "10.00",
                "最高价(元)": "10.50",
                "最低价(元)": "9.80",
                "连涨天数": "3",
                "连续涨跌幅": "9.00%",
                "累计换手率": "15.00%",
                "所属行业": "银行",
                "散户指数": "-2.39%",
                "散户净额": "-3048.66万",
            }
        ]
        html = export.generate_html_content(rows, retail_min=-5, retail_max=0)
        self.assertIn('id="retailRange"', html)
        self.assertIn("净流出", html)
        self.assertIn("getRetailPresetRange", html)
        self.assertIn("散户指数 &lt;", html)
        self.assertIn("当日换手率 &lt;", html)
        self.assertIn("平均日涨幅 &gt;", html)
        self.assertIn("handleChange();", html)
        self.assertIn('value="-5"', html)
        self.assertIn("retailMax: -5", html)
        self.assertIn("todayTurnoverMax: 10", html)
        self.assertIn("avgPctMin: 1", html)
        self.assertIn("今日涨跌幅区间", html)
        self.assertIn("当前股价区间", html)
        self.assertIn('id="priceRange"', html)
        self.assertIn('id="priceMin"', html)
        self.assertIn("getPriceRange", html)
        self.assertIn("getTodayPct", html)
        self.assertIn("getTodayTurnover", html)


class RetailFilterTest(unittest.TestCase):
    def setUp(self) -> None:
        self._orig = dict(constants.HIGHLIGHT_RULE)

    def tearDown(self) -> None:
        constants.HIGHLIGHT_RULE.clear()
        constants.HIGHLIGHT_RULE.update(self._orig)

    def test_matches_closed_interval(self) -> None:
        row = {"散户指数": "-2.39%"}
        self.assertTrue(highlight.matches_retail_index(row, -5, 0))
        self.assertFalse(highlight.matches_retail_index(row, 0, 5))
        self.assertTrue(highlight.matches_retail_index(row, None, None))
        self.assertFalse(highlight.matches_retail_index({"散户指数": ""}, -5, 0))

    def test_filter_rows(self) -> None:
        rows = [
            {"股票代码": "1", "散户指数": "-4.00%"},
            {"股票代码": "2", "散户指数": "1.50%"},
            {"股票代码": "3", "散户指数": "8.00%"},
        ]
        filtered = highlight.filter_rows_by_retail_index(rows, 0, 5)
        self.assertEqual([row["股票代码"] for row in filtered], ["2"])

    def test_highlight_new_rules(self) -> None:
        qualified = {
            "连涨天数": "3",
            "连续涨跌幅": "9.00%",
            "累计换手率": "15.00%",
            "今日换手率": "4.50%",
            "散户指数": "-6.20%",
        }
        self.assertTrue(highlight.is_highlight_stock(qualified))
        self.assertFalse(highlight.is_highlight_stock({**qualified, "散户指数": "-5.00%"}))
        self.assertFalse(highlight.is_highlight_stock({**qualified, "今日换手率": "10.00%"}))
        self.assertFalse(
            highlight.is_highlight_stock(
                {**qualified, "连涨天数": "5", "连续涨跌幅": "5.00%"}
            )
        )
        self.assertFalse(highlight.is_highlight_stock({**qualified, "今日换手率": ""}))

    def test_json_applies_retail_cli_filter(self) -> None:
        rows = [
            {
                "序号": "1",
                "股票代码": "000001",
                "股票简称": "A",
                "收盘价(元)": "1",
                "最高价(元)": "1",
                "最低价(元)": "1",
                "连涨天数": "3",
                "连续涨跌幅": "9.00%",
                "累计换手率": "15.00%",
                "所属行业": "银行",
            },
            {
                "序号": "2",
                "股票代码": "000002",
                "股票简称": "B",
                "收盘价(元)": "1",
                "最高价(元)": "1",
                "最低价(元)": "1",
                "连涨天数": "3",
                "连续涨跌幅": "9.00%",
                "累计换手率": "15.00%",
                "所属行业": "银行",
            },
        ]
        fake = {
            "000001": {"retail_pct": -2.0, "retail_amount": -10000.0},
            "000002": {"retail_pct": 3.0, "retail_amount": 10000.0},
        }
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "out.json"
            with patch.object(quotes, "fetch_eastmoney_snapshots", return_value=fake):
                export.save_to_json(rows, output, retail_min=0, retail_max=5)
            payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["股票代码"], "000002")


if __name__ == "__main__":
    unittest.main()
