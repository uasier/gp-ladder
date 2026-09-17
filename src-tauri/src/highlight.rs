//! 精选规则。

use crate::format::to_optional_float;
use crate::types::StockRow;

pub const RETAIL_MAX: f64 = -5.0;
pub const TODAY_TURNOVER_MAX: f64 = 10.0;
pub const AVG_PCT_MIN: f64 = 1.0;

pub fn highlight_avg_pct(row: &StockRow) -> Option<f64> {
    if let Some(v) = row
        .get("平均涨幅/天")
        .and_then(|s| to_optional_float(s))
    {
        return Some(v);
    }
    let days = row
        .get("连涨天数")
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(0)
        .max(1) as f64;
    Some(to_optional_float(row.get("连续涨跌幅").map(String::as_str).unwrap_or("")).unwrap_or(0.0) / days)
}

pub fn is_highlight_stock(row: &StockRow) -> bool {
    let retail = match row.get("散户指数").and_then(|s| to_optional_float(s)) {
        Some(v) => v,
        None => return false,
    };
    if retail >= RETAIL_MAX {
        return false;
    }
    let today_turnover = match row.get("今日换手率").and_then(|s| to_optional_float(s)) {
        Some(v) => v,
        None => return false,
    };
    if today_turnover >= TODAY_TURNOVER_MAX {
        return false;
    }
    match highlight_avg_pct(row) {
        Some(avg) if avg > AVG_PCT_MIN => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn qualified() -> StockRow {
        let mut row = BTreeMap::new();
        row.insert("散户指数".into(), "-6.20%".into());
        row.insert("今日换手率".into(), "4.50%".into());
        row.insert("平均涨幅/天".into(), "3.00%".into());
        row
    }

    #[test]
    fn default_rule() {
        assert!(is_highlight_stock(&qualified()));
        let mut row = qualified();
        row.insert("散户指数".into(), "-5.00%".into());
        assert!(!is_highlight_stock(&row));
        let mut row = qualified();
        row.insert("今日换手率".into(), "10.00%".into());
        assert!(!is_highlight_stock(&row));
        let mut row = qualified();
        row.insert("平均涨幅/天".into(), "1.00%".into());
        assert!(!is_highlight_stock(&row));
    }
}
