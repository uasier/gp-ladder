//! 把内存快照写成 CSV / JSON / HTML，不再请求外部行情。

use crate::crawl::FIELDS;
use crate::format::format_optional_number;
use crate::highlight::{self, is_highlight_stock};
use crate::snapshot;
use crate::types::{ExportResult, Snapshot, StockRow};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const EXTRA_FIELDS: &[&str] = &[
    "平均涨幅/天",
    "平均换手/天",
    "现价",
    "今日涨跌幅",
    "今开",
    "今高",
    "今低",
    "今日换手率",
    "量比",
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

/// 把前端本地生成的 xlsx 写入用户选择的路径，或移动端应用导出目录。
pub fn write_xlsx_export(base: &Path, path: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.len() < 4 || bytes.len() > 4_000_000 || &bytes[..4] != b"PK\x03\x04" {
        return Err("不是有效的 Excel 文件".into());
    }
    let dest = join_export_path(base, path)?;
    let name = dest
        .file_name()
        .and_then(|item| item.to_str())
        .unwrap_or("");
    if !name.to_ascii_lowercase().ends_with(".xlsx") {
        return Err("只能保存 .xlsx 文件".into());
    }
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| format!("无法创建导出目录: {err}"))?;
        }
    }
    fs::write(&dest, bytes).map_err(|err| format!("写入 Excel 失败: {err}"))?;
    Ok(dest)
}

pub fn decode_hex(input: &str) -> Result<Vec<u8>, String> {
    let raw = input.trim();
    if raw.is_empty() || raw.len() % 2 != 0 || raw.len() > 8_000_000 {
        return Err("导出内容无效".into());
    }
    let mut out = Vec::with_capacity(raw.len() / 2);
    let bytes = raw.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        let hi = hex_value(bytes[index])?;
        let lo = hex_value(bytes[index + 1])?;
        out.push((hi << 4) | lo);
        index += 2;
    }
    Ok(out)
}

fn hex_value(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err("导出内容无效".into()),
    }
}

/// 绝对路径原样使用；相对路径只取文件名并放到 `base`（应用文档目录）。
pub fn join_export_path(base: &Path, path: &str) -> Result<PathBuf, String> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err("导出路径为空".into());
    }
    let p = PathBuf::from(raw);
    if p.is_absolute() {
        return Ok(p);
    }
    let file = p
        .file_name()
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .ok_or_else(|| "导出文件名不合法".to_string())?;
    Ok(base.join(file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn exports_keep_volume_ratio_and_selected_stocks() {
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
        row.insert("量比".into(), "1.25".into());
        row.insert("平均涨幅/天".into(), "3.00%".into());
        let snap = snapshot::build_snapshot(vec![row], Some("2026-09-11 12:00:00".into()));
        let out = dir.join("out.json");
        let result = write_snapshot_file(&snap, &out, "json").unwrap();
        assert_eq!(result.count, 1);
        assert_eq!(result.selected, 1);
        let text = fs::read_to_string(&out).unwrap();
        assert!(text.contains("000001"));
        assert!(Path::new(&result.selected_path).is_file());
        let json_rows: Vec<StockRow> = serde_json::from_str(&text).unwrap();
        assert_eq!(json_rows[0]["量比"], "1.25");
        let csv_path = dir.join("out.csv");
        write_snapshot_file(&snap, &csv_path, "csv").unwrap();
        let csv = fs::read_to_string(csv_path).unwrap();
        let mut lines = csv.trim_start_matches('\u{FEFF}').lines();
        let ratio_column = lines.next().unwrap().split(',').position(|field| field == "量比").unwrap();
        assert_eq!(lines.next().unwrap().split(',').nth(ratio_column), Some("1.25"));
        let html_path = dir.join("out.html");
        write_snapshot_file(&snap, &html_path, "html").unwrap();
        let html = fs::read_to_string(html_path).unwrap();
        assert!(html.contains("\"量比\":\"1.25\""));
        assert!(!html.contains("__DATA_JSON__"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn relative_export_stays_under_base() {
        let base = PathBuf::from("/tmp/gp-docs");
        let dest = join_export_path(&base, "lxsz_rankings_20260101_120000.html").unwrap();
        assert_eq!(dest, base.join("lxsz_rankings_20260101_120000.html"));
        let sneak = join_export_path(&base, "../evil.html").unwrap();
        assert_eq!(sneak, base.join("evil.html"));
        assert!(join_export_path(&base, "").is_err());
        let abs = join_export_path(&base, "/tmp/out.html").unwrap();
        assert_eq!(abs, PathBuf::from("/tmp/out.html"));
    }

    #[test]
    fn xlsx_export_keeps_only_a_workbook_under_the_export_dir() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("gp-xlsx-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        let bytes = b"PK\x03\x04watch".to_vec();
        let saved = write_xlsx_export(&dir, "../gp-ladder_watch_20261123.xlsx", &bytes).unwrap();
        assert_eq!(saved, dir.join("gp-ladder_watch_20261123.xlsx"));
        assert_eq!(fs::read(&saved).unwrap(), bytes);
        assert!(write_xlsx_export(&dir, "notes.txt", &bytes).is_err());
        assert!(write_xlsx_export(&dir, "empty.xlsx", b"nope").is_err());
        assert!(decode_hex("zz").is_err());
        assert_eq!(decode_hex("504b").unwrap(), b"PK");
        let _ = fs::remove_dir_all(&dir);
    }
}
