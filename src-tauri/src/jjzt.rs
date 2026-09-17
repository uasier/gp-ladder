//! 昨日涨停，今日竞价结束后红盘且涨幅 2%–8%。

use crate::format::{
    format_fund_amount, format_price, format_signed_percent, json_to_optional_float, to_optional_float,
};
use crate::http::{self, USER_AGENT};
use crate::types::StockRow;
use crate::zt;
use chrono::{Days, Local};
use serde_json::Value;
use std::time::Duration;

const YZT_URL: &str = "https://push2ex.eastmoney.com/getYesterdayZTPool";
const UT: &str = "7eea3edcaed734bea9cbfc24409ed989";

pub const GAIN_MIN: f64 = 2.0;
pub const GAIN_MAX: f64 = 8.0;

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

pub fn row_from_yesterday_item(item: &Value, index: usize) -> Option<StockRow> {
    let code = item.get("c").and_then(Value::as_str)?.trim().to_string();
    if code.is_empty() {
        return None;
    }
    let name = item.get("n").and_then(Value::as_str).unwrap_or("").trim().to_string();
    let ylbc = json_to_optional_float(item.get("ylbc").unwrap_or(&Value::Null))
        .map(|n| n.max(1.0) as i64)
        .unwrap_or(1);
    let zdp = json_to_optional_float(item.get("zdp").unwrap_or(&Value::Null));
    let price = price_from_pool(item.get("p").unwrap_or(&Value::Null));
    let hs = json_to_optional_float(item.get("hs").unwrap_or(&Value::Null));
    let mut row = StockRow::new();
    row.insert("序号".into(), index.to_string());
    row.insert("股票代码".into(), code);
    row.insert("股票简称".into(), name);
    row.insert(
        "所属行业".into(),
        item.get("hybk").and_then(Value::as_str).unwrap_or("").to_string(),
    );
    row.insert("连涨天数".into(), ylbc.to_string());
    row.insert("连板天数".into(), ylbc.to_string());
    row.insert("昨日连板".into(), ylbc.to_string());
    row.insert("连续涨跌幅".into(), format_signed_percent(zdp));
    row.insert("今日涨跌幅".into(), format_signed_percent(zdp));
    row.insert("现价".into(), format_price(price));
    row.insert("收盘价(元)".into(), format_price(price));
    row.insert("今日换手率".into(), format_signed_percent(hs));
    row.insert("累计换手率".into(), format_signed_percent(hs));
    row.insert(
        "成交额".into(),
        format_fund_amount(json_to_optional_float(item.get("amount").unwrap_or(&Value::Null))),
    );
    row.insert(
        "流通市值".into(),
        format_fund_amount(json_to_optional_float(item.get("ltsz").unwrap_or(&Value::Null))),
    );
    row.insert("昨日封板".into(), zt::format_hhmmss(item.get("yfbt").unwrap_or(&Value::Null)));
    row.insert("筛选条件".into(), "昨涨停 · 今开红盘 2%–8%".into());
    Some(row)
}

fn fetch_yesterday_pool(date: &str) -> Result<Vec<Value>, String> {
    let query = [
        ("ut", UT.to_string()),
        ("dpt", "wz.ztzt".into()),
        ("Pageindex", "0".into()),
        ("pagesize", "500".into()),
        ("sort", "zs:desc".into()),
        ("date", date.to_string()),
    ];
    let headers = [
        ("User-Agent", USER_AGENT),
        ("Referer", "https://quote.eastmoney.com/ztb/detail"),
    ];
    let timeout = Duration::from_secs(15);
    let mut last = String::new();
    for trust_env in [true, false] {
        match http::get_json(YZT_URL, &query, &headers, timeout, trust_env) {
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

pub fn crawl_yesterday_red(on_progress: impl Fn(&str)) -> Result<(Vec<StockRow>, String), String> {
    let mut date = Local::now().date_naive();
    let mut last_err = String::new();
    for offset in 0..10 {
        if offset > 0 {
            date = date.checked_sub_days(Days::new(1)).unwrap_or(date);
        }
        let stamp = date.format("%Y%m%d").to_string();
        on_progress(&format!("正在抓取昨日涨停池 {stamp}"));
        match fetch_yesterday_pool(&stamp) {
            Ok(pool) if !pool.is_empty() => {
                let mut rows = Vec::new();
                for (i, item) in pool.iter().enumerate() {
                    if let Some(row) = row_from_yesterday_item(item, i + 1) {
                        rows.push(row);
                    }
                }
                if rows.is_empty() {
                    continue;
                }
                return Ok((rows, stamp));
            }
            Ok(_) => last_err = format!("{stamp} 无昨日涨停数据"),
            Err(err) => last_err = err,
        }
    }
    Err(if last_err.is_empty() {
        "未获取到昨日涨停数据".into()
    } else {
        last_err
    })
}

fn gain_pct(row: &StockRow) -> Option<f64> {
    to_optional_float(row.get("今开涨幅").map(String::as_str).unwrap_or(""))
        .or_else(|| to_optional_float(row.get("今日涨跌幅").map(String::as_str).unwrap_or("")))
}

/// 竞价结束后红盘，涨幅落在 2%–8%。优先用今开涨幅（竞价结果），否则用最新涨跌幅。
pub fn keep_open_gain_2_to_8(rows: Vec<StockRow>) -> Vec<StockRow> {
    rows.into_iter()
        .filter(|row| match gain_pct(row) {
            Some(pct) => pct >= GAIN_MIN && pct <= GAIN_MAX,
            None => false,
        })
        .enumerate()
        .map(|(i, mut row)| {
            row.insert("序号".into(), (i + 1).to_string());
            row
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_yesterday_item() {
        let item = json!({
            "c": "000001",
            "n": "平安银行",
            "p": 10500,
            "zdp": 3.21,
            "hs": 2.5,
            "ylbc": 2,
            "yfbt": 92500,
            "hybk": "银行"
        });
        let row = row_from_yesterday_item(&item, 1).unwrap();
        assert_eq!(row["股票代码"], "000001");
        assert_eq!(row["连板天数"], "2");
        assert_eq!(row["昨日连板"], "2");
        assert_eq!(row["今日涨跌幅"], "3.21%");
        assert_eq!(row["现价"], "10.50");
        assert_eq!(row["昨日封板"], "09:25:00");
    }

    #[test]
    fn filters_open_gain_band() {
        let mut a = StockRow::new();
        a.insert("今开涨幅".into(), "3.50%".into());
        a.insert("股票代码".into(), "1".into());
        let mut b = StockRow::new();
        b.insert("今开涨幅".into(), "1.20%".into());
        b.insert("股票代码".into(), "2".into());
        let mut c = StockRow::new();
        c.insert("今日涨跌幅".into(), "8.00%".into());
        c.insert("股票代码".into(), "3".into());
        let mut d = StockRow::new();
        d.insert("今日涨跌幅".into(), "9.10%".into());
        d.insert("股票代码".into(), "4".into());
        let kept = keep_open_gain_2_to_8(vec![a, b, c, d]);
        let codes: Vec<_> = kept.iter().map(|r| r["股票代码"].as_str()).collect();
        assert_eq!(codes, vec!["1", "3"]);
    }
}
