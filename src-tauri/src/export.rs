//! 把内存快照写成 CSV / JSON / HTML，不再请求外部行情。

use crate::crawl::FIELDS;
use crate::format::format_optional_number;
use crate::highlight::{self, is_highlight_stock};
use crate::snapshot;
use crate::types::{ExportResult, Snapshot, StockRow};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const EXTRA_FIELDS: &[&str] = &[
    "平均涨幅/天",
    "平均换手/天",
    "现价",
    "今日涨跌幅",
    "今开",
    "今高",
    "今低",
    "今日换手率",
    "成交额",
    "行情时间",
    "市盈率",
    "散户指数",
    "散户净额",
    "连板天数",
    "封板资金",
    "首次封板",
    "最后封板",
    "炸板次数",
    "涨停统计",
    "流通市值",
    "今开涨幅",
    "实体涨幅",
    "昨日连板",
    "昨日封板",
];

const LADDER_TEMPLATE: &str = include_str!("../templates/ladder.html");

pub fn write_snapshot_file(
    snapshot: &Snapshot,
    output_path: &Path,
    fmt: &str,
) -> Result<ExportResult, String> {
    let fmt = fmt.trim().to_ascii_lowercase();
    if !matches!(fmt.as_str(), "csv" | "json" | "html") {
        return Err(format!("不支持的导出格式: {fmt}"));
    }
    if snapshot.rows.is_empty() {
        return Err("没有可导出的榜单，请先刷新".into());
    }
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建导出目录: {e}"))?;
    }
    match fmt.as_str() {
        "csv" => write_csv(&snapshot.rows, output_path)?,
        "json" => {
            let text = serde_json::to_string_pretty(&snapshot.rows).map_err(|e| e.to_string())?;
            fs::write(output_path, format!("{text}\n")).map_err(|e| format!("写入失败: {e}"))?;
        }
        _ => {
            let html = generate_html_content(snapshot);
            fs::write(output_path, html).map_err(|e| format!("写入失败: {e}"))?;
        }
    }
    let (selected_path, selected) = save_selected_stocks(&snapshot.rows, output_path)?;
    Ok(ExportResult {
        path: output_path.to_string_lossy().into_owned(),
        selected_path,
        count: snapshot.rows.len(),
        selected,
        format: fmt,
    })
}

fn write_csv(rows: &[StockRow], path: &Path) -> Result<(), String> {
    let mut fieldnames: Vec<&str> = FIELDS.to_vec();
    for extra in EXTRA_FIELDS {
        if rows.iter().any(|row| row.contains_key(*extra)) && !fieldnames.contains(extra) {
            fieldnames.push(extra);
        }
    }
    let mut out = String::from('\u{FEFF}');
    out.push_str(&fieldnames.join(","));
    out.push('\n');
    for row in rows {
        let line = fieldnames
            .iter()
            .map(|key| escape_csv(row.get(*key).map(String::as_str).unwrap_or("")))
            .collect::<Vec<_>>()
            .join(",");
        out.push_str(&line);
        out.push('\n');
    }
    fs::write(path, out).map_err(|e| format!("写入 CSV 失败: {e}"))
}

fn escape_csv(value: &str) -> String {
    if value.contains(['"', ',', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn save_selected_stocks(rows: &[StockRow], output_path: &Path) -> Result<(String, u32), String> {
    let mut selected: BTreeMap<String, String> = BTreeMap::new();
    for row in rows {
        if !is_highlight_stock(row) {
            continue;
        }
        let code = row.get("股票代码").map(|s| s.trim().to_string()).unwrap_or_default();
        if code.is_empty() {
            continue;
        }
        let name = row.get("股票简称").map(|s| s.trim().to_string()).unwrap_or_default();
        selected.entry(code.clone()).or_insert(format!("{code} {name}").trim().to_string());
    }
    let list: Vec<String> = selected.into_values().collect();
    let count = list.len() as u32;
    let selected_path = output_path.with_file_name(format!(
        "{}_selected.txt",
        output_path.file_stem().and_then(|s| s.to_str()).unwrap_or("out")
    ));
    let text = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(&selected_path, format!("{text}\n")).map_err(|e| format!("写入精选列表失败: {e}"))?;
    Ok((selected_path.to_string_lossy().into_owned(), count))
}

fn generate_html_content(snapshot: &Snapshot) -> String {
    let data_json = serde_json::to_string(&snapshot.rows).unwrap_or_else(|_| "[]".into());
    let industries_json =
        serde_json::to_string(&snapshot.industries).unwrap_or_else(|_| "[]".into());
    let refresh_time = snapshot
        .updated_at
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if snapshot.rows.is_empty() {
                "尚未刷新".into()
            } else {
                crate::format::now_stamp()
            }
        });
    let quote_at = snapshot.quote_at.clone().unwrap_or_else(|| "--".into());
    LADDER_TEMPLATE
        .replace("__TOTAL__", &snapshot.count.to_string())
        .replace("__MAX_DAYS__", &snapshot.max_days.to_string())
        .replace("__UPDATED_AT__", &refresh_time)
        .replace("__GENERATED_AT__", &refresh_time)
        .replace("__QUOTE_AT__", &quote_at)
        .replace("__DATA_JSON__", &data_json)
        .replace("__INDUSTRIES_JSON__", &industries_json)
        .replace("__RETAIL_MIN__", "")
        .replace("__RETAIL_MAX__", "")
        .replace(
            "__HL_RETAIL_MAX__",
            &format_optional_number(Some(highlight::RETAIL_MAX)),
        )
        .replace(
            "__HL_TODAY_TURN_MAX__",
            &format_optional_number(Some(highlight::TODAY_TURNOVER_MAX)),
        )
        .replace(
            "__HL_AVG_PCT_MIN__",
            &format_optional_number(Some(highlight::AVG_PCT_MIN)),
        )
}

pub fn export_from_cache(cache_path: &Path, format: &str, output_path: &Path) -> Result<ExportResult, String> {
    let snap = snapshot::load_cache(cache_path);
    write_snapshot_file(&snap, output_path, format)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn json_export_writes_rows_and_selected() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("gp-export-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        let mut row = StockRow::new();
        row.insert("股票代码".into(), "000001".into());
        row.insert("股票简称".into(), "平安银行".into());
        row.insert("连涨天数".into(), "3".into());
        row.insert("散户指数".into(), "-6.20%".into());
        row.insert("今日换手率".into(), "4.50%".into());
        row.insert("平均涨幅/天".into(), "3.00%".into());
        let snap = snapshot::build_snapshot(vec![row], Some("2026-09-11 12:00:00".into()));
        let out = dir.join("out.json");
        let result = write_snapshot_file(&snap, &out, "json").unwrap();
        assert_eq!(result.count, 1);
        assert_eq!(result.selected, 1);
        let text = fs::read_to_string(&out).unwrap();
        assert!(text.contains("000001"));
        assert!(Path::new(&result.selected_path).is_file());
        let _ = fs::remove_dir_all(&dir);
    }
}
