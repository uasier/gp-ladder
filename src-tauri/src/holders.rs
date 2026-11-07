//! 东方财富股东户数：只取单只股票最近一期已披露记录。
//!
//! 数据来自公开接口 `RPT_F10_EH_HOLDERNUM`。
//! `END_DATE` 是统计截止日（报告期），`NOTICE_DATE` 是公告日期，
//! `HOLDER_TOTAL_NUM` 是股东户数。最新一期按统计截止日选择，
//! 同一截止日再取较新的公告日期，不依赖数组顺序。

use crate::http::{self, USER_AGENT};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const HOLDER_URL: &str = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const PAGE_SIZE: u32 = 100;
const MAX_PAGES: u32 = 5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HolderCountView {
    pub status: &'static str,
    pub code: String,
    pub name: String,
    pub holders: Option<u64>,
    pub end_date: Option<String>,
    pub notice_date: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HolderRecord {
    name: String,
    holders: u64,
    end_date: String,
    notice_date: Option<String>,
}

pub fn lookup_holder_count(code: &str) -> Result<HolderCountView, String> {
    let code = normalize_holder_code(code)?;
    let rows = fetch_holder_rows(&code)?;
    select_latest(&code, &rows)
}

pub fn normalize_holder_code(code: &str) -> Result<String, String> {
    let trimmed = code.trim();
    if trimmed.len() == 6 && trimmed.bytes().all(|byte| byte.is_ascii_digit()) && market_suffix(trimmed).is_some() {
        Ok(trimmed.to_string())
    } else {
        Err("暂不支持该股票代码".into())
    }
}

fn market_suffix(code: &str) -> Option<&'static str> {
    if code.starts_with('6') {
        Some("SH")
    } else if code.starts_with('0') || code.starts_with('3') {
        Some("SZ")
    } else if code.starts_with("92") || code.starts_with('4') || code.starts_with('8') {
        Some("BJ")
    } else {
        None
    }
}

fn empty_view(code: &str, message: &str) -> HolderCountView {
    HolderCountView {
        status: "empty",
        code: code.to_string(),
        name: String::new(),
        holders: None,
        end_date: None,
        notice_date: None,
        message: message.to_string(),
    }
}

fn fetch_holder_rows(code: &str) -> Result<Vec<Value>, String> {
    let mut rows = Vec::new();
    let mut page = 1;
    loop {
        let payload = fetch_holder_page(code, page)?;
        if page == 1 && is_explicit_empty(&payload) {
            return Ok(Vec::new());
        }
        let result = payload
            .get("result")
            .filter(|value| !value.is_null())
            .ok_or_else(|| source_failure(&payload))?;
        let data = result
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| "股东人数数据源返回无法解析".to_string())?;
        rows.extend(data.iter().cloned());
        let pages = result.get("pages").and_then(Value::as_u64).unwrap_or(1);
        if pages <= u64::from(page) || data.is_empty() {
            return Ok(rows);
        }
        if page >= MAX_PAGES {
            return Err("股东人数披露记录不完整，暂时无法确认最新一期".into());
        }
        page += 1;
    }
}

fn is_explicit_empty(payload: &Value) -> bool {
    payload.get("message").and_then(Value::as_str) == Some("返回数据为空")
        && payload.get("result").map(Value::is_null).unwrap_or(true)
}

fn source_failure(payload: &Value) -> String {
    match payload.get("message").and_then(Value::as_str) {
        Some(message) if !message.trim().is_empty() && message != "ok" => {
            format!("股东人数数据源返回失败: {message}")
        }
        _ => "股东人数数据源返回失败".into(),
    }
}

fn fetch_holder_page(code: &str, page: u32) -> Result<Value, String> {
    let query = [
        ("reportName", "RPT_F10_EH_HOLDERNUM".to_string()),
        (
            "columns",
            "SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,END_DATE,NOTICE_DATE,HOLDER_TOTAL_NUM".to_string(),
        ),
        ("filter", format!("(SECURITY_CODE=\"{code}\")")),
        ("pageNumber", page.to_string()),
        ("pageSize", PAGE_SIZE.to_string()),
        ("sortTypes", "-1".to_string()),
        ("sortColumns", "END_DATE".to_string()),
        ("source", "HSF10".to_string()),
        ("client", "PC".to_string()),
    ];
    let headers = [
        ("User-Agent", USER_AGENT),
        ("Referer", "https://data.eastmoney.com/"),
    ];
    let mut last = "股东人数数据源暂时无法访问".to_string();
    for trust_env in [true, false] {
        match http::get_json(HOLDER_URL, &query, &headers, Duration::from_secs(12), trust_env) {
            Ok(payload) => return Ok(payload),
            Err(error) => last = error,
        }
    }
    Err(format!("股东人数数据源暂时无法访问: {last}"))
}

pub fn select_latest(code: &str, rows: &[Value]) -> Result<HolderCountView, String> {
    let code = normalize_holder_code(code)?;
    let suffix = market_suffix(&code).ok_or_else(|| "暂不支持该股票代码".to_string())?;
    let expected = format!("{code}.{suffix}");
    if rows.is_empty() {
        return Ok(empty_view(&code, "暂无披露的股东人数"));
    }
    let mut matched = false;
    let mut records = Vec::new();
    for row in rows {
        let security_code = row.get("SECURITY_CODE").and_then(Value::as_str).unwrap_or("").trim();
        let secucode = row.get("SECUCODE").and_then(Value::as_str).unwrap_or("").trim();
        if security_code != code || secucode != expected {
            continue;
        }
        matched = true;
        if let Some(record) = parse_record(row) {
            records.push(record);
        }
    }
    if !matched {
        return Err("股东人数与股票代码不匹配".into());
    }
    records.sort_by(|left, right| {
        right
            .end_date
            .cmp(&left.end_date)
            .then_with(|| right.notice_date.cmp(&left.notice_date))
    });
    match records.into_iter().next() {
        Some(record) => Ok(HolderCountView {
            status: "ok",
            code,
            name: record.name,
            holders: Some(record.holders),
            end_date: Some(record.end_date),
            notice_date: record.notice_date,
            message: "最近一次披露，不是实时股东人数".into(),
        }),
        None => Ok(empty_view(&code, "暂无有效的股东人数披露")),
    }
}

fn parse_record(row: &Value) -> Option<HolderRecord> {
    let end_date = parse_disclosure_day(row.get("END_DATE")?)?;
    let holders = parse_holder_households(row.get("HOLDER_TOTAL_NUM")?)?;
    let name = row
        .get("SECURITY_NAME_ABBR")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    Some(HolderRecord {
        name,
        holders,
        end_date,
        notice_date: row.get("NOTICE_DATE").and_then(parse_disclosure_day),
    })
}

fn parse_holder_households(value: &Value) -> Option<u64> {
    let count = match value {
        Value::Number(number) => {
            if let Some(whole) = number.as_u64() {
                whole
            } else {
                let decimal = number.as_f64()?;
                if !decimal.is_finite() || decimal <= 0.0 || decimal.fract() != 0.0 {
                    return None;
                }
                decimal as u64
            }
        }
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() || trimmed.contains(['-', '.', '+']) {
                return None;
            }
            let digits: String = trimmed.chars().filter(|ch| ch.is_ascii_digit()).collect();
            if digits.is_empty() || digits.len() != trimmed.chars().filter(|ch| !ch.is_whitespace() && *ch != ',').count() {
                return None;
            }
            digits.parse().ok()?
        }
        _ => return None,
    };
    if (1..=100_000_000).contains(&count) {
        Some(count)
    } else {
        None
    }
}

fn parse_disclosure_day(value: &Value) -> Option<String> {
    let text = value.as_str()?.trim();
    let day = text.get(..10)?;
    let mut parts = day.split('-');
    let year: u16 = parts.next()?.parse().ok()?;
    let month: u8 = parts.next()?.parse().ok()?;
    let date: u8 = parts.next()?.parse().ok()?;
    if parts.next().is_some() || !(1990..=2100).contains(&year) || !(1..=12).contains(&month) {
        return None;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return None,
    };
    if !(1..=max_day).contains(&date) {
        return None;
    }
    Some(format!("{year:04}-{month:02}-{date:02}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_row(code: &str, suffix: &str, end: &str, notice: Option<&str>, holders: Value) -> Value {
        json!({
            "SECUCODE": format!("{code}.{suffix}"),
            "SECURITY_CODE": code,
            "SECURITY_NAME_ABBR": "样例股份",
            "END_DATE": end,
            "NOTICE_DATE": notice,
            "HOLDER_TOTAL_NUM": holders,
        })
    }

    #[test]
    fn latest_period_wins_even_when_it_is_not_first() {
        // 样例数据，不是真实股东户数。较新的统计截止日故意放在数组末尾。
        let rows = vec![
            sample_row("600000", "SH", "2024-03-31 00:00:00", Some("2024-04-25 00:00:00"), json!(11111)),
            sample_row("600000", "SH", "2024-06-30 00:00:00", Some("2024-08-20 00:00:00"), json!(22222)),
        ];
        let selected = select_latest("600000", &rows).unwrap();
        assert_eq!(selected.status, "ok");
        assert_eq!(selected.holders, Some(22222));
        assert_eq!(selected.end_date.as_deref(), Some("2024-06-30"));
        assert_eq!(selected.notice_date.as_deref(), Some("2024-08-20"));
    }

    #[test]
    fn same_period_uses_later_notice_date() {
        let rows = vec![
            sample_row("000001", "SZ", "2024-06-30 00:00:00", Some("2024-08-01 00:00:00"), json!(30000)),
            sample_row("000001", "SZ", "2024-06-30 00:00:00", Some("2024-08-18 00:00:00"), json!(31000)),
        ];
        let selected = select_latest("000001", &rows).unwrap();
        assert_eq!(selected.holders, Some(31000));
        assert_eq!(selected.notice_date.as_deref(), Some("2024-08-18"));
    }

    #[test]
    fn missing_period_is_not_replaced_by_another_clock() {
        let rows = vec![
            sample_row("300001", "SZ", "", Some("2024-08-18 00:00:00"), json!(40000)),
            json!({
                "SECUCODE": "300001.SZ",
                "SECURITY_CODE": "300001",
                "SECURITY_NAME_ABBR": "样例股份",
                "END_DATE": Value::Null,
                "NOTICE_DATE": "2024-10-01 00:00:00",
                "HOLDER_TOTAL_NUM": 50000,
            }),
        ];
        let selected = select_latest("300001", &rows).unwrap();
        assert_eq!(selected.status, "empty");
        assert_eq!(selected.holders, None);
        assert_eq!(selected.end_date, None);
    }

    #[test]
    fn invalid_counts_are_skipped_and_zero_is_not_kept() {
        let rows = vec![
            sample_row("600001", "SH", "2024-09-30 00:00:00", Some("2024-10-30 00:00:00"), json!(0)),
            sample_row("600001", "SH", "2024-06-30 00:00:00", Some("2024-08-10 00:00:00"), json!(-8)),
            sample_row("600001", "SH", "2024-03-31 00:00:00", Some("2024-04-20 00:00:00"), json!(12.5)),
            sample_row("600001", "SH", "2023-12-31 00:00:00", Some("2024-03-01 00:00:00"), json!("1,234")),
        ];
        let selected = select_latest("600001", &rows).unwrap();
        assert_eq!(selected.holders, Some(1234));
        assert_eq!(selected.end_date.as_deref(), Some("2023-12-31"));
    }

    #[test]
    fn market_suffix_must_match_the_code() {
        let rows = vec![sample_row("600519", "SZ", "2024-09-30 00:00:00", Some("2024-10-31 00:00:00"), json!(999))];
        assert!(select_latest("600519", &rows).unwrap_err().contains("不匹配"));
        let beijing = vec![sample_row("920027", "BJ", "2024-09-30 00:00:00", Some("2024-10-29 00:00:00"), json!(5568))];
        assert_eq!(select_latest("920027", &beijing).unwrap().holders, Some(5568));
        assert!(normalize_holder_code("111111").is_err());
        assert!(normalize_holder_code("600519.SH").is_err());
    }

    #[test]
    fn empty_source_message_is_not_a_transport_failure() {
        let payload = json!({"success": false, "message": "返回数据为空", "result": null});
        assert!(is_explicit_empty(&payload));
        let failed = json!({"success": false, "message": "服务异常", "result": null});
        assert!(!is_explicit_empty(&failed));
        assert!(source_failure(&failed).contains("服务异常"));
    }
}
