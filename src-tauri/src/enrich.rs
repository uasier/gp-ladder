//! 补充平均涨幅/换手，并叠加当日行情。

use crate::format::to_optional_float;
use crate::quotes;
use crate::types::StockRow;
use std::sync::atomic::{AtomicBool, Ordering};

pub fn annotate_with_averages(rows: &mut [StockRow]) {
    for row in rows.iter_mut() {
        let days = row
            .get("连涨天数")
            .and_then(|s| s.trim().parse::<i64>().ok())
            .unwrap_or(0)
            .max(1);
        let total_pct = to_optional_float(row.get("连续涨跌幅").map(String::as_str).unwrap_or(""))
            .unwrap_or(0.0);
        let total_turnover =
            to_optional_float(row.get("累计换手率").map(String::as_str).unwrap_or("")).unwrap_or(0.0);
        row.insert(
            "平均涨幅/天".into(),
            format!("{:.2}%", total_pct / days as f64),
        );
        row.insert(
            "平均换手/天".into(),
            format!("{:.2}%", total_turnover / days as f64),
        );
    }
}

pub fn enrich_output_rows(
    mut rows: Vec<StockRow>,
    cancel: Option<&AtomicBool>,
    on_progress: impl Fn(&str),
) -> Result<Vec<StockRow>, String> {
    if cancel.map(|c| c.load(Ordering::SeqCst)).unwrap_or(false) {
        return Err("已取消".into());
    }
    on_progress("正在计算均涨与均换手");
    annotate_with_averages(&mut rows);
    if cancel.map(|c| c.load(Ordering::SeqCst)).unwrap_or(false) {
        return Err("已取消".into());
    }
    quotes::annotate_with_live_quotes(&mut rows, cancel, on_progress)?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn averages_divide_by_days() {
        let mut row = BTreeMap::new();
        row.insert("连涨天数".into(), "3".into());
        row.insert("连续涨跌幅".into(), "9.00%".into());
        row.insert("累计换手率".into(), "15.00%".into());
        let mut rows = vec![row];
        annotate_with_averages(&mut rows);
        assert_eq!(rows[0]["平均涨幅/天"], "3.00%");
        assert_eq!(rows[0]["平均换手/天"], "5.00%");
    }
}
