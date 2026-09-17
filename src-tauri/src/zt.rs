//! 东方财富涨停池：按连板数构成涨停天梯。

use crate::format::{format_fund_amount, format_price, format_signed_percent, json_to_optional_float};
use crate::http::{self, USER_AGENT};
use crate::types::StockRow;
use chrono::{Days, Local};
use serde_json::Value;
use std::time::Duration;

const ZT_URL: &str = "https://push2ex.eastmoney.com/getTopicZTPool";
const ZT_UT: &str = "7eea3edcaed734bea9cbfc24409ed989";

pub fn format_hhmmss(value: &Value) -> String {
    let raw = match value {
        Value::Number(n) => n.as_i64().unwrap_or(0).to_string(),
        Value::String(s) => s.trim().to_string(),
        _ => String::new(),
    };
    if raw.is_empty() || raw == "0" {
        return String::new();
    }
    let padded = format!("{raw:0>6}");
    if padded.len() < 6 {
        return raw;
    }
    format!("{}:{}:{}", &padded[0..2], &padded[2..4], &padded[4..6])
}

fn price_from_pool(value: &Value) -> Option<f64> {
    let n = json_to_optional_float(value)?;
    if n.abs() >= 1000.0 {
        Some(n / 1000.0)
    } else if n.abs() >= 100.0 {
        Some(n / 100.0)
    } else {
        Some(n)
    }
}

fn zttj_text(value: &Value) -> String {
    let days = value
        .get("days")
        .and_then(|v| json_to_optional_float(v))
        .map(|n| n as i64);
    let ct = value
        .get("ct")
        .and_then(|v| json_to_optional_float(v))
        .map(|n| n as i64);
    match (days, ct) {
        (Some(d), Some(c)) => format!("{d}天{c}板"),
        _ => String::new(),
    }
}

pub fn row_from_pool_item(item: &Value, index: usize) -> Option<StockRow> {
    let code = item.get("c").and_then(Value::as_str)?.trim().to_string();
    if code.is_empty() {
        return None;
    }
    let name = item.get("n").and_then(Value::as_str).unwrap_or("").trim().to_string();
    let lbc = json_to_optional_float(item.get("lbc").unwrap_or(&Value::Null))
        .map(|n| n.max(1.0) as i64)
        .unwrap_or(1);
    let zdp = json_to_optional_float(item.get("zdp").unwrap_or(&Value::Null));
    let price = price_from_pool(item.get("p").unwrap_or(&Value::Null));
    let hs = json_to_optional_float(item.get("hs").unwrap_or(&Value::Null));
    let mut row = StockRow::new();
    row.insert("序号".into(), index.to_string());
    row.insert("股票代码".into(), code);
    row.insert("股票简称".into(), name);
    row.insert("所属行业".into(), item.get("hybk").and_then(Value::as_str).unwrap_or("").to_string());
    row.insert("连涨天数".into(), lbc.to_string());
    row.insert("连板天数".into(), lbc.to_string());
    row.insert("连续涨跌幅".into(), format_signed_percent(zdp));
    row.insert("今日涨跌幅".into(), format_signed_percent(zdp));
    row.insert("现价".into(), format_price(price));
    row.insert("收盘价(元)".into(), format_price(price));
    row.insert("今日换手率".into(), format_signed_percent(hs));
    row.insert("累计换手率".into(), format_signed_percent(hs));
    row.insert("成交额".into(), format_fund_amount(json_to_optional_float(item.get("amount").unwrap_or(&Value::Null))));
    row.insert("封板资金".into(), format_fund_amount(json_to_optional_float(item.get("fund").unwrap_or(&Value::Null))));
    row.insert("流通市值".into(), format_fund_amount(json_to_optional_float(item.get("ltsz").unwrap_or(&Value::Null))));
    row.insert("炸板次数".into(), json_to_optional_float(item.get("zbc").unwrap_or(&Value::Null)).map(|n| n as i64).unwrap_or(0).to_string());
    row.insert("首次封板".into(), format_hhmmss(item.get("fbt").unwrap_or(&Value::Null)));
    row.insert("最后封板".into(), format_hhmmss(item.get("lbt").unwrap_or(&Value::Null)));
    row.insert("涨停统计".into(), zttj_text(item.get("zttj").unwrap_or(&Value::Null)));
    Some(row)
}

pub(crate) fn fetch_pool(date: &str) -> Result<Vec<Value>, String> {
    let query = [
        ("ut", ZT_UT.to_string()),
        ("dpt", "wz.ztzt".into()),
        ("Pageindex", "0".into()),
        ("pagesize", "500".into()),
        ("sort", "lbc:desc".into()),
        ("date", date.to_string()),
    ];
    let headers = [
        ("User-Agent", USER_AGENT),
        ("Referer", "https://quote.eastmoney.com/ztb/detail"),
    ];
    let timeout = Duration::from_secs(15);
    let mut last = String::new();
    for trust_env in [true, false] {
        match http::get_json(ZT_URL, &query, &headers, timeout, trust_env) {
            Ok(payload) => {
                let data = payload.get("data");
                if data.map(Value::is_null).unwrap_or(true) {
                    return Ok(Vec::new());
                }
                let pool = data
                    .and_then(|d| d.get("pool"))
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                return Ok(pool);
            }
            Err(err) => last = err,
        }
    }
    Err(last)
}

pub fn fetch_recent_pool(on_progress: impl Fn(&str)) -> Result<(Vec<Value>, String), String> {
    let mut date = Local::now().date_naive();
    let mut last_err = String::new();
    for offset in 0..10 {
        if offset > 0 {
            date = date.checked_sub_days(Days::new(1)).unwrap_or(date);
        }
        let stamp = date.format("%Y%m%d").to_string();
        on_progress(&format!("正在抓取涨停池 {stamp}"));
        match fetch_pool(&stamp) {
            Ok(pool) if !pool.is_empty() => return Ok((pool, stamp)),
            Ok(_) => last_err = format!("{stamp} 无涨停数据"),
            Err(err) => last_err = err,
        }
    }
    Err(if last_err.is_empty() {
        "未获取到涨停池数据".into()
    } else {
        last_err
    })
}

pub fn crawl_limit_up(on_progress: impl Fn(&str)) -> Result<(Vec<StockRow>, String), String> {
    let (pool, stamp) = fetch_recent_pool(on_progress)?;
    let mut rows = Vec::new();
    for (i, item) in pool.iter().enumerate() {
        if let Some(row) = row_from_pool_item(item, i + 1) {
            rows.push(row);
        }
    }
    if rows.is_empty() {
        return Err(format!("{stamp} 涨停池无法解析"));
    }
    Ok((rows, stamp))
}

#[allow(dead_code)]
pub fn is_auction_seal(fbt: &Value) -> bool {
    let n = match fbt {
        Value::Number(num) => num.as_i64().unwrap_or(0),
        Value::String(s) => s.replace(':', "").parse::<i64>().unwrap_or(0),
        _ => 0,
    };
    (91_500..=92_559).contains(&n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn formats_seal_time() {
        assert_eq!(format_hhmmss(&json!(92500)), "09:25:00");
        assert_eq!(format_hhmmss(&json!(145600)), "14:56:00");
        assert_eq!(format_hhmmss(&json!(0)), "");
    }

    #[test]
    fn maps_pool_item() {
        let item = json!({
            "c": "000020",
            "n": "深华发Ａ",
            "p": 17530,
            "zdp": 9.97,
            "amount": 130046340.0,
            "hs": 4.09,
            "lbc": 2,
            "fbt": 92500,
            "lbt": 92500,
            "fund": 371406321.0,
            "zbc": 0,
            "hybk": "电子元件",
            "zttj": {"days": 5, "ct": 2}
        });
        let row = row_from_pool_item(&item, 1).unwrap();
        assert_eq!(row["股票代码"], "000020");
        assert_eq!(row["连涨天数"], "2");
        assert_eq!(row["连板天数"], "2");
        assert_eq!(row["今日涨跌幅"], "9.97%");
        assert_eq!(row["现价"], "17.53");
        assert_eq!(row["首次封板"], "09:25:00");
        assert_eq!(row["涨停统计"], "5天2板");
        assert_eq!(row["所属行业"], "电子元件");
    }

    #[test]
    fn auction_seal_window() {
        assert!(is_auction_seal(&json!(92500)));
        assert!(is_auction_seal(&json!(91500)));
        assert!(!is_auction_seal(&json!(93000)));
        assert!(!is_auction_seal(&json!(0)));
    }
}
