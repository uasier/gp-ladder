//! 东方财富当日行情与散户资金。

use crate::format::{
    body_gain_pct, format_fund_amount, format_price, format_quote_time, format_signed_percent,
    json_to_optional_float,
};
use crate::http::{self, USER_AGENT};
use crate::types::StockRow;
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
                return rows;
            }
            Err(_) => {
                if let Ok(mut g) = WORKING.lock() {
                    if g.as_ref() == Some(&(url.clone(), trust_env)) {
                        *g = None;
                    }
                }
            }
        }
    }
    Vec::new()
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
}
