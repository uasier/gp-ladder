//! 同花顺连涨榜：下载页面并解析表格。

use crate::http;
use crate::types::StockRow;
use regex::Regex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

pub const BASE_URL: &str = "https://data.10jqka.com.cn/rank/lxsz/field/lxts/order/desc/page/{page}/";
pub const FIELDS: &[&str] = &[
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
];

fn table_body_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?is)<tbody[^>]*>(.*?)</tbody>").expect("tbody regex"))
}

fn row_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?is)<tr[^>]*>(.*?)</tr>").expect("tr regex"))
}

fn cell_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?is)<td[^>]*>(.*?)</td>").expect("td regex"))
}

fn comment_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?s)<!--.*?-->").expect("comment regex"))
}

fn tag_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<[^>]+>").expect("tag regex"))
}

pub fn strip_html(value: &str) -> String {
    let without_comments = comment_re().replace_all(value, "");
    let without_tags = tag_re().replace_all(&without_comments, "");
    html_escape::decode_html_entities(&without_tags)
        .replace('\u{00a0}', " ")
        .trim()
        .to_string()
}

pub fn parse_stock_rows(page_html: &str) -> Vec<StockRow> {
    let Some(body) = table_body_re().captures(page_html) else {
        return Vec::new();
    };
    let rows_html = body.get(1).map(|m| m.as_str()).unwrap_or("");
    let mut rows = Vec::new();
    for row_html in row_re().captures_iter(rows_html) {
        let inner = row_html.get(1).map(|m| m.as_str()).unwrap_or("");
        let cells: Vec<String> = cell_re()
            .captures_iter(inner)
            .map(|c| strip_html(c.get(1).map(|m| m.as_str()).unwrap_or("")))
            .collect();
        if cells.len() < FIELDS.len() {
            continue;
        }
        let mut row = StockRow::new();
        for (key, value) in FIELDS.iter().zip(cells.iter().take(FIELDS.len())) {
            row.insert((*key).to_string(), value.clone());
        }
        rows.push(row);
    }
    rows
}

pub fn fetch_page_html(page: u32) -> Result<String, String> {
    let url = BASE_URL.replace("{page}", &page.to_string());
    http::get_text(
        &url,
        &[
            ("User-Agent", http::USER_AGENT),
            ("Referer", "https://data.10jqka.com.cn/rank/lxsz/"),
        ],
        std::time::Duration::from_secs(15),
    )
}

pub fn crawl_all_pages(
    max_pages: Option<u32>,
    cancel: Option<&AtomicBool>,
    on_progress: impl Fn(&str),
) -> Result<Vec<StockRow>, String> {
    let mut page = 1u32;
    let mut all_rows = Vec::new();
    loop {
        if cancel.map(|c| c.load(Ordering::SeqCst)).unwrap_or(false) {
            return Err("已取消".into());
        }
        if let Some(max) = max_pages {
            if page > max {
                break;
            }
        }
        on_progress(&format!("正在抓取连涨榜第 {page} 页"));
        let html_text = match fetch_page_html(page) {
            Ok(text) => text,
            Err(err) => {
                if all_rows.is_empty() {
                    return Err(format!("抓取第{page}页失败: {err}"));
                }
                break;
            }
        };
        let page_rows = parse_stock_rows(&html_text);
        if page_rows.is_empty() {
            break;
        }
        all_rows.extend(page_rows);
        on_progress(&format!("已抓取 {} 只，正在翻第 {} 页", all_rows.len(), page + 1));
        page += 1;
    }
    Ok(all_rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_HTML: &str = r#"
<table><tbody>
<tr>
<td>1</td><td>000001</td><td>平安银行</td><td>10.00</td><td>10.50</td><td>9.80</td>
<td>3</td><td>9.00%</td><td>15.00%</td><td>银行</td>
</tr>
</tbody></table>
"#;

    #[test]
    fn parse_sample_row() {
        let rows = parse_stock_rows(SAMPLE_HTML);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["股票代码"], "000001");
        assert_eq!(rows[0]["股票简称"], "平安银行");
        assert_eq!(rows[0]["连涨天数"], "3");
        assert_eq!(rows[0]["所属行业"], "银行");
    }

    #[test]
    fn empty_html_is_empty() {
        assert!(parse_stock_rows("<html></html>").is_empty());
    }
}
