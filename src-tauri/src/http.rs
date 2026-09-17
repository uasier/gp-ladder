//! 内置 HTTP 客户端：不依赖本机 Python，请求直接由 App 发出。

use encoding_rs::{Encoding, GBK, UTF_8};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::time::Duration;

pub const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

fn build_client(timeout: Duration, trust_env: bool) -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(timeout)
        .user_agent(USER_AGENT)
        .gzip(true);
    if !trust_env {
        builder = builder.no_proxy();
    }
    builder.build().map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
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

pub fn get_bytes(
    url: &str,
    headers: &[(&str, &str)],
    timeout: Duration,
    trust_env: bool,
) -> Result<(Vec<u8>, Option<String>), String> {
    let client = build_client(timeout, trust_env)?;
    let response = client
        .get(url)
        .headers(header_map(headers)?)
        .send()
        .map_err(|e| format!("请求失败: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned);
    let bytes = response.bytes().map_err(|e| format!("读取响应失败: {e}"))?;
    Ok((bytes.to_vec(), content_type))
}

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
) -> Result<serde_json::Value, String> {
    let client = build_client(timeout, trust_env)?;
    let response = client
        .get(url)
        .query(query)
        .headers(header_map(headers)?)
        .send()
        .map_err(|e| format!("请求失败: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    response
        .json()
        .map_err(|e| format!("解析 JSON 失败: {e}"))
}
