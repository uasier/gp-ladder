//! 本机网络失败记录。只留最近若干条脱敏摘要，不上传、不写请求头和正文。

use chrono::Local;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Duration;

const MAX_EVENTS: usize = 12;
const MAX_ATTEMPTS: usize = 8;
const MAX_CHAIN: usize = 6;
const MAX_TEXT: usize = 180;

static LOG: Mutex<VecDeque<FailureEvent>> = Mutex::new(VecDeque::new());
#[cfg(test)]
static TEST_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub host: String,
    pub path: String,
    pub proxy: String,
    pub stage: String,
    pub kind: String,
    pub status: Option<u16>,
    pub elapsed_ms: u64,
    pub chain: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureEvent {
    pub at: String,
    pub operation: String,
    pub summary: String,
    pub elapsed_ms: u64,
    pub attempts: Vec<Attempt>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsView {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub runtime: String,
    pub events: Vec<FailureEvent>,
    pub limits: String,
}

pub struct AttemptBatch {
    operation: String,
    attempts: Vec<Attempt>,
}

impl AttemptBatch {
    pub fn new(operation: &str) -> Self {
        Self {
            operation: truncate(operation, 40),
            attempts: Vec::new(),
        }
    }

    pub fn push(&mut self, attempt: Attempt) {
        self.attempts.push(attempt);
    }

    pub fn is_empty(&self) -> bool {
        self.attempts.is_empty()
    }

    pub fn finish(self) -> String {
        commit(&self.operation, self.attempts)
    }
}

pub fn attempt_from_error(
    url: &str,
    trust_env: bool,
    stage: &str,
    status: Option<u16>,
    elapsed: Duration,
    err: &dyn std::error::Error,
) -> Attempt {
    attempt_from_chain(url, trust_env, stage, status, elapsed, error_chain(err))
}

pub fn attempt_from_text(
    url: &str,
    trust_env: bool,
    stage: &str,
    status: Option<u16>,
    elapsed: Duration,
    message: &str,
) -> Attempt {
    attempt_from_chain(
        url,
        trust_env,
        stage,
        status,
        elapsed,
        vec![truncate(&redact_text(message), MAX_TEXT)],
    )
}

pub fn attempt_from_chain(
    url: &str,
    trust_env: bool,
    stage: &str,
    status: Option<u16>,
    elapsed: Duration,
    chain: Vec<String>,
) -> Attempt {
    let chain = chain
        .into_iter()
        .map(|line| truncate(&redact_text(&line), MAX_TEXT))
        .filter(|line| !line.is_empty())
        .take(MAX_CHAIN)
        .collect::<Vec<_>>();
    let (host, path) = host_and_path(url);
    let kind = classify(stage, status, &chain).to_string();
    Attempt {
        host,
        path,
        proxy: proxy_mode(trust_env).to_string(),
        stage: stage.to_string(),
        kind,
        status: if stage == "响应" || stage == "解析" { status } else { None },
        elapsed_ms: u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX),
        chain,
    }
}

pub fn error_chain(err: &dyn std::error::Error) -> Vec<String> {
    let mut out = Vec::new();
    push_chain(err, &mut out, 0);
    out
}

fn push_chain(err: &dyn std::error::Error, out: &mut Vec<String>, depth: usize) {
    if depth >= MAX_CHAIN || out.len() >= MAX_CHAIN {
        return;
    }
    let text = truncate(&redact_text(&err.to_string()), MAX_TEXT);
    if !text.is_empty() && out.last().map(|item| item != &text).unwrap_or(true) {
        out.push(text);
    }
    if let Some(source) = err.source() {
        push_chain(source, out, depth + 1);
    }
}

pub fn classify(stage: &str, status: Option<u16>, chain: &[String]) -> &'static str {
    if stage == "解析" {
        return "解析";
    }
    if stage == "响应" || status.is_some() {
        return "HTTP";
    }
    let blob = evidence_text(chain);
    if has_tls(&blob) {
        return "TLS";
    }
    if has_dns(&blob) {
        return "DNS";
    }
    if has_timeout(&blob) {
        return "超时";
    }
    if has_connection(&blob) {
        return "连接失败";
    }
    "未知"
}

pub fn describe_transport(err: &dyn std::error::Error) -> String {
    let chain = error_chain(err);
    let kind = classify("发送", None, &chain);
    let head = match kind {
        "超时" => "网络请求超时，没有收到响应。",
        "连接失败" => "网络请求连接失败。",
        "DNS" => "域名解析失败。",
        "TLS" => "TLS 校验未通过。",
        _ => "网络请求没有完成，具体原因未知。",
    };
    if chain.is_empty() {
        head.to_string()
    } else {
        format!("{head}\n{}", chain.join("\n"))
    }
}

pub fn snapshot(runtime: &str) -> DiagnosticsView {
    let events = with_log(|log| log.iter().cloned().collect());
    DiagnosticsView {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        runtime: if runtime == "web" { "web" } else { "tauri" }.to_string(),
        events,
        limits: "不能据此判断运营商、VPN 或正在使用的 DNS 服务器。未写明的错误类型表示没有证据，不是已经排除。报告不含自选名单、账号、密钥、请求头、正文或本机地址。".to_string(),
    }
}

pub fn commit(operation: &str, attempts: Vec<Attempt>) -> String {
    let attempts = cap_attempts(attempts);
    let summary = user_summary(operation, &attempts);
    if attempts.is_empty() {
        return summary;
    }
    let elapsed_ms = attempts.iter().fold(0u64, |sum, item| sum.saturating_add(item.elapsed_ms));
    let event = FailureEvent {
        at: Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string(),
        operation: truncate(operation, 40),
        summary: summary.clone(),
        elapsed_ms,
        attempts,
    };
    with_log(|log| {
        log.push_back(event);
        while log.len() > MAX_EVENTS {
            log.pop_front();
        }
    });
    summary
}

pub fn user_summary(operation: &str, attempts: &[Attempt]) -> String {
    let subject = match operation {
        "自选行情" | "榜单行情" | "全市场行情" | "行情数据" | "深交所行情" | "行情" => "行情请求",
        "股东人数" => "股东人数请求",
        "涨停池" | "昨日涨停" => "涨停数据请求",
        _ => "网络请求",
    };
    let Some(last) = attempts.last() else {
        return format!("{subject}没有完成，具体原因未知。可查看诊断。");
    };
    let same = attempts.iter().all(|item| item.kind == last.kind);
    if !same {
        return format!("{subject}多次尝试后仍未完成。可查看诊断。");
    }
    match last.kind.as_str() {
        "超时" => format!("{subject}超时，没有收到响应。可查看诊断。"),
        "HTTP" => match last.status {
            Some(code) if attempts.iter().all(|item| item.status == Some(code)) => {
                format!("{subject}收到 HTTP {code}。可查看诊断。")
            }
            Some(_) => format!("{subject}收到 HTTP 错误。可查看诊断。"),
            None => format!("{subject}收到异常的 HTTP 响应。可查看诊断。"),
        },
        "解析" => format!("{subject}的响应无法解析。可查看诊断。"),
        "连接失败" => format!("{subject}连接失败。可查看诊断。"),
        "DNS" => format!("{subject}的域名解析失败。可查看诊断。"),
        "TLS" => format!("{subject}的 TLS 校验未通过。可查看诊断。"),
        _ => format!("{subject}没有完成，具体原因未知。可查看诊断。"),
    }
}

pub fn redact_text(input: &str) -> String {
    redact_private_ips(&redact_secrets(&redact_urls(&redact_fs_paths(input))))
}

pub fn host_and_path(url: &str) -> (String, String) {
    let safe = redact_url(url).unwrap_or_else(|| "https://未知/".to_string());
    let rest = safe.split_once("://").map(|(_, rest)| rest).unwrap_or("未知/");
    match rest.split_once('/') {
        Some((host, path)) => {
            let path = if path.is_empty() {
                "/".to_string()
            } else {
                format!("/{path}")
            };
            (if host.is_empty() { "未知".into() } else { host.to_string() }, path)
        }
        None => (if rest.is_empty() { "未知".into() } else { rest.to_string() }, "/".into()),
    }
}

fn proxy_mode(trust_env: bool) -> &'static str {
    if trust_env { "环境代理" } else { "直连" }
}

fn cap_attempts(mut attempts: Vec<Attempt>) -> Vec<Attempt> {
    if attempts.len() <= MAX_ATTEMPTS {
        return attempts;
    }
    let last = attempts.pop().expect("len checked");
    attempts.truncate(MAX_ATTEMPTS - 1);
    attempts.push(last);
    attempts
}

fn evidence_text(chain: &[String]) -> String {
    chain
        .iter()
        .map(|line| {
            redact_urls(line)
                .split_whitespace()
                .filter(|token| !token.contains("://"))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .to_ascii_lowercase()
}

fn has_tls(blob: &str) -> bool {
    [
        "certificate",
        "unknown issuer",
        "unknownissuer",
        "invalid peer certificate",
        "tls handshake",
        "ssl handshake",
        "webpki",
    ]
    .iter()
    .any(|needle| blob.contains(needle))
}

fn has_dns(blob: &str) -> bool {
    [
        "dns",
        "failed to lookup",
        "name or service not known",
        "nodename nor servname",
        "no such host",
        "temporary failure in name resolution",
    ]
    .iter()
    .any(|needle| blob.contains(needle))
}

fn has_timeout(blob: &str) -> bool {
    blob.contains("timed out") || blob.contains("timeout")
}

fn has_connection(blob: &str) -> bool {
    [
        "connection refused",
        "connection reset",
        "connection aborted",
        "network is unreachable",
        "host unreachable",
        "no route to host",
        "broken pipe",
    ]
    .iter()
    .any(|needle| blob.contains(needle))
}

fn redact_urls(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while !rest.is_empty() {
        let lower = rest.to_ascii_lowercase();
        let https = lower.find("https://");
        let http = lower.find("http://");
        let start = match (https, http) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };
        let Some(start) = start else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let len = tail
            .char_indices()
            .find_map(|(idx, ch)| (idx > 0 && is_url_end(ch)).then_some(idx))
            .unwrap_or(tail.len());
        let raw = &tail[..len];
        out.push_str(&redact_url(raw).unwrap_or_else(|| "[url]".to_string()));
        rest = &tail[len..];
    }
    out
}

fn is_url_end(ch: char) -> bool {
    ch.is_whitespace()
        || ch.is_ascii_control()
        || !ch.is_ascii()
        || matches!(ch, '"' | '\'' | '<' | '>' | ')' | ']' | ',' )
}

fn redact_url(raw: &str) -> Option<String> {
    let (scheme, after) = if raw.len() >= 8 && raw[..8].eq_ignore_ascii_case("https://") {
        ("https", &raw[8..])
    } else if raw.len() >= 7 && raw[..7].eq_ignore_ascii_case("http://") {
        ("http", &raw[7..])
    } else {
        return None;
    };
    if after.is_empty() {
        return Some("[url]".to_string());
    }
    let (authority, path) = match after.find('/') {
        Some(index) => (&after[..index], &after[index..]),
        None => (after, ""),
    };
    let host = authority.rsplit('@').next().unwrap_or(authority);
    let host = host.split(['?', '#']).next().unwrap_or(host);
    let path = path.split(['?', '#']).next().unwrap_or("");
    if host.is_empty() {
        return Some("[url]".to_string());
    }
    Some(format!("{scheme}://{host}{path}"))
}

fn redact_secrets(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let lower = input.to_ascii_lowercase();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if let Some(token) = secret_at(&lower, i) {
            let value_at = skip_separator(bytes, i + token.len());
            let mut next = skip_token(bytes, value_at);
            let value = lower.get(value_at..next).unwrap_or("").trim();
            if token == "authorization" && value == "bearer" {
                next = skip_token(bytes, next);
            }
            out.push_str(token);
            out.push_str("=[已省略]");
            i = next;
            continue;
        }
        if lower[i..].starts_with("bearer ") {
            out.push_str("Bearer [已省略]");
            i += "bearer ".len();
            while i < bytes.len() && !bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            continue;
        }
        let ch = input[i..].chars().next().unwrap_or('\u{FFFD}');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn secret_at(lower: &str, index: usize) -> Option<&'static str> {
    const KEYS: &[&str] = &[
        "authorization",
        "cookie",
        "api_key",
        "api-key",
        "apikey",
        "token",
        "password",
        "passwd",
        "secret",
    ];
    for key in KEYS {
        if lower[index..].starts_with(key) {
            let next = index + key.len();
            let tail = lower.as_bytes().get(next).copied().unwrap_or(b' ');
            if tail == b'=' || tail == b':' || tail.is_ascii_whitespace() {
                return Some(*key);
            }
        }
    }
    None
}

fn skip_separator(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    if index < bytes.len() && (bytes[index] == b'=' || bytes[index] == b':') {
        index += 1;
    }
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    index
}

fn skip_token(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    while index < bytes.len()
        && !bytes[index].is_ascii_whitespace()
        && !matches!(bytes[index], b')' | b',' | b'"' | b'\'')
    {
        index += 1;
    }
    index
}

fn redact_private_ips(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(len) = ipv4_at(&chars, i) {
            let text: String = chars[i..i + len].iter().collect();
            if is_private_ipv4(&text) {
                out.push_str("[本机地址已省略]");
            } else {
                out.push_str(&text);
            }
            i += len;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out.replace("::1", "[本机地址已省略]")
}

fn ipv4_at(chars: &[char], start: usize) -> Option<usize> {
    if start > 0 && chars[start - 1].is_ascii_digit() {
        return None;
    }
    let mut index = start;
    for part in 0..4 {
        let begin = index;
        while index < chars.len() && chars[index].is_ascii_digit() {
            index += 1;
        }
        if index == begin || index - begin > 3 {
            return None;
        }
        if part < 3 {
            if chars.get(index) != Some(&'.') {
                return None;
            }
            index += 1;
        }
    }
    if chars.get(index).map(|ch| ch.is_ascii_digit()).unwrap_or(false) {
        return None;
    }
    Some(index - start)
}

fn is_private_ipv4(text: &str) -> bool {
    let mut parts = [0u16; 4];
    for (slot, part) in text.split('.').enumerate() {
        if slot > 3 {
            return false;
        }
        let Ok(value) = part.parse::<u16>() else {
            return false;
        };
        if value > 255 {
            return false;
        }
        parts[slot] = value;
    }
    parts[0] == 10
        || parts[0] == 127
        || (parts[0] == 169 && parts[1] == 254)
        || (parts[0] == 172 && (16..=31).contains(&parts[1]))
        || (parts[0] == 192 && parts[1] == 168)
}

fn redact_fs_paths(input: &str) -> String {
    const MARKERS: &[&str] = &[
        "file://",
        "/home/",
        "/Users/",
        "/root/",
        "C:\\Users\\",
        "C:/Users/",
    ];
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while !rest.is_empty() {
        let found = MARKERS.iter().filter_map(|marker| rest.find(marker).map(|index| (index, *marker))).min_by_key(|(index, _)| *index);
        let Some((index, _)) = found else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..index]);
        out.push_str("[路径已省略]");
        let tail = &rest[index..];
        let skip = tail
            .char_indices()
            .find_map(|(pos, ch)| (pos > 0 && (ch.is_whitespace() || ch == '"' || ch == '\'')).then_some(pos))
            .unwrap_or(tail.len());
        rest = &tail[skip..];
    }
    out
}

fn truncate(text: &str, max_chars: usize) -> String {
    let count = text.chars().count();
    if count <= max_chars {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max_chars.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn with_log<T>(f: impl FnOnce(&mut VecDeque<FailureEvent>) -> T) -> T {
    let mut guard = LOG.lock().unwrap_or_else(|err| err.into_inner());
    f(&mut guard)
}

#[cfg(test)]
fn clear_log() {
    with_log(|log| log.clear());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;
    use std::fmt;

    #[derive(Debug)]
    struct Leaf(&'static str);

    impl fmt::Display for Leaf {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str(self.0)
        }
    }

    impl Error for Leaf {}

    #[derive(Debug)]
    struct Wrap(&'static str, Leaf);

    impl fmt::Display for Wrap {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str(self.0)
        }
    }

    impl Error for Wrap {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            Some(&self.1)
        }
    }

    fn lock() -> std::sync::MutexGuard<'static, ()> {
        TEST_LOCK.lock().unwrap_or_else(|err| err.into_inner())
    }

    fn sample(host: &str, kind: &str, elapsed_ms: u64) -> Attempt {
        Attempt {
            host: host.into(),
            path: "/api/qt/ulist.np/get".into(),
            proxy: "直连".into(),
            stage: "发送".into(),
            kind: kind.into(),
            status: None,
            elapsed_ms,
            chain: vec![kind.into()],
        }
    }

    #[test]
    fn keeps_source_chain_and_does_not_invent_a_cause() {
        let err = Wrap(
            "error sending request for url (https://user:pw@push2.eastmoney.com/api/qt/ulist.np/get?secids=1.600519&token=abc)",
            Leaf("error sending request"),
        );
        let chain = error_chain(&err);
        assert!(chain.len() >= 2, "{chain:?}");
        let joined = chain.join("\n");
        assert!(joined.contains("push2.eastmoney.com/api/qt/ulist.np/get"));
        assert!(!joined.contains("user:pw"));
        assert!(!joined.contains("secids"));
        assert!(!joined.contains("600519"));
        assert!(!joined.contains("token"));
        assert_eq!(classify("发送", None, &chain), "未知");
        let summary = user_summary("自选行情", &[sample("push2.eastmoney.com", "未知", 10)]);
        assert!(summary.contains("未知"));
        assert!(!summary.contains("DNS"));
        assert!(!summary.contains("TLS"));
        assert!(!summary.contains("超时"));
    }

    #[test]
    fn classifies_only_with_evidence() {
        assert_eq!(classify("发送", None, &["operation timed out".into()]), "超时");
        assert_eq!(
            classify("发送", None, &["invalid peer certificate: UnknownIssuer".into()]),
            "TLS",
        );
        assert_eq!(
            classify("发送", None, &["failed to lookup address information: Name or service not known".into()]),
            "DNS",
        );
        assert_eq!(classify("发送", None, &["connection refused".into()]), "连接失败");
        assert_eq!(classify("响应", Some(502), &["HTTP 502".into()]), "HTTP");
        assert_eq!(classify("解析", Some(200), &["expected value at line 1 column 1".into()]), "解析");
        assert_eq!(
            classify("发送", None, &["error sending request for url (https://push2.eastmoney.com/api/qt/ulist.np/get)".into()]),
            "未知",
        );
    }

    #[test]
    fn candidate_attempts_are_kept_together() {
        let _guard = lock();
        clear_log();
        let summary = commit(
            "自选行情",
            vec![
                sample("push2delay.eastmoney.com", "未知", 4000),
                sample("push2.eastmoney.com", "超时", 10000),
            ],
        );
        assert!(summary.contains("多次尝试"));
        let view = snapshot("tauri");
        assert_eq!(view.events.len(), 1);
        assert_eq!(view.events[0].attempts.len(), 2);
        assert_eq!(view.events[0].attempts[0].host, "push2delay.eastmoney.com");
        assert_eq!(view.events[0].attempts[0].kind, "未知");
        assert_eq!(view.events[0].attempts[1].host, "push2.eastmoney.com");
        assert_eq!(view.events[0].attempts[1].kind, "超时");
        assert!(view.events[0].at.contains('+') || view.events[0].at.contains('-'));
        assert!(view.events[0].elapsed_ms >= 14000);
        assert_eq!(view.runtime, "tauri");
        assert!(!view.os.is_empty());
        assert!(!view.arch.is_empty());
    }

    #[test]
    fn record_cap_drops_the_oldest_event_and_keeps_early_attempts() {
        let _guard = lock();
        clear_log();
        for index in 0..MAX_EVENTS + 1 {
            commit("自选行情", vec![sample(&format!("host-{index}.example"), "未知", 1)]);
        }
        let view = snapshot("web");
        assert_eq!(view.events.len(), MAX_EVENTS);
        assert_eq!(view.runtime, "web");
        assert!(!view.events.iter().any(|event| event.attempts[0].host == "host-0.example"));
        assert_eq!(view.events.last().unwrap().attempts[0].host, "host-12.example");

        let mut many = Vec::new();
        for index in 0..10 {
            many.push(sample(&format!("try-{index}.example"), "未知", 1));
        }
        commit("自选行情", many);
        let again = snapshot("web");
        let attempts = &again.events.last().unwrap().attempts;
        assert_eq!(attempts.len(), MAX_ATTEMPTS);
        assert_eq!(attempts[0].host, "try-0.example");
        assert_eq!(attempts.last().unwrap().host, "try-9.example");
    }

    #[test]
    fn empty_log_is_not_filled_with_a_guess() {
        let _guard = lock();
        clear_log();
        let summary = commit("自选行情", Vec::new());
        assert!(summary.contains("未知"));
        assert!(snapshot("tauri").events.is_empty());
    }

    #[test]
    fn redacts_credentials_query_headers_paths_and_private_ips() {
        let raw = "error sending request for url (https://user:secret@push2.eastmoney.com/api/qt/ulist.np/get?secids=1.600519&api_key=sk-test&token=abc) Authorization: Bearer sk-live proxy=http://acct:pw@10.1.2.3:8080 Cookie: session=abcdef /home/alice/watchlist.json 192.168.1.20";
        let text = redact_text(raw);
        for secret in [
            "user:secret",
            "secret@",
            "secids",
            "600519",
            "api_key",
            "sk-test",
            "token=abc",
            "Bearer sk-live",
            "sk-live",
            "acct:pw",
            "session=abcdef",
            "/home/alice",
            "192.168.1.20",
            "10.1.2.3",
        ] {
            assert!(!text.contains(secret), "{secret} leaked in {text}");
        }
        assert!(text.contains("push2.eastmoney.com/api/qt/ulist.np/get"));
        assert!(text.contains("[路径已省略]"));
        assert!(text.contains("[本机地址已省略]"));

        let attempt = attempt_from_text(
            "https://user:secret@push2.eastmoney.com/api/qt/ulist.np/get?secids=1.600519&api_key=sk-test",
            false,
            "发送",
            None,
            Duration::from_millis(15),
            raw,
        );
        let dumped = serde_json::to_string(&attempt).unwrap();
        assert_eq!(attempt.host, "push2.eastmoney.com");
        assert_eq!(attempt.path, "/api/qt/ulist.np/get");
        assert_eq!(attempt.proxy, "直连");
        assert_eq!(attempt.kind, "未知");
        assert!(attempt.status.is_none());
        assert!(!dumped.contains("secret"));
        assert!(!dumped.contains("secids"));
        assert!(!dumped.contains("600519"));
        assert!(!dumped.contains("api_key"));
    }

    #[test]
    fn long_chain_line_is_truncated() {
        let huge = "a".repeat(500);
        let attempt = attempt_from_text("https://push2.eastmoney.com/api/qt/ulist.np/get", true, "发送", None, Duration::from_millis(1), &huge);
        assert!(attempt.chain[0].chars().count() <= MAX_TEXT);
        assert_eq!(attempt.proxy, "环境代理");
    }
}
