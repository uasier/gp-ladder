//! 数值解析与展示格式化，行为对齐原 Python formatters。

use chrono::TimeZone;

pub fn to_optional_float(value: &str) -> Option<f64> {
    let text = value.trim().replace('%', "").replace(',', "");
    if text.is_empty() || matches!(text.as_str(), "-" | "--" | "None" | "null" | "NaN") {
        return None;
    }
    let number = text.parse::<f64>().ok()?;
    if number.is_nan() {
        None
    } else {
        Some(number)
    }
}

pub fn json_to_optional_float(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Null => None,
        serde_json::Value::Bool(_) => None,
        serde_json::Value::Number(n) => n.as_f64().filter(|v| !v.is_nan()),
        serde_json::Value::String(s) => to_optional_float(s),
        _ => None,
    }
}

/// 实体涨幅：(现价 − 今开) / 昨收。昨收缺失时用今开作分母。
pub fn body_gain_pct(price: Option<f64>, open: Option<f64>, prev_close: Option<f64>) -> Option<f64> {
    let price = price?;
    let open = open?;
    let denom = prev_close
        .filter(|v| v.abs() > f64::EPSILON)
        .unwrap_or(open);
    if denom.abs() <= f64::EPSILON {
        return None;
    }
    Some((price - open) / denom * 100.0)
}

pub fn format_signed_percent(value: Option<f64>) -> String {
    match value {
        Some(v) => format!("{v:.2}%"),
        None => String::new(),
    }
}

pub fn format_fund_amount(value: Option<f64>) -> String {
    let Some(v) = value else {
        return String::new();
    };
    if v.abs() >= 1e8 {
        format!("{:.2}亿", v / 1e8)
    } else {
        format!("{:.2}万", v / 1e4)
    }
}

pub fn format_price(value: Option<f64>) -> String {
    match value {
        Some(v) => format!("{v:.2}"),
        None => String::new(),
    }
}

pub fn format_quote_time(timestamp: Option<f64>) -> String {
    let Some(ts) = timestamp else {
        return String::new();
    };
    let secs = ts as i64;
    chrono::Local
        .timestamp_opt(secs, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_default()
}

pub fn format_optional_number(value: Option<f64>) -> String {
    let Some(number) = value else {
        return String::new();
    };
    if number.fract() == 0.0 {
        format!("{}", number as i64)
    } else {
        number.to_string()
    }
}

pub fn now_stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_float_parses_percent_and_placeholders() {
        assert_eq!(to_optional_float("-2.39%"), Some(-2.39));
        assert_eq!(to_optional_float("3.50%"), Some(3.5));
        assert_eq!(to_optional_float("-"), None);
        assert_eq!(to_optional_float("--"), None);
        assert_eq!(to_optional_float(""), None);
    }

    #[test]
    fn percent_and_amount_format() {
        assert_eq!(format_signed_percent(Some(-2.39)), "-2.39%");
        assert_eq!(format_signed_percent(None), "");
        assert_eq!(format_fund_amount(Some(-30486640.0)), "-3048.66万");
        assert_eq!(format_fund_amount(Some(1.2e8)), "1.20亿");
        assert_eq!(format_price(Some(18.48)), "18.48");
    }

    #[test]
    fn body_gain_uses_prev_close_as_base() {
        // 昨收 10，今开 10.30（高开 3%），现价 10.50 → 实体 (10.50-10.30)/10 = 2%
        let pct = body_gain_pct(Some(10.50), Some(10.30), Some(10.00)).unwrap();
        assert!((pct - 2.0).abs() < 1e-6);
        let no_prev = body_gain_pct(Some(10.50), Some(10.00), None).unwrap();
        assert!((no_prev - 5.0).abs() < 1e-6);
        assert_eq!(body_gain_pct(None, Some(10.0), Some(10.0)), None);
    }
}
