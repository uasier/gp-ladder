use serde::Serialize;
use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const MEM_CAP: usize = 1500;
const ROTATE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub ts: i64,
    pub level: String,
    pub source: String,
    pub message: String,
}

pub type LogEmit = Arc<dyn Fn(&LogEntry) + Send + Sync>;

struct LogState {
    entries: VecDeque<LogEntry>,
    file: Option<File>,
    path: Option<PathBuf>,
    emit: Option<LogEmit>,
}

static STATE: OnceLock<Mutex<LogState>> = OnceLock::new();

fn state() -> &'static Mutex<LogState> {
    STATE.get_or_init(|| {
        Mutex::new(LogState {
            entries: VecDeque::new(),
            file: None,
            path: None,
            emit: None,
        })
    })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn format_line(entry: &LogEntry) -> String {
    format!(
        "{} {:<5} [{}] {}\n",
        format_ts(entry.ts),
        entry.level.to_uppercase(),
        entry.source,
        entry.message.replace('\n', " | ")
    )
}

fn format_ts(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let milli = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let tod = secs.rem_euclid(86_400) as i64;
    let h = tod / 3600;
    let m = (tod % 3600) / 60;
    let s = tod % 60;
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{milli:03}Z")
}

/// Unix 天数 → UTC 年月日（Howard Hinnant 算法）。
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

/// 将日志落到指定文件；可重复调用（Web 与桌面各自在启动时绑定一次）。
pub fn attach_path(path: PathBuf) {
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    rotate_if_needed(&path);
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok();

    if let Ok(mut g) = state().lock() {
        g.path = Some(path.clone());
        g.file = file;
        let pending: Vec<LogEntry> = g.entries.iter().cloned().collect();
        if let Some(f) = g.file.as_mut() {
            for entry in &pending {
                let _ = f.write_all(format_line(entry).as_bytes());
            }
            let _ = f.flush();
        }
    }
    info("app", format!("日志文件 {}", path.display()));
}

#[cfg_attr(not(feature = "desktop"), allow(dead_code))]
pub fn set_emitter(emit: LogEmit) {
    if let Ok(mut g) = state().lock() {
        g.emit = Some(emit);
    }
}

fn rotate_if_needed(path: &Path) {
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() >= ROTATE_BYTES {
            let bak = path.with_extension("log.1");
            let _ = fs::rename(path, bak);
        }
    }
}

pub fn log(level: &str, source: &str, message: impl Into<String>) {
    let entry = LogEntry {
        ts: now_ms(),
        level: level.to_string(),
        source: source.to_string(),
        message: message.into(),
    };
    let mut emit: Option<LogEmit> = None;
    if let Ok(mut g) = state().lock() {
        if let Some(f) = g.file.as_mut() {
            let _ = f.write_all(format_line(&entry).as_bytes());
            // 每次 flush 在 Windows 上是同步落盘，git 调试日志会把点击打卡
            if entry.level == "error" || entry.level == "warn" {
                let _ = f.flush();
            }
        }
        g.entries.push_back(entry.clone());
        while g.entries.len() > MEM_CAP {
            g.entries.pop_front();
        }
        if entry.level != "debug" {
            emit = g.emit.clone();
        }
    }
    if let Some(emit) = emit {
        emit(&entry);
    }
}

pub fn info(source: &str, message: impl Into<String>) {
    log("info", source, message);
}

pub fn warn(source: &str, message: impl Into<String>) {
    log("warn", source, message);
}

pub fn error(source: &str, message: impl Into<String>) {
    log("error", source, message);
}

#[allow(dead_code)]
pub fn debug(source: &str, message: impl Into<String>) {
    log("debug", source, message);
}

pub fn snapshot(limit: usize) -> Vec<LogEntry> {
    let n = limit.clamp(1, MEM_CAP);
    match state().lock() {
        Ok(g) => g.entries.iter().rev().take(n).cloned().collect::<Vec<_>>().into_iter().rev().collect(),
        Err(_) => Vec::new(),
    }
}

pub fn log_path() -> Option<PathBuf> {
    state().lock().ok().and_then(|g| g.path.clone())
}

#[cfg(test)]
mod tests {
    use super::civil_from_days;

    #[test]
    fn unix_epoch_is_1970_01_01() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
    }
}
