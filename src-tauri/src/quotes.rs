//! 东方财富当日行情与散户资金。

use crate::format::{
    body_gain_pct, format_fund_amount, format_price, format_quote_time, format_signed_percent,
    json_to_optional_float,
};
use crate::http::{self, USER_AGENT};
use crate::types::StockRow;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

const EASTMONEY_ULIST_URLS: &[&str] = &[
    "https://push2delay.eastmoney.com/api/qt/ulist.np/get",
    "https://push2.eastmoney.com/api/qt/ulist.np/get",
];
const EASTMONEY_ULIST_FIELDS: &str = "f12,f2,f3,f6,f8,f9,f10,f15,f16,f17,f18,f84,f87,f124";

static WORKING: Mutex<Option<(String, bool)>> = Mutex::new(None);

#[derive(Debug, Clone, Default)]
pub struct QuoteMetrics {
    pub price: Option<f64>,
    pub change_pct: Option<f64>,
    pub amount: Option<f64>,
    pub turnover: Option<f64>,
    pub volume_ratio: Option<f64>,
    pub pe: Option<f64>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub open: Option<f64>,
    pub prev_close: Option<f64>,
    pub retail_amount: Option<f64>,
    pub retail_pct: Option<f64>,
    pub quote_ts: Option<f64>,
}

impl QuoteMetrics {
    fn from_eastmoney(item: &Value) -> Self {
        Self {
            price: json_to_optional_float(&item["f2"]),
            change_pct: json_to_optional_float(&item["f3"]),
            amount: json_to_optional_float(&item["f6"]),
            turnover: json_to_optional_float(&item["f8"]),
            // fltt=2 返回以倍为单位的量比，无需按百分比缩放。
            volume_ratio: json_to_optional_float(&item["f10"])
                .filter(|value| value.is_finite() && *value >= 0.0),
            pe: json_to_optional_float(&item["f9"]),
            high: json_to_optional_float(&item["f15"]),
            low: json_to_optional_float(&item["f16"]),
            open: json_to_optional_float(&item["f17"]),
            prev_close: json_to_optional_float(&item["f18"]),
            retail_amount: json_to_optional_float(&item["f84"]),
            retail_pct: json_to_optional_float(&item["f87"]),
            quote_ts: json_to_optional_float(&item["f124"]),
        }
    }
}

pub fn build_eastmoney_secid(code: &str) -> Option<String> {
    let trimmed = code.trim();
    if trimmed.is_empty() {
        return None;
    }
    let first = trimmed.chars().next()?;
    match first {
        '5' | '6' | '9' => Some(format!("1.{trimmed}")),
        '0' | '1' | '2' | '3' | '4' | '8' => Some(format!("0.{trimmed}")),
        _ => None,
    }
}

fn parse_diff(payload: &Value) -> Vec<Value> {
    let data = payload.get("data").unwrap_or(&Value::Null);
    match data.get("diff") {
        Some(Value::Array(arr)) => arr.clone(),
        Some(Value::Object(map)) => map.values().cloned().collect(),
        _ => Vec::new(),
    }
}

pub fn fetch_eastmoney_ulist(query: &[(&str, String)], timeout: Duration) -> Vec<Value> {
    fetch_eastmoney_ulist_result(query, timeout).unwrap_or_default()
}

pub fn fetch_eastmoney_ulist_result(
    query: &[(&str, String)],
    timeout: Duration,
) -> Result<Vec<Value>, String> {
    let mut candidates: Vec<(String, bool)> = Vec::new();
    if let Ok(g) = WORKING.lock() {
        if let Some(pair) = g.clone() {
            candidates.push(pair);
        }
    }
    for url in EASTMONEY_ULIST_URLS {
        for trust_env in [true, false] {
            let pair = ((*url).to_string(), trust_env);
            if !candidates.iter().any(|c| c == &pair) {
                candidates.push(pair);
            }
        }
    }

    let headers = [
        ("User-Agent", USER_AGENT),
        ("Referer", "https://quote.eastmoney.com/"),
    ];
    let mut last_error = "东方财富行情暂时不可用".to_string();
    for (url, trust_env) in candidates {
        match http::get_json(&url, query, &headers, timeout, trust_env) {
            Ok(payload) => {
                let rows: Vec<Value> = parse_diff(&payload)
                    .into_iter()
                    .filter(|v| v.is_object())
                    .collect();
                if let Ok(mut g) = WORKING.lock() {
                    *g = Some((url, trust_env));
                }
                return Ok(rows);
            }
            Err(err) => {
                last_error = err;
                if let Ok(mut g) = WORKING.lock() {
                    if g.as_ref() == Some(&(url.clone(), trust_env)) {
                        *g = None;
                    }
                }
            }
        }
    }
    Err(last_error)
}

pub fn fetch_eastmoney_snapshots(
    rows: &[StockRow],
    cancel: Option<&std::sync::atomic::AtomicBool>,
    on_progress: impl Fn(&str),
) -> Result<HashMap<String, QuoteMetrics>, String> {
    let mut codes: Vec<String> = rows
        .iter()
        .filter_map(|row| row.get("股票代码").map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    codes.sort();
    codes.dedup();

    let secid_pairs: Vec<(String, String)> = codes
        .into_iter()
        .filter_map(|code| build_eastmoney_secid(&code).map(|secid| (code, secid)))
        .collect();
    let mut metrics = HashMap::new();
    if secid_pairs.is_empty() {
        return Ok(metrics);
    }

    const BATCH: usize = 50;
    let total_batches = secid_pairs.len().div_ceil(BATCH);
    for (batch_index, chunk) in secid_pairs.chunks(BATCH).enumerate() {
        if cancel
            .map(|c| c.load(std::sync::atomic::Ordering::SeqCst))
            .unwrap_or(false)
        {
            return Err("已取消".into());
        }
        on_progress(&format!(
            "正在拉取东方财富行情 {}/{}",
            batch_index + 1,
            total_batches
        ));
        let secids = chunk
            .iter()
            .map(|(_, secid)| secid.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let query = [
            ("fltt", "2".into()),
            ("invt", "2".into()),
            ("fields", EASTMONEY_ULIST_FIELDS.into()),
            ("secids", secids),
        ];
        for item in fetch_eastmoney_ulist(&query, Duration::from_secs(10)) {
            let code = item
                .get("f12")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if code.is_empty() {
                continue;
            }
            metrics.insert(code, QuoteMetrics::from_eastmoney(&item));
        }
    }
    Ok(metrics)
}

pub fn annotate_with_live_quotes(
    rows: &mut [StockRow],
    cancel: Option<&std::sync::atomic::AtomicBool>,
    on_progress: impl Fn(&str),
) -> Result<(), String> {
    let snapshots = fetch_eastmoney_snapshots(rows, cancel, on_progress)?;
    apply_quote_metrics(rows, &snapshots);
    Ok(())
}

fn apply_quote_metrics(rows: &mut [StockRow], snapshots: &HashMap<String, QuoteMetrics>) {
    for row in rows.iter_mut() {
        let code = row.get("股票代码").map(|s| s.trim().to_string()).unwrap_or_default();
        let item = snapshots.get(&code).cloned().unwrap_or_default();
        row.insert("现价".into(), format_price(item.price));
        row.insert("今日涨跌幅".into(), format_signed_percent(item.change_pct));
        row.insert("今开".into(), format_price(item.open));
        if let (Some(open), Some(prev)) = (item.open, item.prev_close) {
            if prev.abs() > f64::EPSILON {
                row.insert(
                    "今开涨幅".into(),
                    format_signed_percent(Some((open - prev) / prev * 100.0)),
                );
            }
        }
        row.insert(
            "实体涨幅".into(),
            format_signed_percent(body_gain_pct(item.price, item.open, item.prev_close)),
        );
        row.insert("今高".into(), format_price(item.high));
        row.insert("今低".into(), format_price(item.low));
        row.insert("今日换手率".into(), format_signed_percent(item.turnover));
        row.insert("量比".into(), format_price(item.volume_ratio));
        row.insert("成交额".into(), format_fund_amount(item.amount));
        row.insert("行情时间".into(), format_quote_time(item.quote_ts));
        row.insert(
            "市盈率".into(),
            item.pe.map(|pe| format!("{pe:.2}")).unwrap_or_default(),
        );
        row.insert("散户指数".into(), format_signed_percent(item.retail_pct));
        row.insert("散户净额".into(), format_fund_amount(item.retail_amount));
    }
}

const WATCH_QUOTE_FIELDS: &str = "f12,f14,f100,f2,f3,f6,f8,f9,f10,f15,f16,f17,f18,f84,f87,f124";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodeQuote {
    pub code: String,
    pub name: String,
    #[serde(default)]
    pub industry: String,
    pub price: Option<f64>,
    pub change_pct: Option<f64>,
    pub quote_at: String,
    #[serde(default)]
    pub open: Option<f64>,
    #[serde(default)]
    pub high: Option<f64>,
    #[serde(default)]
    pub low: Option<f64>,
    #[serde(default)]
    pub prev_close: Option<f64>,
    #[serde(default)]
    pub turnover: Option<f64>,
    #[serde(default)]
    pub volume_ratio: Option<f64>,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub pe: Option<f64>,
    #[serde(default)]
    pub retail_pct: Option<f64>,
    #[serde(default)]
    pub retail_amount: Option<f64>,
    #[serde(default)]
    pub rise_days: Option<i64>,
    #[serde(default)]
    pub rise_pct: Option<f64>,
    #[serde(default)]
    pub rise_turnover: Option<f64>,
    #[serde(default)]
    pub limit_days: Option<i64>,
    #[serde(default)]
    pub limit_pct: Option<f64>,
    #[serde(default)]
    pub limit_turnover: Option<f64>,
    #[serde(default)]
    pub limit_stat: String,
}

/// 自选池支持的 A 股代码：沪市 6、深市 0/3、北交所 4/8/92。
pub fn quote_secid(code: &str) -> Option<String> {
    let code = code.trim();
    if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    if code.starts_with("92")
        || code.starts_with('4')
        || code.starts_with('8')
        || code.starts_with('0')
        || code.starts_with('3')
    {
        Some(format!("0.{code}"))
    } else if code.starts_with('6') {
        Some(format!("1.{code}"))
    } else {
        None
    }
}

pub fn parse_code_quote(item: &Value) -> Option<CodeQuote> {
    let code = json_text(&item["f12"]);
    if quote_secid(&code).is_none() {
        return None;
    }
    let metrics = QuoteMetrics::from_eastmoney(item);
    Some(CodeQuote {
        code,
        name: json_text(&item["f14"]),
        industry: json_text(&item["f100"]),
        price: metrics.price.filter(|value| value.is_finite() && *value > 0.0),
        change_pct: metrics.change_pct.filter(|value| value.is_finite()),
        quote_at: format_quote_time(metrics.quote_ts),
        open: positive_metric(metrics.open),
        high: positive_metric(metrics.high),
        low: positive_metric(metrics.low),
        prev_close: positive_metric(metrics.prev_close),
        turnover: metrics.turnover.filter(|value| value.is_finite() && *value >= 0.0),
        volume_ratio: metrics.volume_ratio,
        amount: metrics.amount.filter(|value| value.is_finite() && *value >= 0.0),
        pe: metrics.pe.filter(|value| value.is_finite()),
        retail_pct: metrics.retail_pct.filter(|value| value.is_finite()),
        retail_amount: metrics.retail_amount.filter(|value| value.is_finite()),
        rise_days: None,
        rise_pct: None,
        rise_turnover: None,
        limit_days: None,
        limit_pct: None,
        limit_turnover: None,
        limit_stat: String::new(),
    })
}

fn positive_metric(value: Option<f64>) -> Option<f64> {
    value.filter(|item| item.is_finite() && *item > 0.0)
}

pub fn attach_local_moves(dir: &std::path::Path, quotes: &mut [CodeQuote]) {
    let live = quotes
        .iter()
        .filter_map(|quote| {
            let close = quote.price?;
            Some(crate::market_db::LivePoint {
                code: quote.code.clone(),
                name: quote.name.clone(),
                date: crate::market_db::trade_date_from_quote(&quote.quote_at),
                close,
                high: quote.high,
                low: quote.low,
                prev_close: quote.prev_close,
                change_pct: quote.change_pct,
                turnover: quote.turnover,
            })
        })
        .collect::<Vec<_>>();
    let moves = crate::market_db::moves_for_codes(dir, &live);
    for quote in quotes {
        let Some(item) = moves.get(&quote.code) else {
            continue;
        };
        if quote.industry.is_empty() {
            quote.industry = item.industry.clone();
        }
        quote.rise_days = Some(item.rise_days);
        quote.rise_pct = Some(item.rise_pct);
        quote.rise_turnover = item.rise_turnover;
        quote.limit_days = Some(item.limit_days);
        quote.limit_pct = Some(item.limit_pct);
        quote.limit_turnover = item.limit_turnover;
        quote.limit_stat = item.limit_stat.clone();
    }
}

fn json_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        _ => String::new(),
    }
}

pub fn fetch_code_quotes(codes: &[String]) -> Result<Vec<CodeQuote>, String> {
    let pairs: Vec<(String, String)> = codes
        .iter()
        .filter_map(|code| quote_secid(code).map(|secid| (code.trim().to_string(), secid)))
        .collect();
    if pairs.is_empty() {
        return Ok(Vec::new());
    }
    let mut quotes = Vec::new();
    for chunk in pairs.chunks(50) {
        let secids = chunk
            .iter()
            .map(|(_, secid)| secid.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let query = [
            ("fltt", "2".into()),
            ("invt", "2".into()),
            ("fields", WATCH_QUOTE_FIELDS.into()),
            ("secids", secids),
        ];
        for item in fetch_eastmoney_ulist_result(&query, Duration::from_secs(10))? {
            if let Some(quote) = parse_code_quote(&item) {
                quotes.push(quote);
            }
        }
    }
    if quotes.is_empty() {
        return Err("未获取到这些股票的现价".into());
    }
    Ok(quotes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_ratio_parses_numbers_and_missing_values() {
        assert!(EASTMONEY_ULIST_FIELDS.split(',').any(|field| field == "f10"));
        for value in [serde_json::json!(1.25), serde_json::json!("1.25")] {
            let metrics = QuoteMetrics::from_eastmoney(&serde_json::json!({"f10": value}));
            assert_eq!(metrics.volume_ratio, Some(1.25));
        }
        assert_eq!(
            QuoteMetrics::from_eastmoney(&serde_json::json!({"f10": 0})).volume_ratio,
            Some(0.0),
        );
        for value in [
            Value::Null, serde_json::json!("-"), serde_json::json!("--"),
            serde_json::json!(""), serde_json::json!("NaN"), serde_json::json!("inf"),
            serde_json::json!(-1), serde_json::json!(false),
        ] {
            assert_eq!(
                QuoteMetrics::from_eastmoney(&serde_json::json!({"f10": value})).volume_ratio,
                None,
            );
        }
        assert_eq!(QuoteMetrics::from_eastmoney(&serde_json::json!({})).volume_ratio, None);
    }

    #[test]
    fn volume_ratio_is_saved_in_snapshot_rows_without_percent_scaling() {
        let mut rows = vec![
            StockRow::from([("股票代码".into(), "600519".into())]),
            StockRow::from([("股票代码".into(), "000001".into()), ("量比".into(), "9.99".into())]),
            StockRow::from([("股票代码".into(), "000002".into())]),
        ];
        let metrics = HashMap::from([
            ("600519".into(), QuoteMetrics::from_eastmoney(&serde_json::json!({"f10": 1.25, "f2": 15.5, "f8": 3.2}))),
            ("000002".into(), QuoteMetrics::from_eastmoney(&serde_json::json!({"f10": 0}))),
        ]);
        apply_quote_metrics(&mut rows, &metrics);
        assert_eq!(rows[0]["量比"], "1.25");
        assert_eq!(rows[0]["现价"], "15.50");
        assert_eq!(rows[0]["今日换手率"], "3.20%");
        assert_eq!(rows[1]["量比"], "");
        assert_eq!(rows[2]["量比"], "0.00");
    }

    #[test]
    fn secid_by_exchange_prefix() {
        assert_eq!(build_eastmoney_secid("000001").as_deref(), Some("0.000001"));
        assert_eq!(build_eastmoney_secid("600519").as_deref(), Some("1.600519"));
        assert_eq!(build_eastmoney_secid("300741").as_deref(), Some("0.300741"));
        assert_eq!(build_eastmoney_secid(""), None);
    }

    #[test]
    fn watch_quote_secid_covers_beijing_codes() {
        assert_eq!(quote_secid("600519").as_deref(), Some("1.600519"));
        assert_eq!(quote_secid("688001").as_deref(), Some("1.688001"));
        assert_eq!(quote_secid("000001").as_deref(), Some("0.000001"));
        assert_eq!(quote_secid("300750").as_deref(), Some("0.300750"));
        assert_eq!(quote_secid("920001").as_deref(), Some("0.920001"));
        assert_eq!(quote_secid("830001").as_deref(), Some("0.830001"));
        assert_eq!(quote_secid("111111"), None);
        assert!(fetch_code_quotes(&[]).unwrap().is_empty());
        assert!(fetch_code_quotes(&["abc".into(), "111111".into()]).unwrap().is_empty());
    }

    #[test]
    fn parses_a_single_code_quote() {
        let quote = parse_code_quote(&serde_json::json!({
            "f12": "600519",
            "f14": " 贵州茅台 ",
            "f2": 1688.5,
            "f3": 1.25,
            "f8": 2.4,
            "f10": 1.8,
            "f17": 1670.0,
            "f124": 1700000000
        }))
        .unwrap();
        assert_eq!(quote.code, "600519");
        assert_eq!(quote.name, "贵州茅台");
        assert_eq!(quote.price, Some(1688.5));
        assert_eq!(quote.change_pct, Some(1.25));
        assert_eq!(quote.turnover, Some(2.4));
        assert_eq!(quote.volume_ratio, Some(1.8));
        assert_eq!(quote.open, Some(1670.0));
        assert!(quote.quote_at.contains('-'));
        assert!(parse_code_quote(&serde_json::json!({"f12": "111111"})).is_none());
    }
}
