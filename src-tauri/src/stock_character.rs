//! 个股股性：用一只股票自己的日 K 做规则评分。
//!
//! 价格来自东方财富日 K `https://push2his.eastmoney.com/api/qt/stock/kline/get`。
//! 前复权（fqt=1）的开高低收只用于连涨和波动；不复权（fqt=0）的涨跌额、涨跌幅用于判断收盘涨停。
//! 权重、满分刻度和样本下限是本应用的产品规则，不是交易所标准，也没有做过收益回测。

use crate::http::{self, USER_AGENT};
use crate::quotes::quote_secid;
use chrono::{DateTime, FixedOffset, NaiveDate, Utc};
#[cfg(test)]
use chrono::{Datelike, Duration, TimeZone};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration as StdDuration, Instant};

const WINDOW_DAYS: usize = 60;
const MIN_SAMPLE_DAYS: usize = 40;
const MIN_OBSERVATIONS: usize = 30;
const KLINE_LIMIT: usize = 90;
const CACHE_TTL: StdDuration = StdDuration::from_secs(6 * 60 * 60);
const LIMIT_WEIGHT: u8 = 30;
const STREAK_WEIGHT: u8 = 20;
const VOLATILITY_WEIGHT: u8 = 30;
const ACTIVITY_WEIGHT: u8 = 20;
const LIMIT_FULL_RATIO: f64 = 0.10;
const STREAK_FULL_DAYS: f64 = 5.0;
const UP_RATIO_FULL: f64 = 0.62;
const VOLATILITY_FULL: f64 = 0.03;
const TURNOVER_FULL: f64 = 5.0;

const KLINE_URLS: &[&str] = &[
    "https://push2his.eastmoney.com/api/qt/stock/kline/get",
    "https://46.push2his.eastmoney.com/api/qt/stock/kline/get",
];

const RULE_NOTE: &str = "这是本应用的规则评分，不是交易所、券商的官方股性指标，也没有用历史收益做过回测。分数高只表示这段时间更常收在板块涨停价、连涨更长、波动更大、换手更高，不表示这只股票更好，也不预测它还会上涨。权重是涨停 30、连涨 20、波动 30、成交活跃 20。涨停满分刻度是可判断交易日中有 10% 收在普通涨停价；连涨满分是最长 5 天且上涨日占 62%；波动满分是前复权日收益标准差 3%；活跃满分是平均换手率 5%。至少要有 40 个已收盘交易日，任一维度不足就不给总分。沪深主板没有历史 ST 名单，收在 5% 涨停价上的日期不计入涨停，也不当成没涨停。连涨和波动用前复权收盘价。成交活跃用换手率，不用成交额。";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterView {
    pub status: String,
    pub code: String,
    pub name: String,
    pub as_of: Option<String>,
    pub window_days: u16,
    pub min_days: u16,
    pub sample_days: u16,
    pub dropped_today: bool,
    pub suspended_days: u16,
    pub long_gaps: u16,
    pub total: Option<u8>,
    pub limit_weight: u8,
    pub streak_weight: u8,
    pub volatility_weight: u8,
    pub activity_weight: u8,
    pub limit_score: Option<u8>,
    pub limit_up_days: u16,
    pub limit_judged_days: u16,
    pub limit_unknown_days: u16,
    pub streak_score: Option<u8>,
    pub max_up_streak: u16,
    pub up_days: u16,
    pub up_pairs: u16,
    pub volatility_score: Option<u8>,
    pub daily_stdev_pct: Option<f64>,
    pub avg_amplitude_pct: Option<f64>,
    pub activity_score: Option<u8>,
    pub avg_turnover_pct: Option<f64>,
    pub turnover_days: u16,
    pub source: String,
    pub message: String,
    pub rule_note: String,
}

#[derive(Debug, Clone)]
struct ParsedBar {
    date: NaiveDate,
    close: f64,
    high: f64,
    low: f64,
    volume: f64,
    pct: Option<f64>,
    change: Option<f64>,
    turnover: Option<f64>,
}

#[derive(Debug, Clone)]
struct ParsedKline {
    code: String,
    name: String,
    bars: Vec<ParsedBar>,
}

#[derive(Debug, Clone)]
struct DayInput {
    date: NaiveDate,
    volume: f64,
    raw_close: f64,
    change: Option<f64>,
    pct: Option<f64>,
    turnover: Option<f64>,
    adj_close: f64,
    adj_high: Option<f64>,
    adj_low: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Board {
    Main,
    ChiNext,
    Star,
    Beijing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LimitClass {
    Up,
    NotUp,
    Unknown,
}

struct CacheEntry {
    at: Instant,
    view: CharacterView,
}

fn cache_store_map() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn flight_map() -> &'static Mutex<HashMap<String, Vec<mpsc::Sender<Result<CharacterView, String>>>>> {
    static FLIGHT: OnceLock<Mutex<HashMap<String, Vec<mpsc::Sender<Result<CharacterView, String>>>>>> = OnceLock::new();
    FLIGHT.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn lookup_stock_character(code: &str) -> Result<CharacterView, String> {
    let code = normalize_code(code)?;
    lookup_cached(&code, || fetch_and_evaluate(&code))
}

pub fn normalize_code(code: &str) -> Result<String, String> {
    let trimmed = code.trim();
    match quote_secid(trimmed) {
        Some(_) => Ok(trimmed.to_string()),
        None => Err("暂不支持该股票代码".into()),
    }
}

fn lookup_cached(code: &str, fetch: impl Fn() -> Result<CharacterView, String>) -> Result<CharacterView, String> {
    if let Some(view) = cache_fresh(code) {
        return Ok(view);
    }
    let (tx, rx) = mpsc::channel();
    let leader = {
        let mut flights = flight_map().lock().unwrap_or_else(|err| err.into_inner());
        if let Some(waiters) = flights.get_mut(code) {
            waiters.push(tx);
            false
        } else {
            flights.insert(code.to_string(), Vec::new());
            true
        }
    };
    if !leader {
        return rx.recv().unwrap_or_else(|_| Err("股性计算没有完成".into()));
    }
    let result = if let Some(view) = cache_fresh(code) {
        Ok(view)
    } else {
        fetch()
    };
    if let Ok(view) = &result {
        let mut cache = cache_store_map().lock().unwrap_or_else(|err| err.into_inner());
        cache.insert(code.to_string(), CacheEntry { at: Instant::now(), view: view.clone() });
    }
    let waiters = {
        let mut flights = flight_map().lock().unwrap_or_else(|err| err.into_inner());
        flights.remove(code).unwrap_or_default()
    };
    for waiter in waiters {
        let _ = waiter.send(result.clone());
    }
    result
}

fn cache_fresh(code: &str) -> Option<CharacterView> {
    let cache = cache_store_map().lock().unwrap_or_else(|err| err.into_inner());
    cache.get(code).and_then(|entry| {
        (entry.at.elapsed() < CACHE_TTL).then(|| entry.view.clone())
    })
}

fn fetch_and_evaluate(code: &str) -> Result<CharacterView, String> {
    let secid = quote_secid(code).ok_or_else(|| "暂不支持该股票代码".to_string())?;
    let raw = fetch_kline(&secid, 0)?;
    let adjusted = fetch_kline(&secid, 1)?;
    if raw.code != code || adjusted.code != code {
        return Err("日 K 返回的代码和请求不一致".into());
    }
    let name = if !raw.name.is_empty() { raw.name } else { adjusted.name };
    let listing_start = raw.bars.len() < KLINE_LIMIT && adjusted.bars.len() < KLINE_LIMIT;
    let days = join_bars(&raw.bars, &adjusted.bars);
    if days.is_empty() {
        return Ok(empty_view(code, &name, "日 K 没有可用的收盘价"));
    }
    let now = shanghai_now(Utc::now());
    Ok(evaluate(code, &name, &days, now, listing_start))
}

fn fetch_kline(secid: &str, fqt: u8) -> Result<ParsedKline, String> {
    let mut last = "日 K 数据源暂时无法访问".to_string();
    for url in KLINE_URLS {
        for trust_env in [true, false] {
            let query = [
                ("secid", secid.to_string()),
                ("klt", "101".into()),
                ("fqt", fqt.to_string()),
                ("lmt", KLINE_LIMIT.to_string()),
                ("end", "20500101".into()),
                ("fields1", "f1,f2,f3,f4,f5,f6".into()),
                ("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61".into()),
            ];
            let headers = [
                ("User-Agent", USER_AGENT),
                ("Referer", "https://quote.eastmoney.com/"),
            ];
            match http::get_json(url, &query, &headers, StdDuration::from_secs(12), trust_env) {
                Ok(payload) => match parse_kline_payload(&payload, secid) {
                    Ok(parsed) => return Ok(parsed),
                    Err(err) => last = err,
                },
                Err(err) => last = err,
            }
        }
    }
    Err(public_kline_error(&last))
}

fn public_kline_error(err: &str) -> String {
    if let Some(rest) = err.split("HTTP ").nth(1) {
        let status: String = rest.chars().take_while(|ch| ch.is_ascii_digit()).collect();
        if !status.is_empty() {
            return format!("日 K 数据源暂时无法访问（HTTP {status}）");
        }
    }
    if err.contains("不一致") || err.contains("无法解析") || err.contains("没有返回") || err.contains("解析 JSON") {
        return "日 K 数据源返回无法解析".into();
    }
    "日 K 数据源暂时无法访问".into()
}

fn parse_kline_payload(payload: &serde_json::Value, secid: &str) -> Result<ParsedKline, String> {
    let data = payload.get("data").filter(|value| !value.is_null()).ok_or_else(|| "日 K 数据源没有返回行情".to_string())?;
    let code = data.get("code").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let expected = secid.split('.').nth(1).unwrap_or("");
    if code != expected {
        return Err("日 K 返回的代码和请求不一致".into());
    }
    let name = data.get("name").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let lines = data.get("klines").and_then(|value| value.as_array()).ok_or_else(|| "日 K 数据源返回无法解析".to_string())?;
    let mut bars = Vec::new();
    for line in lines {
        let text = line.as_str().unwrap_or("");
        if let Some(bar) = parse_kline_line(text) {
            bars.push(bar);
        }
    }
    Ok(ParsedKline { code, name, bars })
}

fn parse_kline_line(line: &str) -> Option<ParsedBar> {
    let parts: Vec<&str> = line.split(',').collect();
    if parts.len() < 11 {
        return None;
    }
    let date = NaiveDate::parse_from_str(parts[0], "%Y-%m-%d").ok()?;
    let _open: f64 = parts[1].parse().ok()?;
    Some(ParsedBar {
        date,
        close: parts[2].parse().ok()?,
        high: parts[3].parse().ok()?,
        low: parts[4].parse().ok()?,
        volume: parts[5].parse().ok()?,
        pct: parts[8].parse().ok(),
        change: parts[9].parse().ok(),
        turnover: parts[10].parse().ok(),
    })
}

fn join_bars(raw: &[ParsedBar], adjusted: &[ParsedBar]) -> Vec<DayInput> {
    let adjusted: HashMap<NaiveDate, &ParsedBar> = adjusted.iter().map(|bar| (bar.date, bar)).collect();
    let mut days = Vec::new();
    for bar in raw {
        let Some(adj) = adjusted.get(&bar.date) else {
            continue;
        };
        if !bar.close.is_finite() || bar.close <= 0.0 || !adj.close.is_finite() || adj.close <= 0.0 {
            continue;
        }
        days.push(DayInput {
            date: bar.date,
            volume: if bar.volume.is_finite() { bar.volume } else { 0.0 },
            raw_close: bar.close,
            change: finite(bar.change),
            pct: finite(bar.pct),
            turnover: finite(bar.turnover).filter(|value| *value >= 0.0),
            adj_close: adj.close,
            adj_high: finite(Some(adj.high)).filter(|value| *value > 0.0),
            adj_low: finite(Some(adj.low)).filter(|value| *value > 0.0),
        });
    }
    days
}

fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|item| item.is_finite())
}

fn evaluate(
    code: &str,
    name: &str,
    days: &[DayInput],
    now: DateTime<FixedOffset>,
    listing_start: bool,
) -> CharacterView {
    let mut by_date: HashMap<NaiveDate, DayInput> = HashMap::new();
    for day in days {
        if day.raw_close.is_finite() && day.raw_close > 0.0 && day.adj_close.is_finite() && day.adj_close > 0.0 {
            by_date.insert(day.date, day.clone());
        }
    }
    let mut ordered: Vec<DayInput> = by_date.into_values().collect();
    ordered.sort_by_key(|day| day.date);
    let mut dropped_today = false;
    if ordered.last().is_some_and(|day| day.date == now.date_naive() && is_before_close(now)) {
        ordered.pop();
        dropped_today = true;
    }
    let tradable: Vec<DayInput> = ordered.iter().filter(|day| day.volume > 0.0).cloned().collect();
    let board = board_of(code);
    let mut nolimit_dates = HashSet::new();
    if listing_start {
        if let Some(board) = board {
            let count = ipo_unjudged_bars(board, tradable.first().map(|day| day.date));
            for day in tradable.iter().take(count) {
                nolimit_dates.insert(day.date);
            }
        }
    }
    let sample: Vec<DayInput> = tradable.iter().rev().take(WINDOW_DAYS).cloned().collect::<Vec<_>>().into_iter().rev().collect();
    let suspended_days = count_between(&ordered, &sample, |day| day.volume <= 0.0);
    let long_gaps = long_gap_count(&sample);
    let mut view = blank_view(code, name);
    view.dropped_today = dropped_today;
    view.suspended_days = suspended_days;
    view.long_gaps = long_gaps;
    view.sample_days = u16_len(sample.len());
    view.as_of = sample.last().map(|day| day.date.format("%Y-%m-%d").to_string());
    if sample.len() < MIN_SAMPLE_DAYS || board.is_none() {
        view.status = "incomplete".into();
        view.message = if board.is_none() {
            "暂不支持该股票代码".into()
        } else {
            format!(
                "已收盘样本 {} 天，少于 {} 天，不计算股性分数。",
                sample.len(),
                MIN_SAMPLE_DAYS
            )
        };
        return view;
    }
    let limit = score_limit(board.unwrap(), &sample, &nolimit_dates);
    let streak = score_streak(&sample);
    let volatility = score_volatility(&sample);
    let activity = score_activity(&sample);
    view.limit_up_days = limit.up;
    view.limit_judged_days = limit.judged;
    view.limit_unknown_days = limit.unknown;
    view.max_up_streak = streak.max_streak;
    view.up_days = streak.up_days;
    view.up_pairs = streak.pairs;
    view.daily_stdev_pct = volatility.stdev_pct;
    view.avg_amplitude_pct = volatility.amplitude_pct;
    view.avg_turnover_pct = activity.average;
    view.turnover_days = activity.days;
    view.limit_score = limit.score;
    view.streak_score = streak.score;
    view.volatility_score = volatility.score;
    view.activity_score = activity.score;
    let mut missing = Vec::new();
    if limit.score.is_none() {
        missing.push("涨停");
    }
    if streak.score.is_none() {
        missing.push("连涨");
    }
    if volatility.score.is_none() {
        missing.push("波动");
    }
    if activity.score.is_none() {
        missing.push("成交活跃");
    }
    if missing.is_empty() {
        let total = weighted_total(limit.score.unwrap(), streak.score.unwrap(), volatility.score.unwrap(), activity.score.unwrap());
        view.total = Some(total);
        view.status = "ok".into();
        view.message = format!(
            "使用最近 {} 个已收盘交易日（上限 {}），截至 {}。",
            sample.len(),
            WINDOW_DAYS,
            view.as_of.as_deref().unwrap_or("未知")
        );
    } else {
        view.status = "incomplete".into();
        view.total = None;
        view.message = format!(
            "样本 {} 天，截至 {}。{} 的可用记录不足，所以不计算总分。",
            sample.len(),
            view.as_of.as_deref().unwrap_or("未知"),
            missing.join("、")
        );
    }
    if long_gaps > 0 {
        view.message.push_str(&format!(" 有 {long_gaps} 处间隔超过 10 个自然日，没有补造价格。"));
    }
    view
}

struct LimitScore {
    score: Option<u8>,
    up: u16,
    judged: u16,
    unknown: u16,
}

fn score_limit(board: Board, sample: &[DayInput], nolimit: &HashSet<NaiveDate>) -> LimitScore {
    let mut up = 0u16;
    let mut judged = 0u16;
    let mut unknown = 0u16;
    for day in sample {
        match classify_limit(board, day, nolimit.contains(&day.date)) {
            LimitClass::Up => {
                up += 1;
                judged += 1;
            }
            LimitClass::NotUp => judged += 1,
            LimitClass::Unknown => unknown += 1,
        }
    }
    let score = (judged as usize >= MIN_OBSERVATIONS).then(|| {
        let ratio = f64::from(up) / f64::from(judged);
        scale_score(ratio / LIMIT_FULL_RATIO)
    });
    LimitScore { score, up, judged, unknown }
}

fn classify_limit(board: Board, day: &DayInput, listing_nolimit: bool) -> LimitClass {
    if listing_nolimit {
        return LimitClass::Unknown;
    }
    let Some(close_fen) = to_fen(day.raw_close) else {
        return LimitClass::Unknown;
    };
    let Some(prev_fen) = official_prev_fen(close_fen, day.change, day.pct) else {
        return LimitClass::Unknown;
    };
    let ordinary = limit_fen(prev_fen, ordinary_rate_bps(board, day.date));
    if close_fen > ordinary + 1 {
        return LimitClass::Unknown;
    }
    if (close_fen - ordinary).abs() <= 1 && close_fen >= ordinary {
        return LimitClass::Up;
    }
    if st_five_is_ambiguous(board, day.date) {
        let st_limit = limit_fen(prev_fen, 500);
        if (close_fen - st_limit).abs() <= 1 {
            return LimitClass::Unknown;
        }
    }
    LimitClass::NotUp
}

fn official_prev_fen(close_fen: i64, change: Option<f64>, pct: Option<f64>) -> Option<i64> {
    let from_change = change.and_then(|value| {
        let prev = close_fen - (value * 100.0).round() as i64;
        (prev > 0).then_some(prev)
    });
    let from_pct = pct.and_then(|value| {
        if value <= -99.0 {
            return None;
        }
        let prev = (close_fen as f64 / (1.0 + value / 100.0)).round() as i64;
        (prev > 0).then_some(prev)
    });
    match (from_change, from_pct) {
        (Some(left), Some(right)) if (left - right).abs() > 2 => None,
        (Some(left), _) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn ordinary_rate_bps(board: Board, date: NaiveDate) -> i64 {
    match board {
        Board::Star => 2000,
        Board::Beijing => 3000,
        Board::ChiNext if date >= reform_chinext() => 2000,
        Board::ChiNext | Board::Main => 1000,
    }
}

fn st_five_is_ambiguous(board: Board, date: NaiveDate) -> bool {
    match board {
        Board::Main => true,
        Board::ChiNext if date < reform_chinext() => true,
        _ => false,
    }
}

fn ipo_unjudged_bars(board: Board, first: Option<NaiveDate>) -> usize {
    let Some(date) = first else {
        return 0;
    };
    match board {
        Board::Star | Board::Beijing => 5,
        Board::ChiNext if date >= reform_chinext() => 5,
        Board::Main if date >= registration_reform() => 5,
        _ => 1,
    }
}

fn reform_chinext() -> NaiveDate {
    NaiveDate::from_ymd_opt(2020, 8, 24).unwrap()
}

fn registration_reform() -> NaiveDate {
    NaiveDate::from_ymd_opt(2023, 2, 17).unwrap()
}

fn limit_fen(prev_fen: i64, rate_bps: i64) -> i64 {
    let numerator = prev_fen * (10_000 + rate_bps) + 5_000;
    numerator / 10_000
}

fn to_fen(price: f64) -> Option<i64> {
    if !price.is_finite() || price <= 0.0 {
        None
    } else {
        Some((price * 100.0).round() as i64)
    }
}

struct StreakScore {
    score: Option<u8>,
    max_streak: u16,
    up_days: u16,
    pairs: u16,
}

fn score_streak(sample: &[DayInput]) -> StreakScore {
    let mut pairs = 0u16;
    let mut up_days = 0u16;
    let mut run = 0u16;
    let mut max_streak = 0u16;
    let mut previous: Option<f64> = None;
    for day in sample {
        if let Some(prev) = previous {
            if prev > 0.0 && day.adj_close.is_finite() {
                pairs += 1;
                if day.adj_close > prev {
                    up_days += 1;
                    run += 1;
                    max_streak = max_streak.max(run);
                } else {
                    run = 0;
                }
            } else {
                run = 0;
            }
        }
        previous = Some(day.adj_close);
    }
    let score = (pairs as usize >= MIN_OBSERVATIONS).then(|| {
        let streak_part = (f64::from(max_streak) / STREAK_FULL_DAYS).clamp(0.0, 1.0);
        let up_part = (f64::from(up_days) / f64::from(pairs) / UP_RATIO_FULL).clamp(0.0, 1.0);
        scale_score(0.5 * streak_part + 0.5 * up_part)
    });
    StreakScore { score, max_streak, up_days, pairs }
}

struct VolatilityScore {
    score: Option<u8>,
    stdev_pct: Option<f64>,
    amplitude_pct: Option<f64>,
}

fn score_volatility(sample: &[DayInput]) -> VolatilityScore {
    let mut returns = Vec::new();
    let mut amplitudes = Vec::new();
    let mut previous: Option<f64> = None;
    for day in sample {
        if let Some(prev) = previous.filter(|value| *value > 0.0) {
            if day.adj_close.is_finite() && day.adj_close > 0.0 {
                returns.push(day.adj_close / prev - 1.0);
            }
            if let (Some(high), Some(low)) = (day.adj_high, day.adj_low) {
                if high >= low {
                    amplitudes.push((high - low) / prev);
                }
            }
        }
        previous = Some(day.adj_close);
    }
    let stdev = sample_stdev(&returns);
    let amplitude = average(&amplitudes);
    let score = (returns.len() >= MIN_OBSERVATIONS).then(|| scale_score(stdev.unwrap_or(0.0) / VOLATILITY_FULL));
    VolatilityScore {
        score,
        stdev_pct: stdev.map(|value| round2(value * 100.0)),
        amplitude_pct: amplitude.map(|value| round2(value * 100.0)),
    }
}

struct ActivityScore {
    score: Option<u8>,
    average: Option<f64>,
    days: u16,
}

fn score_activity(sample: &[DayInput]) -> ActivityScore {
    let values: Vec<f64> = sample.iter().filter_map(|day| day.turnover).collect();
    let average = average(&values);
    let score = (values.len() >= MIN_OBSERVATIONS).then(|| scale_score(average.unwrap_or(0.0) / TURNOVER_FULL));
    ActivityScore {
        score,
        average: average.map(round2),
        days: u16_len(values.len()),
    }
}

fn weighted_total(limit: u8, streak: u8, volatility: u8, activity: u8) -> u8 {
    let total = f64::from(limit) * f64::from(LIMIT_WEIGHT) / 100.0
        + f64::from(streak) * f64::from(STREAK_WEIGHT) / 100.0
        + f64::from(volatility) * f64::from(VOLATILITY_WEIGHT) / 100.0
        + f64::from(activity) * f64::from(ACTIVITY_WEIGHT) / 100.0;
    total.round().clamp(0.0, 100.0) as u8
}

fn scale_score(ratio: f64) -> u8 {
    if !ratio.is_finite() || ratio <= 0.0 {
        0
    } else {
        (ratio * 100.0).round().clamp(0.0, 100.0) as u8
    }
}

fn sample_stdev(values: &[f64]) -> Option<f64> {
    if values.len() < 2 {
        return None;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance = values.iter().map(|value| (value - mean).powi(2)).sum::<f64>() / (values.len() - 1) as f64;
    Some(variance.sqrt())
}

fn average(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / values.len() as f64)
    }
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn board_of(code: &str) -> Option<Board> {
    if code.starts_with("688") || code.starts_with("689") {
        Some(Board::Star)
    } else if code.starts_with("300") || code.starts_with("301") {
        Some(Board::ChiNext)
    } else if code.starts_with("92") || code.starts_with('4') || code.starts_with('8') {
        Some(Board::Beijing)
    } else if code.starts_with('6') || code.starts_with('0') {
        Some(Board::Main)
    } else {
        None
    }
}

fn count_between(all: &[DayInput], sample: &[DayInput], pred: impl Fn(&DayInput) -> bool) -> u16 {
    let Some(start) = sample.first().map(|day| day.date) else {
        return 0;
    };
    let end = sample.last().map(|day| day.date).unwrap_or(start);
    u16_len(all.iter().filter(|day| day.date >= start && day.date <= end && pred(day)).count())
}

fn long_gap_count(sample: &[DayInput]) -> u16 {
    let mut gaps = 0u16;
    for pair in sample.windows(2) {
        let days = (pair[1].date - pair[0].date).num_days();
        if days > 10 {
            gaps = gaps.saturating_add(1);
        }
    }
    gaps
}

fn is_before_close(now: DateTime<FixedOffset>) -> bool {
    now.time() < chrono::NaiveTime::from_hms_opt(15, 5, 0).unwrap()
}

fn shanghai_now(now: DateTime<Utc>) -> DateTime<FixedOffset> {
    let offset = FixedOffset::east_opt(8 * 3600).unwrap();
    now.with_timezone(&offset)
}

fn u16_len(value: usize) -> u16 {
    u16::try_from(value).unwrap_or(u16::MAX)
}

fn blank_view(code: &str, name: &str) -> CharacterView {
    CharacterView {
        status: "incomplete".into(),
        code: code.to_string(),
        name: name.to_string(),
        as_of: None,
        window_days: WINDOW_DAYS as u16,
        min_days: MIN_SAMPLE_DAYS as u16,
        sample_days: 0,
        dropped_today: false,
        suspended_days: 0,
        long_gaps: 0,
        total: None,
        limit_weight: LIMIT_WEIGHT,
        streak_weight: STREAK_WEIGHT,
        volatility_weight: VOLATILITY_WEIGHT,
        activity_weight: ACTIVITY_WEIGHT,
        limit_score: None,
        limit_up_days: 0,
        limit_judged_days: 0,
        limit_unknown_days: 0,
        streak_score: None,
        max_up_streak: 0,
        up_days: 0,
        up_pairs: 0,
        volatility_score: None,
        daily_stdev_pct: None,
        avg_amplitude_pct: None,
        activity_score: None,
        avg_turnover_pct: None,
        turnover_days: 0,
        source: "东方财富日K /api/qt/stock/kline/get".into(),
        message: String::new(),
        rule_note: RULE_NOTE.into(),
    }
}

fn empty_view(code: &str, name: &str, message: &str) -> CharacterView {
    let mut view = blank_view(code, name);
    view.message = message.to_string();
    view
}

#[cfg(test)]
fn clear_state() {
    cache_store_map().lock().unwrap_or_else(|err| err.into_inner()).clear();
    flight_map().lock().unwrap_or_else(|err| err.into_inner()).clear();
}

#[cfg(test)]
fn weekday_on(start: NaiveDate, offset: usize) -> NaiveDate {
    let mut date = start;
    let mut left = offset;
    while left > 0 {
        date += Duration::days(1);
        if !matches!(date.weekday(), chrono::Weekday::Sat | chrono::Weekday::Sun) {
            left -= 1;
        }
    }
    date
}

#[cfg(test)]
fn quiet_day(date: NaiveDate, close: f64) -> DayInput {
    DayInput {
        date,
        volume: 1_000.0,
        raw_close: close,
        change: Some(0.01),
        pct: Some(0.1),
        turnover: Some(1.0),
        adj_close: close,
        adj_high: Some(close + 0.2),
        adj_low: Some(close - 0.2),
    }
}

#[cfg(test)]
fn shanghai(y: i32, m: u32, d: u32, hh: u32, mm: u32) -> DateTime<FixedOffset> {
    FixedOffset::east_opt(8 * 3600).unwrap().with_ymd_and_hms(y, m, d, hh, mm, 0).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Datelike;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::thread;
    use std::time::Duration as SleepDuration;

    #[test]
    fn source_errors_do_not_include_the_request_url() {
        let raw = "请求失败: error sending request for url (https://46.push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.920000&klt=101)";
        let message = public_kline_error(raw);
        assert_eq!(message, "日 K 数据源暂时无法访问");
        assert!(!message.contains("http"));
        assert_eq!(public_kline_error("HTTP 502 Bad Gateway"), "日 K 数据源暂时无法访问（HTTP 502）");
        assert_eq!(public_kline_error("日 K 返回的代码和请求不一致"), "日 K 数据源返回无法解析");
    }

    #[test]
    fn parses_recorded_eastmoney_lines() {
        // 2026-11-17 从 push2his 实际读到的行，只验证字段位置。
        let star = parse_kline_line("2026-11-06,106.00,110.90,113.49,105.00,449349,4932073612.00,7.67,0.19,0.21,2.25").unwrap();
        assert_eq!(star.date, NaiveDate::from_ymd_opt(2026, 11, 6).unwrap());
        assert_eq!(star.close, 110.90);
        assert_eq!(star.pct, Some(0.19));
        assert_eq!(star.change, Some(0.21));
        assert_eq!(star.turnover, Some(2.25));
        let beijing = parse_kline_line("2026-11-06,11.24,11.24,11.45,11.04,5819,6563914.48,3.57,-2.09,-0.24,1.01").unwrap();
        assert_eq!(beijing.turnover, Some(1.01));
        assert_eq!(beijing.pct, Some(-2.09));
        let payload = serde_json::json!({
            "data": {
                "code": "688981",
                "name": " 中芯国际",
                "klines": ["2026-11-06,106.00,110.90,113.49,105.00,449349,4932073612.00,7.67,0.19,0.21,2.25"]
            }
        });
        let parsed = parse_kline_payload(&payload, "1.688981").unwrap();
        assert_eq!(parsed.name, "中芯国际");
        assert!(parse_kline_payload(&payload, "1.600519").is_err());
    }

    #[test]
    fn limit_rules_follow_board_and_do_not_use_the_current_name() {
        let date = NaiveDate::from_ymd_opt(2026, 11, 16).unwrap();
        let mut day = quiet_day(date, 11.00);
        day.change = Some(1.00);
        day.pct = Some(10.0);
        assert_eq!(classify_limit(Board::Main, &day, false), LimitClass::Up);
        day.raw_close = 10.50;
        day.change = Some(0.50);
        day.pct = Some(5.0);
        assert_eq!(classify_limit(Board::Main, &day, false), LimitClass::Unknown);
        day.raw_close = 10.20;
        day.change = Some(0.20);
        day.pct = Some(2.0);
        assert_eq!(classify_limit(Board::Main, &day, false), LimitClass::NotUp);
        day.raw_close = 12.00;
        day.change = Some(2.00);
        day.pct = Some(20.0);
        assert_eq!(classify_limit(Board::Star, &day, false), LimitClass::Up);
        assert_eq!(classify_limit(Board::ChiNext, &day, false), LimitClass::Up);
        day.raw_close = 13.00;
        day.change = Some(3.00);
        day.pct = Some(30.0);
        assert_eq!(classify_limit(Board::Beijing, &day, false), LimitClass::Up);
        day.raw_close = 15.00;
        day.change = Some(5.00);
        day.pct = Some(50.0);
        assert_eq!(classify_limit(Board::Main, &day, false), LimitClass::Unknown);
        assert_eq!(classify_limit(Board::Main, &quiet_day(date, 11.0), true), LimitClass::Unknown);
        let old = NaiveDate::from_ymd_opt(2020, 8, 21).unwrap();
        let mut early = quiet_day(old, 11.00);
        early.change = Some(1.0);
        early.pct = Some(10.0);
        assert_eq!(classify_limit(Board::ChiNext, &early, false), LimitClass::Up);
        early.raw_close = 12.0;
        early.change = Some(2.0);
        early.pct = Some(20.0);
        assert_eq!(classify_limit(Board::ChiNext, &early, false), LimitClass::Unknown);
        assert_eq!(limit_fen(999, 1000), 1099);
        assert_eq!(ipo_unjudged_bars(Board::Main, Some(NaiveDate::from_ymd_opt(2024, 1, 2).unwrap())), 5);
        assert_eq!(ipo_unjudged_bars(Board::Main, Some(NaiveDate::from_ymd_opt(2020, 1, 2).unwrap())), 1);
    }

    #[test]
    fn ex_rights_uses_official_change_and_adjusted_closes() {
        let start = NaiveDate::from_ymd_opt(2026, 1, 5).unwrap();
        let mut days = Vec::new();
        for index in 0..50 {
            let date = weekday_on(start, index);
            let mut day = quiet_day(date, 10.0 + index as f64 * 0.01);
            day.adj_close = 20.0 + index as f64 * 0.02;
            day.change = Some(0.02);
            day.pct = Some(0.2);
            days.push(day);
        }
        let ex = days.len() - 5;
        days[ex].raw_close = 8.0;
        days[ex].change = Some(0.08);
        days[ex].pct = Some(1.0);
        days[ex].adj_close = days[ex - 1].adj_close * 1.01;
        let view = evaluate("600519", "*ST测试", &days, shanghai(2026, 4, 1, 16, 0), false);
        assert!(view.limit_unknown_days < 5, "current ST name must not turn ordinary days into unknowns: {view:?}");
        assert!(view.daily_stdev_pct.unwrap_or(100.0) < 5.0, "adjusted closes must not inherit the raw ex-rights gap");
        assert!(view.total.is_some());
    }

    #[test]
    fn missing_dimension_or_short_sample_does_not_publish_a_total() {
        let start = NaiveDate::from_ymd_opt(2026, 1, 5).unwrap();
        let mut days: Vec<_> = (0..45).map(|index| quiet_day(weekday_on(start, index), 10.0)).collect();
        for day in &mut days {
            day.turnover = None;
        }
        let view = evaluate("000001", "平安银行", &days, shanghai(2026, 4, 1, 16, 0), false);
        assert!(view.activity_score.is_none());
        assert!(view.total.is_none());
        assert!(view.message.contains("成交活跃"));
        assert_ne!(view.total, Some(0));
        let short: Vec<_> = (0..12).map(|index| quiet_day(weekday_on(start, index), 10.0)).collect();
        let short_view = evaluate("000001", "平安银行", &short, shanghai(2026, 2, 1, 16, 0), true);
        assert!(short_view.total.is_none());
        assert!(short_view.limit_score.is_none());
        assert!(short_view.message.contains("少于"));
    }

    #[test]
    fn drops_unclosed_today_zero_volume_and_duplicate_dates() {
        let start = NaiveDate::from_ymd_opt(2026, 1, 5).unwrap();
        let mut days: Vec<_> = (0..50).map(|index| {
            let mut day = quiet_day(weekday_on(start, index), 10.0 + index as f64 * 0.05);
            day.adj_close = day.raw_close;
            day
        }).collect();
        let today = days.last().unwrap().date;
        days.push(quiet_day(today, 99.0));
        days.insert(10, {
            let mut halted = days[10].clone();
            halted.volume = 0.0;
            halted.date = days[10].date;
            halted
        });
        let now = shanghai(today.year(), today.month(), today.day(), 10, 30);
        let view = evaluate("600000", "浦发银行", &days, now, false);
        assert!(view.dropped_today);
        assert_ne!(view.as_of.as_deref(), Some(today.format("%Y-%m-%d").to_string().as_str()));
        assert!(view.suspended_days >= 1 || view.sample_days < 50);
    }

    #[test]
    fn active_sample_scores_higher_than_a_quiet_one_without_claiming_a_hundred() {
        let start = NaiveDate::from_ymd_opt(2026, 1, 5).unwrap();
        let quiet: Vec<_> = (0..50).map(|index| quiet_day(weekday_on(start, index), 10.0)).collect();
        let mut active = Vec::new();
        for index in 0..50 {
            let date = weekday_on(start, index);
            let mut day = quiet_day(date, 10.0);
            day.turnover = Some(8.0);
            day.adj_close = 10.0 * (1.03_f64).powi(index as i32);
            day.adj_high = Some(day.adj_close * 1.04);
            day.adj_low = Some(day.adj_close * 0.97);
            if index % 8 == 0 {
                day.raw_close = 11.0;
                day.change = Some(1.0);
                day.pct = Some(10.0);
            } else {
                day.change = Some(0.2);
                day.pct = Some(2.0);
                day.raw_close = 10.2;
            }
            active.push(day);
        }
        let now = shanghai(2026, 4, 1, 16, 0);
        let quiet_view = evaluate("600519", "贵州茅台", &quiet, now, false);
        let active_view = evaluate("600519", "贵州茅台", &active, now, false);
        assert!(quiet_view.total.unwrap() < active_view.total.unwrap());
        assert!(active_view.total.unwrap() < 100);
        assert!(active_view.limit_up_days > 0);
        assert!(active_view.max_up_streak >= 5);
        assert_eq!(active_view.limit_weight + active_view.streak_weight + active_view.volatility_weight + active_view.activity_weight, 100);
        assert!(active_view.rule_note.contains("不预测"));
        assert!(active_view.rule_note.contains("换手率"));
    }

    #[test]
    fn cache_dedupes_concurrent_calls_and_does_not_store_errors() {
        clear_state();
        let calls = AtomicUsize::new(0);
        let code = "600519";
        let fetch = || {
            calls.fetch_add(1, Ordering::SeqCst);
            thread::sleep(SleepDuration::from_millis(80));
            Ok(blank_view(code, "贵州茅台"))
        };
        thread::scope(|scope| {
            let first = scope.spawn(|| lookup_cached(code, fetch));
            thread::sleep(SleepDuration::from_millis(10));
            let second = scope.spawn(|| lookup_cached(code, fetch));
            assert!(first.join().unwrap().is_ok());
            assert!(second.join().unwrap().is_ok());
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(lookup_cached(code, || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(blank_view(code, "贵州茅台"))
        }).is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        clear_state();
        let err = lookup_cached("000001", || Err("日 K 数据源暂时无法访问".into()));
        assert!(err.is_err());
        let seen = AtomicUsize::new(0);
        let again = lookup_cached("000001", || {
            seen.fetch_add(1, Ordering::SeqCst);
            Err("仍然失败".into())
        });
        assert!(again.is_err());
        assert_eq!(seen.load(Ordering::SeqCst), 1);
    }
}
