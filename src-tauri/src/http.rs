//! 内置 HTTP 客户端：不依赖本机 Python，请求直接由 App 发出。

use crate::netdiag::{self, Attempt};
use encoding_rs::{Encoding, GBK, UTF_8};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::time::{Duration, Instant};

pub const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

fn build_client(timeout: Duration, trust_env: bool) -> Result<Client, reqwest::Error> {
    let mut builder = Client::builder()
        .timeout(timeout)
        .user_agent(USER_AGENT)
        .gzip(true);
    if !trust_env {
        builder = builder.no_proxy();
    }
    builder.build()
}

#[derive(Debug)]
pub struct HttpFailure {
    pub summary: String,
    pub attempt: Attempt,
}

impl From<HttpFailure> for String {
    fn from(value: HttpFailure) -> Self {
        value.summary
    }
}

impl std::fmt::Display for HttpFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.summary)
    }
}

fn failure_from_error(
    url: &str,
    trust_env: bool,
    stage: &str,
    status: Option<u16>,
    started: Instant,
    err: &dyn std::error::Error,
) -> HttpFailure {
    let attempt = netdiag::attempt_from_error(url, trust_env, stage, status, started.elapsed(), err);
    let summary = netdiag::user_summary("网络", std::slice::from_ref(&attempt));
    HttpFailure { summary, attempt }
}

fn failure_from_text(
    url: &str,
    trust_env: bool,
    stage: &str,
    status: Option<u16>,
    started: Instant,
    message: &str,
) -> HttpFailure {
    let attempt = netdiag::attempt_from_text(url, trust_env, stage, status, started.elapsed(), message);
    let summary = netdiag::user_summary("网络", std::slice::from_ref(&attempt));
    HttpFailure { summary, attempt }
}

fn header_map(pairs: &[(&str, &str)]) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (k, v) in pairs {
        let name = HeaderName::from_bytes(k.as_bytes()).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(v).map_err(|e| e.to_string())?;
        map.insert(name, value);
    }
    Ok(map)
}

#[allow(dead_code)]
fn decode_body(bytes: &[u8], content_type: Option<&str>) -> String {
    if let Some(ct) = content_type {
        if let Some(charset) = ct.split("charset=").nth(1) {
            let name = charset
                .trim()
                .trim_matches('"')
                .split(';')
                .next()
                .unwrap_or("")
                .trim();
            if let Some(enc) = Encoding::for_label(name.as_bytes()) {
                return enc.decode(bytes).0.into_owned();
            }
        }
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }
    let utf = UTF_8.decode(bytes).0.into_owned();
    if utf.contains('\u{FFFD}') {
        GBK.decode(bytes).0.into_owned()
    } else {
        utf
    }
}

#[allow(dead_code)]
pub fn get_bytes(
    url: &str,
    headers: &[(&str, &str)],
    timeout: Duration,
    trust_env: bool,
) -> Result<(Vec<u8>, Option<String>), String> {
    let client = build_client(timeout, trust_env).map_err(|err| netdiag::describe_transport(&err))?;
    let response = client
        .get(url)
        .headers(header_map(headers)?)
        .send()
        .map_err(|err| netdiag::describe_transport(&err))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned);
    let bytes = response.bytes().map_err(|err| netdiag::describe_transport(&err))?;
    Ok((bytes.to_vec(), content_type))
}

#[allow(dead_code)]
pub fn get_text(url: &str, headers: &[(&str, &str)], timeout: Duration) -> Result<String, String> {
    let mut last = String::new();
    for trust_env in [true, false] {
        match get_bytes(url, headers, timeout, trust_env) {
            Ok((bytes, ct)) => return Ok(decode_body(&bytes, ct.as_deref())),
            Err(err) => last = err,
        }
    }
    Err(last)
}

pub fn get_json(
    url: &str,
    query: &[(&str, String)],
    headers: &[(&str, &str)],
    timeout: Duration,
    trust_env: bool,
) -> Result<serde_json::Value, HttpFailure> {
    let started = Instant::now();
    let client = match build_client(timeout, trust_env) {
        Ok(client) => client,
        Err(err) => return Err(failure_from_error(url, trust_env, "客户端", None, started, &err)),
    };
    let headers = match header_map(headers) {
        Ok(headers) => headers,
        Err(err) => return Err(failure_from_text(url, trust_env, "客户端", None, started, &err)),
    };
    let response = match client.get(url).query(query).headers(headers).send() {
        Ok(response) => response,
        Err(err) => return Err(failure_from_error(url, trust_env, "发送", None, started, &err)),
    };
    let status = response.status();
    if !status.is_success() {
        return Err(failure_from_text(
            url,
            trust_env,
            "响应",
            Some(status.as_u16()),
            started,
            &format!("HTTP {}", status.as_u16()),
        ));
    }
    match response.json() {
        Ok(payload) => Ok(payload),
        Err(err) => Err(failure_from_error(url, trust_env, "解析", Some(status.as_u16()), started, &err)),
    }
}
