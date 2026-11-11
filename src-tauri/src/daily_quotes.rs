//! 指定日期的沪深京 A 股基本行情。
//!
//! 行情日期与请求日期一致时，用东方财富全市场列表，字段含开高低收、涨跌、成交量额、换手和市盈率。
//! 历史日期不用这份实时列表：估值表提供全市场收盘价和涨跌幅，资金流表补换手，深交所日行情补深市开高低收和成交量额。
//! 不为补全沪市、北交所历史开高低收逐只请求 K 线。

use crate::applog;
use crate::format::json_to_optional_float;
use crate::http::{self, USER_AGENT};
use chrono::{FixedOffset, TimeZone};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

const CLIST_URLS: &[&str] = &[
    "https://push2delay.eastmoney.com/api/qt/clist/get",
    "https://push2.eastmoney.com/api/qt/clist/get",
];
const CLIST_FS: &str = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";
const CLIST_FIELDS: &str = "f12,f14,f100,f2,f3,f4,f5,f6,f8,f9,f15,f16,f17,f18,f124";
const PAGE_SIZE: u32 = 100;
const MAX_LIVE_PAGES: u64 = 80;
const DATACENTER_URL: &str = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const DATACENTER_PAGE_SIZE: u32 = 500;
const MAX_DATACENTER_PAGES: u32 = 40;
const SZSE_URL: &str = "https://www.szse.cn/api/report/ShowReport/data";

static LIVE_HOST: Mutex<Option<(String, bool)>> = Mutex::new(None);
static CACHE: Mutex<Option<HashMap<String, DailyQuotes>>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyQuote {
    pub code: String,
    pub name: String,
    #[serde(default)]
    pub industry: String,
    pub open: Option<f64>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub close: Option<f64>,
    pub prev_close: Option<f64>,
    pub change: Option<f64>,
    pub change_pct: Option<f64>,
    pub volume: Option<f64>,
    pub amount: Option<f64>,
    pub turnover: Option<f64>,
    pub pe: Option<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyQuotes {
    pub date: String,
    pub count: usize,
    pub source: String,
    pub missing_ohlc: usize,
    pub rows: Vec<DailyQuote>,
}

enum LiveProbe {
    Match(Vec<Value>, u64),
    OtherDate,
}

pub fn fetch_daily_quotes(date: &str) -> Result<DailyQuotes, String> {
    fetch_quotes(date, true)
}

/// 只取收盘、涨跌、换手和行业，不访问深交所。连涨库用这个补历史。
pub(crate) fn fetch_daily_closes(date: &str) -> Result<DailyQuotes, String> {
    fetch_quotes(date, false)
}

fn fetch_quotes(date: &str, with_exchange: bool) -> Result<DailyQuotes, String> {
    let date = normalize_trade_date(date)?;
    if let Some(cached) = cached_history(&date) {
        return Ok(cached);
    }
    applog::info("quotes", format!("正在获取 {date} 全市场基本行情"));
    match probe_live(&date) {
        Ok(LiveProbe::Match(first, total)) => match fetch_live_rest(&date, first, total) {
            Ok(quotes) => {
                applog::info(
                    "quotes",
                    format!("{date} 当日行情 {} 只，来源 {}", quotes.count, quotes.source),
                );
                return Ok(quotes);
            }
            Err(err) => {
                applog::warn("quotes", format!("{date} 当日行情不完整，改查历史: {err}"));
                return match fetch_historical(&date, with_exchange) {
                    Ok(quotes) => {
                        remember_history(&date, &quotes);
                        Ok(quotes)
                    }
                    Err(hist) => Err(format!("{hist}；当日行情: {err}")),
                };
            }
        },
        Ok(LiveProbe::OtherDate) => {}
        Err(err) => {
            applog::warn("quotes", format!("当日行情不可用，改查 {date} 历史行情: {err}"));
            return match fetch_historical(&date, with_exchange) {
                Ok(quotes) => {
                    remember_history(&date, &quotes);
                    Ok(quotes)
                }
                Err(hist) => Err(format!("{hist}；当日行情: {err}")),
            };
        }
    }
    let quotes = fetch_historical(&date, with_exchange)?;
    remember_history(&date, &quotes);
    applog::info(
        "quotes",
        format!(
            "{date} 历史行情 {} 只，缺开高低收 {} 只，来源 {}",
            quotes.count, quotes.missing_ohlc, quotes.source
        ),
    );
    Ok(quotes)
}

pub fn normalize_trade_date(input: &str) -> Result<String, String> {
    let text = input.trim();
    if text.is_empty() {
        return Err("请提供日期，格式为 YYYY-MM-DD".into());
    }
    let (year, month, day) = if let Some((year, month, day)) = split_dashed(text) {
        (year, month, day)
    } else if text.len() == 8 && text.bytes().all(|byte| byte.is_ascii_digit()) {
        (
            text[0..4].parse::<u16>().ok(),
            text[4..6].parse::<u8>().ok(),
            text[6..8].parse::<u8>().ok(),
        )
    } else {
        (None, None, None)
    };
    let (Some(year), Some(month), Some(day)) = (year, month, day) else {
        return Err("日期无效，请使用 YYYY-MM-DD".into());
    };
    if !is_calendar_day(year, month, day) {
        return Err("日期无效，请使用 YYYY-MM-DD".into());
    }
    Ok(format!("{year:04}-{month:02}-{day:02}"))
}

fn split_dashed(text: &str) -> Option<(Option<u16>, Option<u8>, Option<u8>)> {
    let mut parts = text.split('-');
    let year = parts.next()?.parse().ok();
    let month = parts.next()?.parse().ok();
    let day = parts.next()?.parse().ok();
    if parts.next().is_some() {
        return None;
    }
    Some((year, month, day))
}

fn is_calendar_day(year: u16, month: u8, day: u8) -> bool {
    if !(1990..=2100).contains(&year) || !(1..=12).contains(&month) {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=max_day).contains(&day)
}

fn cached_history(date: &str) -> Option<DailyQuotes> {
    CACHE.lock().ok()?.as_ref()?.get(date).cloned()
}

fn remember_history(date: &str, quotes: &DailyQuotes) {
    // 深交所暂时不可用时不缓存，下次请求还能补上开高低收。
    if quotes.source == "eastmoney-live" || quotes.source == "eastmoney" {
        return;
    }
    if let Ok(mut guard) = CACHE.lock() {
        guard.get_or_insert_with(HashMap::new).insert(date.to_string(), quotes.clone());
    }
}

fn probe_live(date: &str) -> Result<LiveProbe, String> {
    let (total, items) = fetch_clist_page(1)?;
    if items.is_empty() || total == 0 {
        return Err("东方财富没有返回股票列表".into());
    }
    match quote_date_of(&items) {
        Some(quote_date) if quote_date == date => Ok(LiveProbe::Match(items, total)),
        Some(_) => Ok(LiveProbe::OtherDate),
        None => Ok(LiveProbe::OtherDate),
    }
}

fn fetch_live_rest(date: &str, first: Vec<Value>, total: u64) -> Result<DailyQuotes, String> {
    let pages = total.div_ceil(u64::from(PAGE_SIZE));
    if pages == 0 || pages > MAX_LIVE_PAGES {
        return Err("东方财富股票列表页数异常".into());
    }
    let mut items = first;
    if pages > 1 {
        let queue = Mutex::new((2..=pages).map(|page| page as u32).collect::<Vec<_>>());
        let extra = Mutex::new(Vec::<Vec<Value>>::new());
        let errors = Mutex::new(Vec::<String>::new());
        let workers = 4.min(pages as usize);
        std::thread::scope(|scope| {
            for _ in 0..workers {
                scope.spawn(|| loop {
                    let page = match queue.lock() {
                        Ok(mut pages) => pages.pop(),
                        Err(_) => None,
                    };
                    let Some(page) = page else {
                        break;
                    };
                    match fetch_clist_page(page) {
                        Ok((_, page_items)) if page_items.is_empty() => {
                            if let Ok(mut errs) = errors.lock() {
                                errs.push(format!("东方财富行情第 {page} 页为空"));
                            }
                            if let Ok(mut pages) = queue.lock() {
                                pages.clear();
                            }
                        }
                        Ok((_, page_items)) => {
                            if let Ok(mut guard) = extra.lock() {
                                guard.push(page_items);
                            }
                        }
                        Err(err) => {
                            if let Ok(mut errs) = errors.lock() {
                                errs.push(err);
                            }
                            if let Ok(mut pages) = queue.lock() {
                                pages.clear();
                            }
                        }
                    }
                });
            }
        });
        let live_error = errors
            .lock()
            .ok()
            .and_then(|errs| errs.first().cloned());
        if let Some(err) = live_error {
            return Err(err);
        }
        if let Ok(mut guard) = extra.lock() {
            for page_items in guard.drain(..) {
                items.extend(page_items);
            }
        };
    }
    let mut map = HashMap::new();
    for item in &items {
        if let Some(quote) = quote_from_clist(item) {
            map.insert(quote.code.clone(), quote);
        }
    }
    if map.len() + 50 < total as usize {
        return Err(format!(
            "东方财富行情不完整，期望约 {total} 只，实际 {} 只",
            map.len()
        ));
    }
    assemble(date, "eastmoney-live", map)
}

fn fetch_historical(date: &str, with_exchange: bool) -> Result<DailyQuotes, String> {
    let valuation = fetch_datacenter(
        "RPT_VALUEANALYSIS_DET",
        "SECURITY_CODE,SECURITY_NAME_ABBR,BOARD_NAME,TRADE_DATE,CLOSE_PRICE,CHANGE_RATE,PE_TTM",
        date,
    );
    let flow = fetch_datacenter(
        "RPT_DMSK_TS_STOCKNEW",
        "SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE,CLOSE_PRICE,CHANGE_RATE,TURNOVERRATE,PE_DYNAMIC",
        date,
    );
    let szse = if with_exchange {
        fetch_szse(date)
    } else {
        Ok(Vec::new())
    };
    let mut errors = Vec::new();
    let mut saw_empty = false;
    let mut map = HashMap::new();
    match valuation {
        Ok(rows) if rows.is_empty() => saw_empty = true,
        Ok(rows) => {
            for row in rows {
                if let Some(quote) = quote_from_valuation(&row, date) {
                    map.insert(quote.code.clone(), quote);
                }
            }
        }
        Err(err) => errors.push(err),
    }
    match flow {
        Ok(rows) if rows.is_empty() => saw_empty = true,
        Ok(rows) => {
            for row in rows {
                if let Some(quote) = quote_from_flow(&row, date) {
                    fill_gaps(&mut map, quote);
                }
            }
        }
        Err(err) => errors.push(err),
    }
    let mut used_szse = false;
    match szse {
        Ok(rows) if rows.is_empty() => saw_empty = true,
        Ok(rows) => {
            used_szse = !rows.is_empty();
            for quote in rows {
                overlay_exchange(&mut map, quote);
            }
        }
        Err(err) => {
            applog::warn("quotes", format!("{date} 深交所行情不可用，深市开高低收留空: {err}"));
            errors.push(err);
        }
    }
    if map.is_empty() {
        return Err(if errors.is_empty() || saw_empty {
            "该日期没有全市场行情，可能不是交易日".into()
        } else {
            format!(
                "全市场行情暂时不可用: {}",
                errors.last().map(String::as_str).unwrap_or("未知错误")
            )
        });
    }
    let has_eastmoney = map
        .values()
        .any(|row| row.turnover.is_some() || (row.open.is_none() && row.close.is_some()));
    let source = match (used_szse, has_eastmoney) {
        (true, true) => "eastmoney+szse",
        (true, false) => "szse",
        (false, _) => "eastmoney",
    };
    assemble(date, source, map)
}

fn fill_gaps(map: &mut HashMap<String, DailyQuote>, src: DailyQuote) {
    match map.get_mut(&src.code) {
        Some(dst) => {
            if dst.name.is_empty() {
                dst.name = src.name;
            }
            if dst.industry.is_empty() {
                dst.industry = src.industry;
            }
            copy_if_none(&mut dst.open, src.open);
            copy_if_none(&mut dst.high, src.high);
            copy_if_none(&mut dst.low, src.low);
            copy_if_none(&mut dst.close, src.close);
            copy_if_none(&mut dst.prev_close, src.prev_close);
            copy_if_none(&mut dst.change, src.change);
            copy_if_none(&mut dst.change_pct, src.change_pct);
            copy_if_none(&mut dst.volume, src.volume);
            copy_if_none(&mut dst.amount, src.amount);
            copy_if_none(&mut dst.turnover, src.turnover);
            copy_if_none(&mut dst.pe, src.pe);
            fill_change(dst);
        }
        None => {
            map.insert(src.code.clone(), src);
        }
    }
}

fn overlay_exchange(map: &mut HashMap<String, DailyQuote>, src: DailyQuote) {
    match map.get_mut(&src.code) {
        Some(dst) => {
            if dst.name.is_empty() {
                dst.name = src.name.clone();
            }
            if dst.industry.is_empty() {
                dst.industry = src.industry.clone();
            }
            overwrite(&mut dst.open, src.open);
            overwrite(&mut dst.high, src.high);
            overwrite(&mut dst.low, src.low);
            overwrite(&mut dst.close, src.close);
            overwrite(&mut dst.prev_close, src.prev_close);
            overwrite(&mut dst.change_pct, src.change_pct);
            overwrite(&mut dst.volume, src.volume);
            overwrite(&mut dst.amount, src.amount);
            copy_if_none(&mut dst.pe, src.pe);
            dst.change = None;
            fill_change(dst);
        }
        None => {
            let mut quote = src;
            fill_change(&mut quote);
            map.insert(quote.code.clone(), quote);
        }
    }
}

fn copy_if_none(dst: &mut Option<f64>, src: Option<f64>) {
    if dst.is_none() {
        *dst = src;
    }
}

fn overwrite(dst: &mut Option<f64>, src: Option<f64>) {
    if src.is_some() {
        *dst = src;
    }
}

fn fill_change(quote: &mut DailyQuote) {
    if quote.change.is_none() {
        if let (Some(close), Some(prev)) = (quote.close, quote.prev_close) {
            quote.change = Some(close - prev);
        }
    }
}

fn assemble(date: &str, source: &str, map: HashMap<String, DailyQuote>) -> Result<DailyQuotes, String> {
    let mut rows: Vec<DailyQuote> = map
        .into_values()
        .filter(|row| row.close.is_some() || row.open.is_some())
        .collect();
    if rows.is_empty() {
        return Err("该日期没有全市场行情，可能不是交易日".into());
    }
    rows.sort_by(|left, right| left.code.cmp(&right.code));
    let missing_ohlc = rows.iter().filter(|row| !has_ohlc(row)).count();
    let count = rows.len();
    Ok(DailyQuotes {
        date: date.to_string(),
        count,
        source: source.to_string(),
        missing_ohlc,
        rows,
    })
}

fn has_ohlc(row: &DailyQuote) -> bool {
    row.open.is_some() && row.high.is_some() && row.low.is_some() && row.close.is_some()
}

fn fetch_clist_page(page: u32) -> Result<(u64, Vec<Value>), String> {
    let mut candidates = Vec::new();
    if let Ok(guard) = LIVE_HOST.lock() {
        if let Some(pair) = guard.clone() {
            candidates.push(pair);
        }
    }
    for url in CLIST_URLS {
        for trust_env in [true, false] {
            let pair = ((*url).to_string(), trust_env);
            if !candidates.iter().any(|item| item == &pair) {
                candidates.push(pair);
            }
        }
    }
    let headers = [
        ("User-Agent", USER_AGENT),
        ("Referer", "https://quote.eastmoney.com/"),
    ];
    let mut last = "东方财富行情暂时不可用".to_string();
    for (url, trust_env) in candidates {
        let full = format!(
            "{url}?pn={page}&pz={PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f12&fs={CLIST_FS}&fields={CLIST_FIELDS}"
        );
        match http::get_json(&full, &[], &headers, Duration::from_secs(12), trust_env) {
            Ok(payload) => {
                let total = payload
                    .pointer("/data/total")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let items = parse_diff(&payload);
                if items.is_empty() && total > u64::from(PAGE_SIZE) * u64::from(page.saturating_sub(1)) {
                    last = format!("东方财富行情第 {page} 页为空");
                    continue;
                }
                if let Ok(mut guard) = LIVE_HOST.lock() {
                    *guard = Some((url, trust_env));
                }
                return Ok((total, items));
            }
            Err(err) => {
                last = err;
                if let Ok(mut guard) = LIVE_HOST.lock() {
                    if guard.as_ref() == Some(&(url.clone(), trust_env)) {
                        *guard = None;
                    }
                }
            }
        }
    }
    Err(last)
}

fn parse_diff(payload: &Value) -> Vec<Value> {
    match payload.pointer("/data/diff") {
        Some(Value::Array(items)) => items.clone(),
        Some(Value::Object(map)) => map.values().cloned().collect(),
        _ => Vec::new(),
    }
}

fn quote_date_of(items: &[Value]) -> Option<String> {
    items.iter().find_map(|item| {
        json_to_optional_float(&item["f124"])
            .filter(|value| value.is_finite() && *value > 0.0)
            .and_then(shanghai_date)
    })
}

fn shanghai_date(timestamp: f64) -> Option<String> {
    let offset = FixedOffset::east_opt(8 * 3600)?;
    offset
        .timestamp_opt(timestamp as i64, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
}

fn quote_from_clist(item: &Value) -> Option<DailyQuote> {
    let code = a_share_code(json_text(&item["f12"]))?;
    let mut quote = DailyQuote {
        code,
        name: json_text(&item["f14"]),
        industry: json_text(&item["f100"]),
        open: positive_price(json_to_optional_float(&item["f17"])),
        high: positive_price(json_to_optional_float(&item["f15"])),
        low: positive_price(json_to_optional_float(&item["f16"])),
        close: positive_price(json_to_optional_float(&item["f2"])),
        prev_close: positive_price(json_to_optional_float(&item["f18"])),
        change: finite(json_to_optional_float(&item["f4"])),
        change_pct: finite(json_to_optional_float(&item["f3"])),
        volume: non_negative(json_to_optional_float(&item["f5"])).map(|lots| (lots * 100.0).round()),
        amount: non_negative(json_to_optional_float(&item["f6"])),
        turnover: non_negative(json_to_optional_float(&item["f8"])),
        pe: finite(json_to_optional_float(&item["f9"])),
    };
    fill_change(&mut quote);
    Some(quote)
}

fn fetch_datacenter(report: &str, columns: &str, date: &str) -> Result<Vec<Value>, String> {
    let mut rows = Vec::new();
    let mut page = 1;
    loop {
        let payload = fetch_datacenter_page(report, columns, date, page)?;
        if page == 1 && is_explicit_empty(&payload) {
            return Ok(Vec::new());
        }
        let result = payload
            .get("result")
            .filter(|value| !value.is_null())
            .ok_or_else(|| datacenter_error(&payload))?;
        let data = result
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| "行情数据源返回无法解析".to_string())?;
        if data.is_empty() {
            return Ok(rows);
        }
        rows.extend(data.iter().cloned());
        let pages = result.get("pages").and_then(Value::as_u64).unwrap_or(1);
        if u64::from(page) >= pages || page >= MAX_DATACENTER_PAGES {
            if u64::from(page) < pages {
                return Err("行情分页不完整".into());
            }
            return Ok(rows);
        }
        page += 1;
    }
}

fn fetch_datacenter_page(report: &str, columns: &str, date: &str, page: u32) -> Result<Value, String> {
    let query = [
        ("reportName", report.to_string()),
        ("columns", columns.to_string()),
        ("filter", format!("(TRADE_DATE='{date}')")),
        ("pageNumber", page.to_string()),
        ("pageSize", DATACENTER_PAGE_SIZE.to_string()),
        ("sortTypes", "1".into()),
        ("sortColumns", "SECURITY_CODE".into()),
        ("source", "WEB".into()),
        ("client", "WEB".into()),
    ];
    let headers = [
        ("User-Agent", USER_AGENT),
        ("Referer", "https://data.eastmoney.com/"),
    ];
    let mut last = "行情数据源暂时无法访问".to_string();
    for trust_env in [true, false] {
        match http::get_json(
            DATACENTER_URL,
            &query,
            &headers,
            Duration::from_secs(15),
            trust_env,
        ) {
            Ok(payload) => return Ok(payload),
            Err(err) => last = err,
        }
    }
    Err(format!("行情数据源暂时无法访问: {last}"))
}

fn is_explicit_empty(payload: &Value) -> bool {
    payload.get("message").and_then(Value::as_str) == Some("返回数据为空")
        && payload.get("result").map(Value::is_null).unwrap_or(true)
}

fn datacenter_error(payload: &Value) -> String {
    match payload.get("message").and_then(Value::as_str) {
        Some(message) if !message.trim().is_empty() && message != "ok" => {
            format!("行情数据源返回失败: {message}")
        }
        _ => "行情数据源返回失败".into(),
    }
}

fn quote_from_valuation(row: &Value, date: &str) -> Option<DailyQuote> {
    if trade_day(&row["TRADE_DATE"]) != Some(date.to_string()) {
        return None;
    }
    let code = a_share_code(json_text(&row["SECURITY_CODE"]))?;
    Some(DailyQuote {
        code,
        name: json_text(&row["SECURITY_NAME_ABBR"]),
        industry: json_text(&row["BOARD_NAME"]),
        open: None,
        high: None,
        low: None,
        close: positive_price(json_to_optional_float(&row["CLOSE_PRICE"])),
        prev_close: None,
        change: None,
        change_pct: finite(json_to_optional_float(&row["CHANGE_RATE"])),
        volume: None,
        amount: None,
        turnover: None,
        pe: finite(json_to_optional_float(&row["PE_TTM"])),
    })
}

fn quote_from_flow(row: &Value, date: &str) -> Option<DailyQuote> {
    if trade_day(&row["TRADE_DATE"]) != Some(date.to_string()) {
        return None;
    }
    let code = a_share_code(json_text(&row["SECURITY_CODE"]))?;
    Some(DailyQuote {
        code,
        name: json_text(&row["SECURITY_NAME_ABBR"]),
        industry: String::new(),
        open: None,
        high: None,
        low: None,
        close: positive_price(json_to_optional_float(&row["CLOSE_PRICE"])),
        prev_close: None,
        change: None,
        change_pct: finite(json_to_optional_float(&row["CHANGE_RATE"])),
        volume: None,
        amount: None,
        turnover: non_negative(json_to_optional_float(&row["TURNOVERRATE"])),
        pe: finite(json_to_optional_float(&row["PE_DYNAMIC"])),
    })
}

fn trade_day(value: &Value) -> Option<String> {
    let text = value.as_str()?.trim();
    let day = text.get(..10)?;
    if day.len() == 10 && day.as_bytes().get(4) == Some(&b'-') {
        Some(day.to_string())
    } else {
        None
    }
}

fn fetch_szse(date: &str) -> Result<Vec<DailyQuote>, String> {
    let mut last = "深交所行情暂时不可用".to_string();
    let mut saw_empty = false;
    for catalog in ["1815_stock_snapshot", "1815_stock"] {
        match fetch_szse_catalog(catalog, date) {
            Ok(rows) if rows.is_empty() => saw_empty = true,
            Ok(rows) => return Ok(rows),
            Err(err) => last = err,
        }
    }
    if saw_empty {
        Ok(Vec::new())
    } else {
        Err(last)
    }
}

fn fetch_szse_catalog(catalog: &str, date: &str) -> Result<Vec<DailyQuote>, String> {
    let first = fetch_szse_page(catalog, date, 1)?;
    if first.rows.is_empty() {
        return Ok(Vec::new());
    }
    let page_count = first.page_count.max(1);
    let mut rows = first.rows;
    if page_count == 1 {
        return Ok(rows);
    }
    let queue = Mutex::new((2..=page_count).collect::<Vec<_>>());
    let extra = Mutex::new(Vec::<Vec<DailyQuote>>::new());
    let errors = Mutex::new(Vec::<String>::new());
    let workers = 6.min(page_count as usize);
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                let page = match queue.lock() {
                    Ok(mut pages) => pages.pop(),
                    Err(_) => None,
                };
                let Some(page) = page else {
                    break;
                };
                match fetch_szse_page(catalog, date, page) {
                    Ok(page_rows) if page_rows.rows.is_empty() => {
                        if let Ok(mut errs) = errors.lock() {
                            errs.push(format!("深交所行情第 {page} 页为空"));
                        }
                        if let Ok(mut pages) = queue.lock() {
                            pages.clear();
                        }
                    }
                    Ok(page_rows) => {
                        if let Ok(mut guard) = extra.lock() {
                            guard.push(page_rows.rows);
                        }
                    }
                    Err(err) => {
                        if let Ok(mut errs) = errors.lock() {
                            errs.push(err);
                        }
                        if let Ok(mut pages) = queue.lock() {
                            pages.clear();
                        }
                    }
                }
            });
        }
    });
    let page_error = errors.lock().ok().and_then(|errs| errs.first().cloned());
    if let Some(err) = page_error {
        return Err(err);
    }
    if let Ok(mut guard) = extra.lock() {
        for page_rows in guard.drain(..) {
            rows.extend(page_rows);
        }
    }
    Ok(rows)
}

struct SzsePage {
    page_count: u32,
    rows: Vec<DailyQuote>,
}

fn fetch_szse_page(catalog: &str, date: &str, page: u32) -> Result<SzsePage, String> {
    let url = format!(
        "{SZSE_URL}?SHOWTYPE=JSON&CATALOGID={catalog}&TABKEY=tab1&PAGENO={page}&txtBeginDate={date}&txtEndDate={date}"
    );
    // 深交所对 HTTP/2 会直接断开，只走 HTTP/1.1。
    let mut last = "深交所行情暂时不可用".to_string();
    for trust_env in [true, false] {
        let mut builder = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(USER_AGENT)
            .http1_only()
            .gzip(true);
        if !trust_env {
            builder = builder.no_proxy();
        }
        let client = match builder.build() {
            Ok(client) => client,
            Err(err) => {
                last = format!("创建 HTTP 客户端失败: {err}");
                continue;
            }
        };
        match client
            .get(&url)
            .header("Referer", "https://www.szse.cn/market/trend/index.html")
            .header("Accept", "application/json, text/plain, */*")
            .send()
        {
            Ok(response) if response.status().is_success() => {
                match response.json::<Value>() {
                    Ok(payload) => return parse_szse_payload(&payload, date),
                    Err(err) => last = format!("解析深交所行情失败: {err}"),
                }
            }
            Ok(response) => last = format!("HTTP {}", response.status()),
            Err(err) => last = format!("请求失败: {err}"),
        }
    }
    Err(format!("深交所行情暂时无法访问: {last}"))
}

fn parse_szse_payload(payload: &Value, date: &str) -> Result<SzsePage, String> {
    let page = payload
        .as_array()
        .and_then(|items| items.first())
        .ok_or_else(|| "深交所行情返回无法解析".to_string())?;
    let page_count = json_u32(page.pointer("/metadata/pagecount"));
    let data = page.get("data").and_then(Value::as_array);
    let rows = data
        .map(|items| items.iter().filter_map(|item| quote_from_szse(item, date)).collect())
        .unwrap_or_default();
    Ok(SzsePage { page_count, rows })
}

fn quote_from_szse(item: &Value, date: &str) -> Option<DailyQuote> {
    let row_date = json_text(&item["jyrq"]);
    if !same_date(&row_date, date) {
        return None;
    }
    let code = a_share_code(json_text(&item["zqdm"]))?;
    let mut quote = DailyQuote {
        code,
        name: json_text(&item["zqjc"]),
        industry: String::new(),
        open: positive_price(json_to_optional_float(&item["ks"])),
        high: positive_price(json_to_optional_float(&item["zg"])),
        low: positive_price(json_to_optional_float(&item["zd"])),
        close: positive_price(json_to_optional_float(&item["ss"])),
        prev_close: positive_price(json_to_optional_float(&item["qss"])),
        change: None,
        change_pct: finite(json_to_optional_float(&item["sdf"])),
        volume: shares_from_wan(json_to_optional_float(&item["cjgs"])),
        amount: yuan_from_wan(json_to_optional_float(&item["cjje"])),
        turnover: None,
        pe: finite(json_to_optional_float(&item["syl1"])),
    };
    fill_change(&mut quote);
    Some(quote)
}

fn same_date(cell: &str, expected: &str) -> bool {
    let cell = cell.trim();
    cell == expected || cell.replace('-', "") == expected.replace('-', "")
}

fn shares_from_wan(value: Option<f64>) -> Option<f64> {
    non_negative(value).map(|wan| (wan * 10_000.0).round())
}

fn yuan_from_wan(value: Option<f64>) -> Option<f64> {
    non_negative(value).map(|wan| (wan * 10_000.0).round())
}

fn a_share_code(raw: impl AsRef<str>) -> Option<String> {
    let code = raw.as_ref().trim();
    if code.len() == 6 && code.bytes().all(|byte| byte.is_ascii_digit()) && is_a_share(code) {
        Some(code.to_string())
    } else {
        None
    }
}

fn is_a_share(code: &str) -> bool {
    code.starts_with("92")
        || code.starts_with('4')
        || code.starts_with('8')
        || code.starts_with('0')
        || code.starts_with('3')
        || code.starts_with('6')
}

fn json_u32(value: Option<&Value>) -> u32 {
    match value {
        Some(Value::Number(number)) => number.as_u64().unwrap_or(0) as u32,
        Some(Value::String(text)) => text.trim().parse().unwrap_or(0),
        _ => 0,
    }
}

fn json_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        _ => String::new(),
    }
}

fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|number| number.is_finite())
}

fn positive_price(value: Option<f64>) -> Option<f64> {
    finite(value).filter(|number| *number > 0.0)
}

fn non_negative(value: Option<f64>) -> Option<f64> {
    finite(value).filter(|number| *number >= 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

    #[test]
    fn accepts_dashed_and_compact_dates_and_rejects_invalid_days() {
        assert_eq!(normalize_trade_date("2026-11-10").unwrap(), "2026-11-10");
        assert_eq!(normalize_trade_date("20261110").unwrap(), "2026-11-10");
        assert_eq!(normalize_trade_date(" 2024-02-29 ").unwrap(), "2024-02-29");
        assert!(normalize_trade_date("").unwrap_err().contains("YYYY-MM-DD"));
        assert!(normalize_trade_date("2026-11-31").is_err());
        assert!(normalize_trade_date("2026-02-29").is_err());
        assert!(normalize_trade_date("2026/11/10").is_err());
    }

    #[test]
    fn shanghai_date_uses_cst() {
        let ts = chrono::Utc
            .with_ymd_and_hms(2026, 11, 10, 1, 0, 0)
            .single()
            .unwrap()
            .timestamp();
        assert_eq!(shanghai_date(ts as f64).as_deref(), Some("2026-11-10"));
    }

    #[test]
    fn clist_row_uses_shares_and_live_prices() {
        let quote = quote_from_clist(&json!({
            "f12": "920992",
            "f14": "中科美菱",
            "f2": 10.64,
            "f3": -1.39,
            "f4": -0.15,
            "f5": 1560,
            "f6": 1666346.28,
            "f8": 0.32,
            "f9": 75.1,
            "f15": 10.8,
            "f16": 10.5,
            "f17": 10.7,
            "f18": 10.79
        }))
        .unwrap();
        assert_eq!(quote.code, "920992");
        assert_eq!(quote.close, Some(10.64));
        assert_eq!(quote.open, Some(10.7));
        assert_eq!(quote.volume, Some(156_000.0));
        assert_eq!(quote.change, Some(-0.15));
        assert_eq!(quote.turnover, Some(0.32));
        assert!(quote_from_clist(&json!({"f12": "200001", "f2": 1.0})).is_none());
    }

    #[test]
    fn valuation_and_flow_keep_close_and_turnover() {
        let valuation = quote_from_valuation(
            &json!({
                "SECURITY_CODE": "600000",
                "SECURITY_NAME_ABBR": "浦发银行",
                "TRADE_DATE": "2026-11-10 00:00:00",
                "CLOSE_PRICE": 10.2,
                "CHANGE_RATE": 0.9901,
                "PE_TTM": 6.5
            }),
            "2026-11-10",
        )
        .unwrap();
        assert_eq!(valuation.close, Some(10.2));
        assert_eq!(valuation.change_pct, Some(0.9901));
        assert!(valuation.open.is_none());
        assert!(quote_from_valuation(
            &json!({"SECURITY_CODE": "600000", "TRADE_DATE": "2026-11-09 00:00:00", "CLOSE_PRICE": 1.0}),
            "2026-11-10",
        )
        .is_none());
        let flow = quote_from_flow(
            &json!({
                "SECURITY_CODE": "600000",
                "SECURITY_NAME_ABBR": "浦发银行",
                "TRADE_DATE": "2026-11-10 00:00:00",
                "CLOSE_PRICE": 10.2,
                "CHANGE_RATE": 0.99,
                "TURNOVERRATE": 0.1435,
                "PE_DYNAMIC": 6.28
            }),
            "2026-11-10",
        )
        .unwrap();
        let mut map = HashMap::from([(valuation.code.clone(), valuation)]);
        fill_gaps(&mut map, flow);
        let merged = &map["600000"];
        assert_eq!(merged.turnover, Some(0.1435));
        assert_eq!(merged.pe, Some(6.5));
        assert_eq!(merged.change_pct, Some(0.9901));
    }

    #[test]
    fn szse_payload_converts_wan_and_merge_keeps_turnover() {
        let payload = json!([{
            "metadata": {"pagecount": 1, "recordcount": 2},
            "data": [
                {
                    "jyrq": "2026-11-10",
                    "zqdm": "000001",
                    "zqjc": "平安银行",
                    "qss": "11.89",
                    "ks": "11.83",
                    "zg": "11.88",
                    "zd": "11.73",
                    "ss": "11.86",
                    "sdf": "-0.25",
                    "cjgs": "7,490.71",
                    "cjje": "88,520.91",
                    "syl1": "5.74"
                },
                {
                    "jyrq": "2026-11-09",
                    "zqdm": "000002",
                    "zqjc": "万科",
                    "ss": "3.20"
                }
            ]
        }]);
        let parsed = parse_szse_payload(&payload, "2026-11-10").unwrap();
        assert_eq!(parsed.page_count, 1);
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0].code, "000001");
        assert_eq!(parsed.rows[0].open, Some(11.83));
        assert_eq!(parsed.rows[0].volume, Some(74_907_100.0));
        assert_eq!(parsed.rows[0].amount, Some(885_209_100.0));
        assert_eq!(parsed.rows[0].change, Some(11.86 - 11.89));

        let mut map = HashMap::from([(
            "000001".into(),
            DailyQuote {
                code: "000001".into(),
                name: "平安银行".into(),
                industry: String::new(),
                open: None,
                high: None,
                low: None,
                close: Some(11.80),
                prev_close: None,
                change: None,
                change_pct: Some(-0.2),
                volume: None,
                amount: None,
                turnover: Some(0.3859),
                pe: Some(5.29),
            },
        )]);
        overlay_exchange(&mut map, parsed.rows[0].clone());
        let merged = &map["000001"];
        assert_eq!(merged.open, Some(11.83));
        assert_eq!(merged.close, Some(11.86));
        assert_eq!(merged.turnover, Some(0.3859));
        assert_eq!(merged.pe, Some(5.29));
        assert_eq!(merged.change_pct, Some(-0.25));
        let assembled = assemble("2026-11-10", "eastmoney+szse", map).unwrap();
        assert_eq!(assembled.count, 1);
        assert_eq!(assembled.missing_ohlc, 0);
    }

    #[test]
    fn live_quote_date_must_match_before_using_clist() {
        let items = vec![json!({"f124": 1_762_736_400.0})];
        let quote_date = quote_date_of(&items);
        assert!(quote_date.is_some());
        assert_ne!(quote_date.as_deref(), Some("1990-01-01"));
        assert!(quote_date_of(&[json!({"f124": "-"})]).is_none());
    }
}
