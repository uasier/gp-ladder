//! 本机自选池。只保存用户记录的日期、价格和原因，不改写行情快照。

use crate::applog;
use crate::quotes;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const MAX_ITEMS: usize = 500;
const PRICE_MIN: f64 = 0.01;
const PRICE_MAX: f64 = 100_000.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WatchItem {
    pub code: String,
    pub name: String,
    pub industry: String,
    pub added_date: String,
    pub added_price: f64,
    pub reason: String,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WatchlistFile {
    #[serde(default)]
    items: Vec<WatchItem>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistView {
    pub items: Vec<WatchItem>,
    pub count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddWatchInput {
    pub code: String,
    pub name: String,
    #[serde(default)]
    pub industry: String,
    #[serde(default)]
    pub added_date: String,
    pub added_price: Option<f64>,
    pub reason: String,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWatchInput {
    pub code: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub industry: Option<String>,
    #[serde(default)]
    pub added_date: Option<String>,
    #[serde(default)]
    pub added_price: Option<f64>,
    #[serde(default)]
    pub reason: Option<String>,
}

pub struct WatchlistStore {
    path: PathBuf,
    inner: Mutex<WatchlistFile>,
}

impl WatchlistStore {
    pub fn open(path: PathBuf) -> Self {
        let file = load_file(&path);
        Self {
            path,
            inner: Mutex::new(file),
        }
    }

    pub fn market_db_dir(&self) -> PathBuf {
        self.path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("market-db")
    }

    pub fn list(&self) -> Result<WatchlistView, String> {
        let file = self.lock()?;
        Ok(view(&file))
    }

    pub fn add(&self, input: AddWatchInput) -> Result<WatchlistView, String> {
        let item = build_new(input)?;
        let mut file = self.lock()?;
        if file.items.len() >= MAX_ITEMS {
            return Err(format!("自选池最多保存 {MAX_ITEMS} 只"));
        }
        if file.items.iter().any(|row| row.code == item.code) {
            return Err("已在自选池中".into());
        }
        applog::info(
            "watchlist",
            format!("已加入自选 {} {}", item.code, item.name),
        );
        let mut next = file.clone();
        next.items.insert(0, item);
        save_file(&self.path, &next)?;
        *file = next;
        Ok(view(&file))
    }

    pub fn update(&self, input: UpdateWatchInput) -> Result<WatchlistView, String> {
        let code = clean_code(&input.code)?;
        let mut file = self.lock()?;
        let Some(index) = file.items.iter().position(|row| row.code == code) else {
            return Err("不在自选池中".into());
        };
        let mut item = file.items[index].clone();
        if let Some(name) = input.name {
            item.name = clean_name(&name)?;
        }
        if let Some(industry) = input.industry {
            item.industry = clean_industry(&industry);
        }
        if let Some(date) = input.added_date {
            item.added_date = clean_date(&date)?;
        }
        if let Some(price) = input.added_price {
            item.added_price = clean_price(Some(price))?;
        }
        if let Some(reason) = input.reason {
            item.reason = clean_reason(&reason)?;
        }
        item.updated_at = now_stamp();
        applog::info("watchlist", format!("已更新自选 {}", item.code));
        let mut next = file.clone();
        next.items[index] = item;
        save_file(&self.path, &next)?;
        *file = next;
        Ok(view(&file))
    }

    pub fn remove(&self, code: &str) -> Result<WatchlistView, String> {
        let code = clean_code(code)?;
        let mut file = self.lock()?;
        let Some(index) = file.items.iter().position(|row| row.code == code) else {
            return Err("不在自选池中".into());
        };
        applog::info("watchlist", format!("已移出自选 {code}"));
        let mut next = file.clone();
        next.items.remove(index);
        save_file(&self.path, &next)?;
        *file = next;
        Ok(view(&file))
    }

    pub fn quote_targets(&self, requested: &[String]) -> Result<Vec<String>, String> {
        let file = self.lock()?;
        let stored: Vec<String> = file.items.iter().map(|item| item.code.clone()).collect();
        normalize_quote_codes(requested, &stored)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, WatchlistFile>, String> {
        self.inner
            .lock()
            .map_err(|err| format!("读取自选池失败: {err}"))
    }
}

pub fn normalize_quote_codes(requested: &[String], stored: &[String]) -> Result<Vec<String>, String> {
    if requested.is_empty() {
        return Ok(stored.to_vec());
    }
    if requested.len() > 50 {
        return Err("一次最多查询 50 只股票".into());
    }
    let mut codes = Vec::new();
    for code in requested {
        codes.push(clean_code(code)?);
    }
    codes.sort();
    codes.dedup();
    Ok(codes)
}

fn view(file: &WatchlistFile) -> WatchlistView {
    WatchlistView {
        count: file.items.len(),
        items: file.items.clone(),
    }
}

fn build_new(input: AddWatchInput) -> Result<WatchItem, String> {
    let now = now_stamp();
    let added_date = if input.added_date.trim().is_empty() {
        today_string()
    } else {
        input.added_date.clone()
    };
    Ok(WatchItem {
        code: clean_code(&input.code)?,
        name: clean_name(&input.name)?,
        industry: clean_industry(&input.industry),
        added_date: clean_date(&added_date)?,
        added_price: clean_price(input.added_price)?,
        reason: clean_reason(&input.reason)?,
        source: clean_source(&input.source)?,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn clean_code(value: &str) -> Result<String, String> {
    let code = value.trim().to_string();
    if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("股票代码需为 6 位数字".into());
    }
    if quotes::quote_secid(&code).is_none() {
        return Err("暂不支持该股票代码".into());
    }
    Ok(code)
}

fn clean_name(value: &str) -> Result<String, String> {
    let name = value.trim();
    let len = name.chars().count();
    if len == 0 {
        return Err("请填写股票简称".into());
    }
    if len > 32 {
        return Err("股票简称不能超过 32 字".into());
    }
    if name.chars().any(|ch| ch.is_control()) {
        return Err("股票简称包含无效字符".into());
    }
    Ok(name.to_string())
}

fn clean_industry(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|ch| !ch.is_control())
        .take(40)
        .collect()
}

fn clean_reason(value: &str) -> Result<String, String> {
    let reason = value.trim();
    let len = reason.chars().count();
    if len == 0 {
        return Err("请填写自选原因".into());
    }
    if len > 200 {
        return Err("自选原因不能超过 200 字".into());
    }
    if reason.chars().any(|ch| ch.is_control() && ch != '\n' && ch != '\t') {
        return Err("自选原因包含无效字符".into());
    }
    Ok(reason.to_string())
}

fn clean_source(value: &str) -> Result<String, String> {
    match value.trim() {
        "" | "manual" => Ok("manual".into()),
        "lxsz" | "zt" | "jjzt" => Ok(value.trim().to_string()),
        _ => Err("未知来源".into()),
    }
}

fn clean_date(value: &str) -> Result<String, String> {
    let text = value.trim();
    let date = NaiveDate::parse_from_str(text, "%Y-%m-%d").map_err(|_| "自选日期无效".to_string())?;
    let earliest = NaiveDate::from_ymd_opt(1990, 1, 1).expect("1990-01-01");
    if date < earliest {
        return Err("自选日期过早".into());
    }
    if date > today() {
        return Err("自选日期不能晚于今天".into());
    }
    Ok(date.format("%Y-%m-%d").to_string())
}

fn clean_price(value: Option<f64>) -> Result<f64, String> {
    let Some(price) = value else {
        return Err("请填写自选价格".into());
    };
    if !price.is_finite() || price < PRICE_MIN || price > PRICE_MAX {
        return Err("自选价格需为 0.01 到 100000 之间的数字".into());
    }
    Ok((price * 10_000.0).round() / 10_000.0)
}

fn today() -> NaiveDate {
    chrono::Local::now().date_naive()
}

fn today_string() -> String {
    today().format("%Y-%m-%d").to_string()
}

fn now_stamp() -> String {
    chrono::Local::now()
        .format("%Y-%m-%dT%H:%M:%S%.3f%:z")
        .to_string()
}

fn load_file(path: &Path) -> WatchlistFile {
    let Ok(raw) = fs::read_to_string(path) else {
        return WatchlistFile::default();
    };
    if raw.trim().is_empty() {
        return WatchlistFile::default();
    }
    let parsed = serde_json::from_str::<serde_json::Value>(&raw);
    let Ok(value) = parsed else {
        backup_corrupt(path);
        return WatchlistFile::default();
    };
    let Some(rows) = value.get("items").and_then(|item| item.as_array()) else {
        backup_corrupt(path);
        return WatchlistFile::default();
    };
    let mut items = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for row in rows {
        let Ok(item) = serde_json::from_value::<WatchItem>(row.clone()) else {
            continue;
        };
        if quotes::quote_secid(&item.code).is_none() || item.reason.trim().is_empty() || seen.contains(&item.code) {
            continue;
        }
        seen.insert(item.code.clone());
        items.push(item);
    }
    WatchlistFile { items }
}

fn backup_corrupt(path: &Path) {
    let bak = path.with_extension("json.bak");
    let _ = fs::remove_file(&bak);
    let _ = fs::rename(path, bak);
    applog::warn("watchlist", "自选池文件无法读取，已保留备份并重新开始");
}

fn save_file(path: &Path, file: &WatchlistFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| format!("无法创建自选目录: {err}"))?;
        }
    }
    let raw = serde_json::to_string_pretty(file).map_err(|err| format!("无法序列化自选池: {err}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, format!("{raw}\n")).map_err(|err| format!("无法写入自选池: {err}"))?;
    replace_file(&tmp, path).map_err(|err| format!("无法保存自选池: {err}"))
}

fn replace_file(tmp: &Path, path: &Path) -> std::io::Result<()> {
    match fs::rename(tmp, path) {
        Ok(()) => Ok(()),
        Err(err) => {
            if path.exists() {
                fs::remove_file(path)?;
                fs::rename(tmp, path)
            } else {
                Err(err)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn test_store() -> WatchlistStore {
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "gp-watch-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        WatchlistStore::open(dir.join("watchlist.json"))
    }

    fn sample() -> AddWatchInput {
        AddWatchInput {
            code: "600519".into(),
            name: " 贵州茅台 ".into(),
            industry: "白酒".into(),
            added_date: "2024-01-02".into(),
            added_price: Some(1688.5),
            reason: " 趋势跟随 ".into(),
            source: "lxsz".into(),
        }
    }

    #[test]
    fn add_update_remove_roundtrip() {
        let store = test_store();
        let added = store.add(sample()).unwrap();
        assert_eq!(added.count, 1);
        assert_eq!(added.items[0].code, "600519");
        assert_eq!(added.items[0].name, "贵州茅台");
        assert_eq!(added.items[0].added_date, "2024-01-02");
        assert!((added.items[0].added_price - 1688.5).abs() < 1e-9);
        assert_eq!(added.items[0].reason, "趋势跟随");
        assert_eq!(added.items[0].source, "lxsz");

        let err = store.add(sample()).unwrap_err();
        assert_eq!(err, "已在自选池中");
        assert_eq!(store.list().unwrap().count, 1);

        std::thread::sleep(std::time::Duration::from_millis(20));
        let created = added.items[0].created_at.clone();
        let updated = store
            .update(UpdateWatchInput {
                code: "600519".into(),
                name: None,
                industry: None,
                added_date: Some("2024-02-03".into()),
                added_price: Some(1700.0),
                reason: Some("回封确认".into()),
            })
            .unwrap();
        assert_eq!(updated.items[0].created_at, created);
        assert_eq!(updated.items[0].added_date, "2024-02-03");
        assert_eq!(updated.items[0].reason, "回封确认");
        assert!((updated.items[0].added_price - 1700.0).abs() < 1e-9);
        assert_ne!(updated.items[0].updated_at, created);

        let reopened = WatchlistStore::open(store.path.clone());
        assert_eq!(reopened.list().unwrap().items[0].reason, "回封确认");
        assert_eq!(store.remove("600519").unwrap().count, 0);
        assert_eq!(store.remove("600519").unwrap_err(), "不在自选池中");
    }

    #[test]
    fn rejects_invalid_records_and_keeps_file() {
        let store = test_store();
        store.add(sample()).unwrap();
        let bad_code = store.add(AddWatchInput {
            code: "111111".into(),
            ..sample()
        });
        assert_eq!(bad_code.unwrap_err(), "暂不支持该股票代码");
        let bad_reason = store.add(AddWatchInput {
            code: "000001".into(),
            name: "平安银行".into(),
            reason: "  ".into(),
            source: "manual".into(),
            ..sample()
        });
        assert_eq!(bad_reason.unwrap_err(), "请填写自选原因");
        let future = store.add(AddWatchInput {
            code: "300750".into(),
            name: "宁德时代".into(),
            added_date: "2099-01-01".into(),
            ..sample()
        });
        assert_eq!(future.unwrap_err(), "自选日期不能晚于今天");
        assert_eq!(store.list().unwrap().count, 1);
        assert!(normalize_quote_codes(&["600519".into(), "000001".into()], &[]).unwrap().len() == 2);
        assert!(normalize_quote_codes(&vec!["600519".into(); 51], &[]).is_err());
    }

    #[test]
    fn corrupt_file_is_backed_up() {
        let store = test_store();
        fs::write(&store.path, "{").unwrap();
        let reopened = WatchlistStore::open(store.path.clone());
        assert_eq!(reopened.list().unwrap().count, 0);
        assert!(store.path.with_extension("json.bak").is_file());
        assert!(!store.path.is_file());
    }

    #[test]
    fn drops_invalid_items_but_keeps_valid_ones() {
        let store = test_store();
        let raw = r#"{"items":[
            {"code":"600519","name":"贵州茅台","industry":"白酒","addedDate":"2024-01-02","addedPrice":1.0,"reason":"观察","source":"manual","createdAt":"2024-01-02T00:00:00.000+08:00","updatedAt":"2024-01-02T00:00:00.000+08:00"},
            {"code":"bad"},
            {"code":"600519","name":"重复","industry":"","addedDate":"2024-01-03","addedPrice":2.0,"reason":"重复","source":"manual","createdAt":"2024-01-03T00:00:00.000+08:00","updatedAt":"2024-01-03T00:00:00.000+08:00"}
        ]}"#;
        fs::write(&store.path, raw).unwrap();
        let reopened = WatchlistStore::open(store.path.clone());
        let view = reopened.list().unwrap();
        assert_eq!(view.count, 1);
        assert_eq!(view.items[0].name, "贵州茅台");
    }
}
