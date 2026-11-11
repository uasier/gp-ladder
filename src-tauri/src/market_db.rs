//! 本地日行情库。连涨天梯和涨停连板都从这里的收盘价计算。

use crate::daily_quotes::{self, DailyQuote, DailyQuotes};
use crate::format::{format_price, format_signed_percent};
use crate::types::StockRow;
use chrono::{Datelike, Duration, FixedOffset, NaiveDate, TimeZone, Utc, Weekday};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

const LOOKBACK_CALENDAR_DAYS: i64 = 45;
const REFRESH_RECENT: usize = 2;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct DayFile {
    date: String,
    #[serde(default)]
    source: String,
    rows: Vec<StoredBar>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct StoredBar {
    code: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    industry: String,
    close: f64,
    #[serde(default)]
    high: Option<f64>,
    #[serde(default)]
    low: Option<f64>,
    #[serde(default)]
    prev_close: Option<f64>,
    #[serde(default)]
    change_pct: Option<f64>,
    #[serde(default)]
    turnover: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct HolidayFile {
    dates: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct LivePoint {
    pub code: String,
    pub name: String,
    pub date: String,
    pub close: f64,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub prev_close: Option<f64>,
    pub change_pct: Option<f64>,
    pub turnover: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LocalMove {
    pub rise_days: i64,
    pub rise_pct: f64,
    pub rise_turnover: Option<f64>,
    pub limit_days: i64,
    pub limit_pct: f64,
    pub limit_turnover: Option<f64>,
    pub limit_stat: String,
    pub industry: String,
}

pub fn trade_date_from_quote(quote_at: &str) -> String {
    let text = quote_at.trim();
    if text.len() >= 10 && is_iso_date(&text[..10]) {
        return text[..10].to_string();
    }
    shanghai_today().format("%Y-%m-%d").to_string()
}

/// 只读已有行情库，并把当日行情接在后面。不联网补历史。
pub fn moves_for_codes(dir: &Path, live: &[LivePoint]) -> HashMap<String, LocalMove> {
    let mut days = if dir.is_dir() {
        load_days(dir, &lookback_dates(shanghai_today()))
    } else {
        Vec::new()
    };
    for point in live {
        if !is_iso_date(&point.date) || point.close <= 0.0 {
            continue;
        }
        let bar = StoredBar {
            code: point.code.clone(),
            name: point.name.clone(),
            industry: String::new(),
            close: point.close,
            high: point.high,
            low: point.low,
            prev_close: point.prev_close,
            change_pct: point.change_pct,
            turnover: point.turnover,
        };
        if let Some(day) = days.iter_mut().find(|day| day.date == point.date) {
            if let Some(existing) = day.rows.iter_mut().find(|row| row.code == point.code) {
                if existing.name.is_empty() {
                    existing.name = bar.name.clone();
                }
                existing.close = bar.close;
                existing.high = bar.high.or(existing.high);
                existing.low = bar.low.or(existing.low);
                existing.prev_close = bar.prev_close.or(existing.prev_close);
                existing.change_pct = bar.change_pct.or(existing.change_pct);
                existing.turnover = bar.turnover.or(existing.turnover);
            } else {
                day.rows.push(bar);
            }
        } else {
            days.push(DayFile {
                date: point.date.clone(),
                source: "live".into(),
                rows: vec![bar],
            });
        }
    }
    days.sort_by(|left, right| left.date.cmp(&right.date));
    let calendar: Vec<String> = days.iter().map(|day| day.date.clone()).collect();
    let mut by_code: HashMap<String, Vec<(String, StoredBar)>> = HashMap::new();
    for day in &days {
        for bar in &day.rows {
            by_code
                .entry(bar.code.clone())
                .or_default()
                .push((day.date.clone(), bar.clone()));
        }
    }
    let wanted: HashSet<String> = live.iter().map(|point| point.code.clone()).collect();
    let mut out = HashMap::new();
    for (code, mut bars) in by_code {
        if !wanted.is_empty() && !wanted.contains(&code) {
            continue;
        }
        bars.sort_by(|left, right| left.0.cmp(&right.0));
        bars.dedup_by(|left, right| left.0 == right.0);
        if let Some(item) = move_of(&bars, &calendar) {
            out.insert(code, item);
        }
    }
    out
}

fn move_of(bars: &[(String, StoredBar)], calendar: &[String]) -> Option<LocalMove> {
    let series: Vec<StoredBar> = bars.iter().map(|(_, bar)| bar.clone()).collect();
    let streak = streak_of(bars.last()?.1.code.as_str(), &series);
    let limit_days = consecutive_limits(bars, calendar) as i64;
    let hits = bars
        .iter()
        .enumerate()
        .filter(|(index, (_, bar))| is_limit_up(bar, previous_trading_close(bars, *index, calendar)))
        .count();
    let (limit_pct, limit_turnover) = if limit_days > 0 {
        let start = series.len() - limit_days as usize;
        (
            cumulative_pct(&series, start).unwrap_or(0.0),
            sum_turnover(&series[start..]),
        )
    } else {
        (0.0, None)
    };
    let industry = bars
        .iter()
        .rev()
        .find_map(|(_, bar)| {
            let industry = bar.industry.trim();
            (!industry.is_empty()).then(|| industry.to_string())
        })
        .unwrap_or_default();
    Some(LocalMove {
        rise_days: streak.as_ref().map(|item| item.days).unwrap_or(0),
        rise_pct: streak.as_ref().map(|item| item.pct).unwrap_or(0.0),
        rise_turnover: streak.and_then(|item| item.turnover),
        limit_days,
        limit_pct,
        limit_turnover,
        limit_stat: if hits == 0 {
            String::new()
        } else {
            format!("{}天{hits}板", bars.len())
        },
        industry,
    })
}

fn sum_turnover(bars: &[StoredBar]) -> Option<f64> {
    let values: Vec<f64> = bars.iter().filter_map(|bar| bar.turnover).collect();
    if values.is_empty() {
        None
    } else {
        Some(values.into_iter().sum())
    }
}

pub fn db_dir_near(cache_file: &Path) -> PathBuf {
    cache_file
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("market-db")
}

pub fn build_ladder(
    dir: &Path,
    max_dates: u32,
    cancel: &AtomicBool,
    on_progress: impl Fn(&str),
) -> Result<Vec<StockRow>, String> {
    let days = prepare_days(dir, max_dates, cancel, &on_progress)?;
    on_progress(&format!("正在根据 {} 个交易日计算连涨", days.len()));
    let rows = ladder_from_days(&days);
    if rows.is_empty() {
        return Err("本地行情里暂无连涨股票".into());
    }
    on_progress(&format!("连涨 {} 只", rows.len()));
    Ok(rows)
}

pub fn build_limit_up(
    dir: &Path,
    max_dates: u32,
    cancel: &AtomicBool,
    on_progress: impl Fn(&str),
) -> Result<Vec<StockRow>, String> {
    let days = prepare_days(dir, max_dates, cancel, &on_progress)?;
    on_progress(&format!("正在根据 {} 个交易日计算涨停连板", days.len()));
    let rows = limit_up_from_days(&days);
    if rows.is_empty() {
        return Err("本地行情里暂无涨停股票".into());
    }
    on_progress(&format!("涨停 {} 只", rows.len()));
    Ok(rows)
}

fn prepare_days(
    dir: &Path,
    max_dates: u32,
    cancel: &AtomicBool,
    on_progress: impl Fn(&str),
) -> Result<Vec<DayFile>, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("已取消".into());
    }
    fs::create_dir_all(dir).map_err(|err| format!("无法创建行情库: {err}"))?;
    let today = shanghai_today();
    let today_text = today.format("%Y-%m-%d").to_string();
    let candidates = lookback_dates(today);
    let holidays = load_holidays(dir);
    let stored = stored_dates(dir);
    let plan = dates_to_sync(&candidates, &stored, &holidays, max_dates);
    on_progress(&format!(
        "行情库已有 {} 个交易日，本次补齐 {} 天",
        stored.len(),
        plan.len()
    ));

    let mut last_error = None;
    for (index, date) in plan.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Err("已取消".into());
        }
        on_progress(&format!(
            "正在补齐 {date} 行情 {}/{}",
            index + 1,
            plan.len()
        ));
        match daily_quotes::fetch_daily_closes(date) {
            Ok(quotes) => {
                if quotes.rows.is_empty() {
                    continue;
                }
                save_day(dir, &day_from_quotes(&quotes))?;
            }
            Err(err) if is_closed_day(&err) && date.as_str() < today_text.as_str() => {
                remember_holiday(dir, date)?;
            }
            Err(err) => {
                on_progress(&format!("{date} 行情未更新: {err}"));
                last_error = Some(err);
            }
        }
    }

    if cancel.load(Ordering::SeqCst) {
        return Err("已取消".into());
    }
    let days = load_days(dir, &candidates);
    if days.is_empty() {
        return Err(last_error.unwrap_or_else(|| "本地还没有可用行情".into()));
    }
    Ok(days)
}

fn lookback_dates(today: NaiveDate) -> Vec<String> {
    let mut dates = Vec::new();
    for offset in 0..=LOOKBACK_CALENDAR_DAYS {
        let date = today - Duration::days(offset);
        if matches!(date.weekday(), Weekday::Sat | Weekday::Sun) {
            continue;
        }
        dates.push(date.format("%Y-%m-%d").to_string());
    }
    dates
}

fn dates_to_sync(
    candidates: &[String],
    stored: &HashSet<String>,
    holidays: &HashSet<String>,
    max_dates: u32,
) -> Vec<String> {
    let mut plan = Vec::new();
    for date in candidates.iter().filter(|date| !holidays.contains(date.as_str())).take(REFRESH_RECENT) {
        plan.push(date.clone());
    }
    for date in candidates {
        if holidays.contains(date) || stored.contains(date) || plan.iter().any(|item| item == date) {
            continue;
        }
        plan.push(date.clone());
    }
    if max_dates > 0 {
        plan.truncate(max_dates as usize);
    }
    plan
}

fn shanghai_today() -> NaiveDate {
    let offset = FixedOffset::east_opt(8 * 3600).unwrap_or(FixedOffset::east_opt(0).unwrap());
    offset
        .from_utc_datetime(&Utc::now().naive_utc())
        .date_naive()
}

fn is_closed_day(err: &str) -> bool {
    err.contains("不是交易日")
}

fn day_from_quotes(quotes: &DailyQuotes) -> DayFile {
    let mut rows = quotes.rows.iter().filter_map(stored_from_quote).collect::<Vec<_>>();
    rows.sort_by(|left, right| left.code.cmp(&right.code));
    DayFile {
        date: quotes.date.clone(),
        source: quotes.source.clone(),
        rows,
    }
}

fn stored_from_quote(quote: &DailyQuote) -> Option<StoredBar> {
    let close = quote.close?;
    if !close.is_finite() || close <= 0.0 {
        return None;
    }
    Some(StoredBar {
        code: quote.code.clone(),
        name: quote.name.clone(),
        industry: quote.industry.clone(),
        close,
        high: quote.high.filter(|value| value.is_finite() && *value > 0.0),
        low: quote.low.filter(|value| value.is_finite() && *value > 0.0),
        prev_close: quote.prev_close.filter(|value| value.is_finite() && *value > 0.0),
        change_pct: quote.change_pct.filter(|value| value.is_finite()),
        turnover: quote.turnover.filter(|value| value.is_finite() && *value >= 0.0),
    })
}

fn save_day(dir: &Path, day: &DayFile) -> Result<(), String> {
    if day.rows.is_empty() {
        return Ok(());
    }
    write_json(&dir.join(format!("{}.json", day.date)), day)
}

fn load_days(dir: &Path, candidates: &[String]) -> Vec<DayFile> {
    let mut days = Vec::new();
    for date in candidates {
        let Some(day) = read_json::<DayFile>(&dir.join(format!("{date}.json"))) else {
            continue;
        };
        if day.date == *date && !day.rows.is_empty() {
            days.push(day);
        }
    }
    days.sort_by(|left, right| left.date.cmp(&right.date));
    days
}

fn stored_dates(dir: &Path) -> HashSet<String> {
    let mut dates = HashSet::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return dates;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(date) = name.strip_suffix(".json") else {
            continue;
        };
        if is_iso_date(date) {
            dates.insert(date.to_string());
        }
    }
    dates
}

fn is_iso_date(text: &str) -> bool {
    let mut parts = text.split('-');
    matches!(
        (parts.next(), parts.next(), parts.next(), parts.next()),
        (Some(year), Some(month), Some(day), None)
            if year.len() == 4 && month.len() == 2 && day.len() == 2
    )
}

fn holiday_path(dir: &Path) -> PathBuf {
    dir.join("holidays.json")
}

fn load_holidays(dir: &Path) -> HashSet<String> {
    read_json::<HolidayFile>(&holiday_path(dir))
        .map(|file| file.dates.into_iter().collect())
        .unwrap_or_default()
}

fn remember_holiday(dir: &Path, date: &str) -> Result<(), String> {
    let mut dates = load_holidays(dir);
    dates.insert(date.to_string());
    let mut list: Vec<_> = dates.into_iter().collect();
    list.sort();
    write_json(&holiday_path(dir), &HolidayFile { dates: list })
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("无法创建行情库: {err}"))?;
    }
    let raw = serde_json::to_string(value).map_err(|err| format!("无法序列化行情: {err}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw).map_err(|err| format!("写入行情库失败: {err}"))?;
    fs::rename(&tmp, path).map_err(|err| format!("保存行情库失败: {err}"))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn ladder_from_days(days: &[DayFile]) -> Vec<StockRow> {
    let mut by_code: HashMap<String, Vec<(String, StoredBar)>> = HashMap::new();
    for day in days {
        for bar in &day.rows {
            by_code.entry(bar.code.clone()).or_default().push((day.date.clone(), bar.clone()));
        }
    }
    let mut ranked = Vec::new();
    for (code, mut bars) in by_code {
        bars.sort_by(|left, right| left.0.cmp(&right.0));
        bars.dedup_by(|left, right| left.0 == right.0);
        let series: Vec<StoredBar> = bars.into_iter().map(|(_, bar)| bar).collect();
        if let Some(streak) = streak_of(&code, &series) {
            ranked.push(streak);
        }
    }
    ranked.sort_by(|left, right| {
        right
            .days
            .cmp(&left.days)
            .then_with(|| right.pct.partial_cmp(&left.pct).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| left.code.cmp(&right.code))
    });
    ranked
        .into_iter()
        .enumerate()
        .map(|(index, streak)| streak.into_row(index + 1))
        .collect()
}

struct Streak {
    code: String,
    name: String,
    industry: String,
    days: i64,
    pct: f64,
    turnover: Option<f64>,
    close: f64,
    high: Option<f64>,
    low: Option<f64>,
}

fn streak_of(code: &str, bars: &[StoredBar]) -> Option<Streak> {
    if bars.is_empty() {
        return None;
    }
    let mut length = 0usize;
    for index in (0..bars.len()).rev() {
        let previous = if index > 0 { Some(bars[index - 1].close) } else { None };
        if !is_up(&bars[index], previous) {
            break;
        }
        length += 1;
    }
    if length == 0 {
        return None;
    }
    let start = bars.len() - length;
    let last = bars.last()?;
    let pct = cumulative_pct(bars, start)?;
    let turnover_values: Vec<f64> = bars[start..].iter().filter_map(|bar| bar.turnover).collect();
    let turnover = if turnover_values.is_empty() {
        None
    } else {
        Some(turnover_values.iter().sum())
    };
    let name = bars.iter().rev().find_map(|bar| {
        let name = bar.name.trim();
        (!name.is_empty()).then(|| name.to_string())
    })?;
    let industry = bars
        .iter()
        .rev()
        .find_map(|bar| {
            let industry = bar.industry.trim();
            (!industry.is_empty()).then(|| industry.to_string())
        })
        .unwrap_or_default();
    Some(Streak {
        code: code.to_string(),
        name,
        industry,
        days: length as i64,
        pct,
        turnover,
        close: last.close,
        high: last.high,
        low: last.low,
    })
}

fn is_up(bar: &StoredBar, previous_close: Option<f64>) -> bool {
    if let Some(prev) = bar.prev_close.or(previous_close) {
        if prev > 0.0 {
            return cents(bar.close) > cents(prev);
        }
    }
    bar.change_pct.unwrap_or(0.0) > 0.0
}

fn cents(value: f64) -> i64 {
    (value * 100.0).round() as i64
}

fn cumulative_pct(bars: &[StoredBar], start: usize) -> Option<f64> {
    let last = bars.last()?;
    let base = bars
        .get(start)
        .and_then(|bar| bar.prev_close)
        .or_else(|| if start > 0 { Some(bars[start - 1].close) } else { None });
    if let Some(base) = base.filter(|value| *value > 0.0) {
        return Some((last.close - base) / base * 100.0);
    }
    let mut factor = 1.0;
    let mut any = false;
    for bar in &bars[start..] {
        if let Some(pct) = bar.change_pct {
            factor *= 1.0 + pct / 100.0;
            any = true;
        }
    }
    any.then_some((factor - 1.0) * 100.0)
}

impl Streak {
    fn into_row(self, index: usize) -> StockRow {
        let mut row = StockRow::new();
        row.insert("序号".into(), index.to_string());
        row.insert("股票代码".into(), self.code);
        row.insert("股票简称".into(), self.name);
        row.insert("收盘价(元)".into(), format_price(Some(self.close)));
        row.insert("最高价(元)".into(), format_price(self.high));
        row.insert("最低价(元)".into(), format_price(self.low));
        row.insert("连涨天数".into(), self.days.to_string());
        row.insert("连续涨跌幅".into(), format_signed_percent(Some(self.pct)));
        row.insert(
            "累计换手率".into(),
            self.turnover.map(|value| format!("{value:.2}%")).unwrap_or_default(),
        );
        row.insert("所属行业".into(), self.industry);
        row
    }
}

fn limit_up_from_days(days: &[DayFile]) -> Vec<StockRow> {
    let calendar: Vec<String> = days.iter().map(|day| day.date.clone()).collect();
    let Some(as_of) = calendar.last().cloned() else {
        return Vec::new();
    };
    let mut by_code: HashMap<String, Vec<(String, StoredBar)>> = HashMap::new();
    for day in days {
        for bar in &day.rows {
            by_code
                .entry(bar.code.clone())
                .or_default()
                .push((day.date.clone(), bar.clone()));
        }
    }
    let mut ranked = Vec::new();
    for (code, mut bars) in by_code {
        bars.sort_by(|left, right| left.0.cmp(&right.0));
        bars.dedup_by(|left, right| left.0 == right.0);
        if bars.last().map(|(date, _)| date.as_str()) != Some(as_of.as_str()) {
            continue;
        }
        if let Some(board) = limit_board_of(&code, &bars, &calendar) {
            ranked.push(board);
        }
    }
    ranked.sort_by(|left, right| {
        right
            .days
            .cmp(&left.days)
            .then_with(|| right.pct.partial_cmp(&left.pct).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| left.code.cmp(&right.code))
    });
    ranked
        .into_iter()
        .enumerate()
        .map(|(index, board)| board.into_row(index + 1))
        .collect()
}

struct LimitBoard {
    code: String,
    name: String,
    industry: String,
    days: i64,
    pct: f64,
    today_pct: Option<f64>,
    turnover: Option<f64>,
    today_turnover: Option<f64>,
    close: f64,
    high: Option<f64>,
    low: Option<f64>,
    stat: String,
}

fn limit_board_of(code: &str, bars: &[(String, StoredBar)], calendar: &[String]) -> Option<LimitBoard> {
    let length = consecutive_limits(bars, calendar);
    if length == 0 {
        return None;
    }
    let start = bars.len() - length;
    let series: Vec<StoredBar> = bars.iter().map(|(_, bar)| bar.clone()).collect();
    let last = series.last()?;
    let pct = cumulative_pct(&series, start)?;
    let turnover_values: Vec<f64> = series[start..].iter().filter_map(|bar| bar.turnover).collect();
    let turnover = if turnover_values.is_empty() {
        None
    } else {
        Some(turnover_values.iter().sum())
    };
    let name = bars.iter().rev().find_map(|(_, bar)| {
        let name = bar.name.trim();
        (!name.is_empty()).then(|| name.to_string())
    })?;
    let industry = bars
        .iter()
        .rev()
        .find_map(|(_, bar)| {
            let industry = bar.industry.trim();
            (!industry.is_empty()).then(|| industry.to_string())
        })
        .unwrap_or_default();
    let hits = bars
        .iter()
        .enumerate()
        .filter(|(index, (_, bar))| is_limit_up(bar, previous_trading_close(bars, *index, calendar)))
        .count();
    Some(LimitBoard {
        code: code.to_string(),
        name,
        industry,
        days: length as i64,
        pct,
        today_pct: last.change_pct,
        turnover,
        today_turnover: last.turnover,
        close: last.close,
        high: last.high,
        low: last.low,
        stat: format!("{}天{hits}板", bars.len()),
    })
}

fn consecutive_limits(bars: &[(String, StoredBar)], calendar: &[String]) -> usize {
    let mut length = 0usize;
    for index in (0..bars.len()).rev() {
        if length > 0 {
            let newer = &bars[index + 1].0;
            if previous_calendar_date(calendar, newer).as_deref() != Some(bars[index].0.as_str()) {
                break;
            }
        }
        let previous = previous_trading_close(bars, index, calendar);
        if !is_limit_up(&bars[index].1, previous) {
            break;
        }
        length += 1;
    }
    length
}

fn previous_calendar_date(calendar: &[String], date: &str) -> Option<String> {
    let index = calendar.iter().position(|item| item == date)?;
    if index == 0 {
        None
    } else {
        Some(calendar[index - 1].clone())
    }
}

fn previous_trading_close(bars: &[(String, StoredBar)], index: usize, calendar: &[String]) -> Option<f64> {
    if index == 0 {
        return None;
    }
    let expected = previous_calendar_date(calendar, &bars[index].0)?;
    if bars[index - 1].0 == expected {
        Some(bars[index - 1].1.close)
    } else {
        None
    }
}

fn is_limit_up(bar: &StoredBar, previous_close: Option<f64>) -> bool {
    let rate = limit_rate(&bar.code, &bar.name);
    if let Some(prev) = bar.prev_close.or(previous_close).filter(|value| *value > 0.0) {
        let limit = (prev * (1.0 + rate) * 100.0).round() as i64;
        return cents(bar.close) == limit;
    }
    match bar.change_pct {
        Some(pct) => {
            let target = rate * 100.0;
            pct + 0.2 >= target && pct <= target + 1.5
        }
        None => false,
    }
}

fn limit_rate(code: &str, name: &str) -> f64 {
    let code = code.trim();
    if code.starts_with("300") || code.starts_with("301") || code.starts_with("688") || code.starts_with("689") {
        return 0.20;
    }
    if code.starts_with('8') || code.starts_with('4') || code.starts_with("92") {
        return 0.30;
    }
    if name.to_ascii_uppercase().contains("ST") {
        return 0.05;
    }
    0.10
}

impl LimitBoard {
    fn into_row(self, index: usize) -> StockRow {
        let mut row = StockRow::new();
        row.insert("序号".into(), index.to_string());
        row.insert("股票代码".into(), self.code);
        row.insert("股票简称".into(), self.name);
        row.insert("收盘价(元)".into(), format_price(Some(self.close)));
        row.insert("最高价(元)".into(), format_price(self.high));
        row.insert("最低价(元)".into(), format_price(self.low));
        row.insert("现价".into(), format_price(Some(self.close)));
        row.insert("连涨天数".into(), self.days.to_string());
        row.insert("连板天数".into(), self.days.to_string());
        row.insert("连续涨跌幅".into(), format_signed_percent(Some(self.pct)));
        row.insert("今日涨跌幅".into(), format_signed_percent(self.today_pct));
        row.insert(
            "今日换手率".into(),
            self.today_turnover.map(|value| format!("{value:.2}%")).unwrap_or_default(),
        );
        row.insert(
            "累计换手率".into(),
            self.turnover.map(|value| format!("{value:.2}%")).unwrap_or_default(),
        );
        row.insert("所属行业".into(), self.industry);
        row.insert("涨停统计".into(), self.stat);
        row
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bar(code: &str, close: f64, prev: f64, turnover: Option<f64>) -> StoredBar {
        StoredBar {
            code: code.into(),
            name: "样例".into(),
            industry: "银行".into(),
            close,
            high: Some(close + 0.1),
            low: Some(close - 0.1),
            prev_close: Some(prev),
            change_pct: Some((close - prev) / prev * 100.0),
            turnover,
        }
    }

    fn day(date: &str, rows: Vec<StoredBar>) -> DayFile {
        DayFile {
            date: date.into(),
            source: "test".into(),
            rows,
        }
    }

    #[test]
    fn streak_counts_only_unbroken_up_days_and_sums_turnover() {
        let days = vec![
            day("2026-11-06", vec![bar("000001", 10.0, 9.0, Some(1.0)), bar("000002", 8.0, 9.0, Some(1.0))]),
            day("2026-11-07", vec![bar("000001", 11.0, 10.0, Some(2.5)), bar("000002", 8.5, 8.0, Some(0.4))]),
            day("2026-11-10", vec![bar("000001", 12.1, 11.0, Some(3.0)), bar("000002", 8.4, 8.5, Some(9.0))]),
        ];
        let rows = ladder_from_days(&days);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["股票代码"], "000001");
        assert_eq!(rows[0]["连涨天数"], "3");
        assert_eq!(rows[0]["连续涨跌幅"], "34.44%");
        assert_eq!(rows[0]["累计换手率"], "6.50%");
        assert_eq!(rows[0]["收盘价(元)"], "12.10");
        assert_eq!(rows[0]["所属行业"], "银行");
        assert_eq!(rows[0]["序号"], "1");
    }

    #[test]
    fn down_day_breaks_streak_and_flat_close_is_not_up() {
        let days = vec![
            day("2026-11-06", vec![bar("000001", 11.0, 10.0, Some(1.0))]),
            day("2026-11-07", vec![bar("000001", 10.0, 11.0, Some(8.0))]),
            day("2026-11-10", vec![bar("000001", 10.5, 10.0, Some(1.25))]),
        ];
        let rows = ladder_from_days(&days);
        assert_eq!(rows[0]["连涨天数"], "1");
        assert_eq!(rows[0]["累计换手率"], "1.25%");
        assert_eq!(rows[0]["连续涨跌幅"], "5.00%");

        let flat = vec![day("2026-11-10", vec![bar("000009", 10.0, 10.0, Some(1.0))])];
        assert!(ladder_from_days(&flat).is_empty());
    }

    #[test]
    fn missing_turnover_stays_blank_and_single_up_day_uses_change() {
        let mut only = bar("600000", 10.2, 10.0, None);
        only.industry.clear();
        let rows = ladder_from_days(&[day("2026-11-10", vec![only])]);
        assert_eq!(rows[0]["连涨天数"], "1");
        assert_eq!(rows[0]["累计换手率"], "");
        assert_eq!(rows[0]["连续涨跌幅"], "2.00%");
    }

    #[test]
    fn sync_plan_refreshes_recent_dates_and_respects_cap() {
        let candidates = vec![
            "2026-11-10".into(),
            "2026-11-07".into(),
            "2026-11-06".into(),
            "2026-11-05".into(),
        ];
        let stored = HashSet::from(["2026-11-06".into(), "2026-11-05".into()]);
        let holidays = HashSet::from(["2026-11-07".into()]);
        let plan = dates_to_sync(&candidates, &stored, &holidays, 0);
        assert_eq!(plan, vec!["2026-11-10".to_string(), "2026-11-06".to_string()]);
        let capped = dates_to_sync(&candidates, &HashSet::new(), &HashSet::new(), 1);
        assert_eq!(capped, vec!["2026-11-10".to_string()]);
    }

    #[test]
    fn day_file_roundtrip() {
        let dir = std::env::temp_dir().join(format!("gp-market-db-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let day = day("2026-11-10", vec![bar("000001", 11.0, 10.0, Some(1.5))]);
        save_day(&dir, &day).unwrap();
        let loaded = load_days(&dir, &["2026-11-10".into(), "2026-11-07".into()]);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].rows[0].code, "000001");
        assert_eq!(loaded[0].rows[0].turnover, Some(1.5));
        remember_holiday(&dir, "2026-11-08").unwrap();
        assert!(load_holidays(&dir).contains("2026-11-08"));
        let _ = fs::remove_dir_all(&dir);
    }

    fn named(code: &str, name: &str, close: f64, prev: f64) -> StoredBar {
        let mut item = bar(code, close, prev, Some(1.0));
        item.name = name.into();
        item
    }

    #[test]
    fn limit_up_follows_board_and_st_rates() {
        assert!(is_limit_up(&named("600000", "浦发银行", 11.0, 10.0), None));
        assert!(!is_limit_up(&named("600000", "浦发银行", 10.5, 10.0), None));
        assert!(is_limit_up(&named("000001", "平安银行", 10.99, 9.99), None));
        assert!(!is_limit_up(&named("000001", "平安银行", 10.98, 9.99), None));
        assert!(is_limit_up(&named("600000", "*ST浦发", 10.5, 10.0), None));
        assert!(!is_limit_up(&named("600000", "*ST浦发", 11.0, 10.0), None));
        assert!(is_limit_up(&named("300001", "创业板", 12.0, 10.0), None));
        assert!(is_limit_up(&named("688001", "科创板", 12.0, 10.0), None));
        assert!(!is_limit_up(&named("300001", "创业板", 11.0, 10.0), None));
        assert!(is_limit_up(&named("830001", "北交所", 13.0, 10.0), None));
        assert!(is_limit_up(&named("920001", "北交所", 13.0, 10.0), None));
        assert!(!is_limit_up(&named("830001", "北交所", 12.0, 10.0), None));
    }

    #[test]
    fn broken_board_and_missing_day_stop_the_streak() {
        let days = vec![
            day(
                "2026-11-06",
                vec![
                    named("000001", "连板", 11.0, 10.0),
                    named("000002", "断板", 11.0, 10.0),
                    named("000003", "缺日", 11.0, 10.0),
                ],
            ),
            day(
                "2026-11-07",
                vec![
                    named("000001", "连板", 12.1, 11.0),
                    named("000002", "断板", 11.5, 11.0),
                ],
            ),
            day(
                "2026-11-10",
                vec![
                    named("000001", "连板", 13.31, 12.1),
                    named("000002", "断板", 12.65, 11.5),
                    named("000003", "缺日", 12.1, 11.0),
                    named("000004", "未板", 10.5, 10.0),
                ],
            ),
        ];
        let rows = limit_up_from_days(&days);
        let by_code = rows
            .iter()
            .map(|row| (row["股票代码"].clone(), row.clone()))
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(by_code["000001"]["连板天数"], "3");
        assert_eq!(by_code["000001"]["涨停统计"], "3天3板");
        assert_eq!(by_code["000001"]["连续涨跌幅"], "33.10%");
        assert_eq!(by_code["000002"]["连板天数"], "1");
        assert_eq!(by_code["000002"]["涨停统计"], "3天2板");
        assert_eq!(by_code["000003"]["连板天数"], "1");
        assert!(!by_code.contains_key("000004"));
        assert!(rows.iter().all(|row| !row.contains_key("首次封板") && !row.contains_key("封板资金")));
    }

    #[test]
    fn local_moves_use_saved_history_and_live_quote_without_network() {
        let dates = lookback_dates(shanghai_today());
        let newest = &dates[0];
        let middle = &dates[1];
        let oldest = &dates[2];
        let dir = std::env::temp_dir().join(format!("gp-moves-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        save_day(&dir, &day(oldest, vec![named("000001", "甲", 11.0, 10.0)])).unwrap();
        save_day(&dir, &day(middle, vec![named("000001", "甲", 12.1, 11.0)])).unwrap();
        let moves = moves_for_codes(
            &dir,
            &[LivePoint {
                code: "000001".into(),
                name: "甲".into(),
                date: newest.clone(),
                close: 13.31,
                high: Some(13.4),
                low: Some(12.2),
                prev_close: Some(12.1),
                change_pct: Some(10.0),
                turnover: Some(1.5),
            }],
        );
        let item = &moves["000001"];
        assert_eq!(item.rise_days, 3);
        assert_eq!(item.limit_days, 3);
        assert_eq!(item.limit_stat, "3天3板");
        assert_eq!(item.industry, "银行");

        let only_live = moves_for_codes(
            Path::new("/no/such/gp-market-db"),
            &[LivePoint {
                code: "000002".into(),
                name: "乙".into(),
                date: newest.clone(),
                close: 10.2,
                high: None,
                low: None,
                prev_close: Some(10.0),
                change_pct: Some(2.0),
                turnover: Some(0.4),
            }],
        );
        assert_eq!(only_live["000002"].rise_days, 1);
        assert_eq!(only_live["000002"].limit_days, 0);
        assert_eq!(only_live["000002"].limit_stat, "");
        let _ = fs::remove_dir_all(&dir);
    }
}
