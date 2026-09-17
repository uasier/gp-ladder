use crate::types::{Snapshot, StockRow};
use serde_json::Value;
use std::fs;
use std::path::Path;

/// 读取 `{updated_at, rows}` 本地快照。
pub fn load_cache(path: &Path) -> Snapshot {
    if !path.is_file() {
        return Snapshot::empty();
    }
    let raw = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(_) => return Snapshot::empty(),
    };
    let value: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Snapshot::empty(),
    };
    from_cache_value(&value)
}

pub fn save_cache(path: &Path, rows: &[StockRow], updated_at: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建快照目录: {e}"))?;
    }
    let payload = serde_json::json!({
        "updated_at": updated_at,
        "rows": rows,
    });
    let raw = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw).map_err(|e| format!("写入快照失败: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("保存快照失败: {e}"))
}

#[allow(dead_code)]
pub fn from_engine_event(value: &Value) -> Snapshot {
    if value.get("rows").is_some() {
        return from_payload(value);
    }
    Snapshot::empty()
}

fn from_cache_value(value: &Value) -> Snapshot {
    from_payload(value)
}

fn from_payload(value: &Value) -> Snapshot {
    let rows = value
        .get("rows")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(row_from_value).collect())
        .unwrap_or_default();
    let updated_at = value
        .get("updated_at")
        .or_else(|| value.get("updatedAt"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    build_snapshot(rows, updated_at)
}

fn row_from_value(value: &Value) -> Option<StockRow> {
    let obj = value.as_object()?;
    let mut row = StockRow::new();
    for (key, val) in obj {
        row.insert(key.clone(), value_to_string(val));
    }
    Some(row)
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

pub fn build_snapshot(rows: Vec<StockRow>, updated_at: Option<String>) -> Snapshot {
    let mut max_days: i64 = 0;
    let mut industries = Vec::new();
    let mut quote_times = Vec::new();
    for row in &rows {
        let industry = row
            .get("所属行业")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("未知")
            .to_string();
        if !industries.iter().any(|item| item == &industry) {
            industries.push(industry);
        }
        if let Some(days) = row.get("连涨天数").and_then(|s| s.trim().parse::<i64>().ok()) {
            max_days = max_days.max(days);
        }
        if let Some(quote) = row.get("行情时间").map(|s| s.trim()).filter(|s| !s.is_empty()) {
            quote_times.push(quote.to_string());
        }
    }
    industries.sort();
    let quote_at = quote_times.into_iter().max();
    let count = rows.len();
    Snapshot {
        rows,
        updated_at,
        count,
        max_days,
        quote_at,
        industries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn missing_file_is_empty() {
        let snap = load_cache(Path::new("/no/such/gp-snapshot.json"));
        assert_eq!(snap.count, 0);
        assert!(snap.rows.is_empty());
    }

    #[test]
    fn reads_cache_and_computes_kpi() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("gp-snap-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("web_snapshot.json");
        fs::write(
            &path,
            r#"{"updated_at":"2026-09-11 12:00:00","rows":[{"股票代码":"000001","连涨天数":"3","所属行业":"银行","行情时间":"2026-09-11 11:00:00"}]}"#,
        )
        .unwrap();
        let snap = load_cache(&path);
        assert_eq!(snap.count, 1);
        assert_eq!(snap.max_days, 3);
        assert_eq!(snap.updated_at.as_deref(), Some("2026-09-11 12:00:00"));
        assert_eq!(snap.quote_at.as_deref(), Some("2026-09-11 11:00:00"));
        assert_eq!(snap.industries, vec!["银行".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn engine_snapshot_event_maps_rows() {
        let value = serde_json::json!({
            "type": "snapshot",
            "rows": [{"股票代码": "000002", "连涨天数": "5", "所属行业": "电子"}],
            "updated_at": "2026-09-12 09:00:00",
            "count": 1
        });
        let snap = from_engine_event(&value);
        assert_eq!(snap.count, 1);
        assert_eq!(snap.max_days, 5);
        assert_eq!(snap.rows[0]["股票代码"], "000002");
    }
}
