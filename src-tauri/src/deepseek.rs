//! DeepSeek Chat Completions：个股分析与评分。

use crate::settings::AppSettings;
use crate::types::StockRow;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

pub const DEFAULT_BASE_URL: &str = "https://api.deepseek.com";
pub const DEFAULT_MODEL: &str = "deepseek-chat";

pub const DEFAULT_ANALYSIS_PROMPT: &str = r#"你是短线交易研究员，只看未来 1–5 个交易日。请针对【股票名称/代码：______】给出可执行的短线盘面判断。优先使用文末【行情快照】里的连涨天数、涨幅、换手、散户指数、现价；不够的再补公开信息。

写作原则：
- 短线视角：看动能、量价、位置、题材热度、隔日风险，不写长期投资故事。
- 先结论、后证据。每条最多两句话。
- 关键价位和百分比加 **加粗**。
- 事实与观点分开；观点前写「判断：」。
- 查不到写「未查到公开信息」，禁止编造和套话。

必须按下面 Markdown 结构输出，不要增减标题：

## 短线结论
一句话：未来 1–5 日更像追高、持有观察，还是回避。点明最大顾虑。

## 操作要点
- 三条最要紧的短线要点，每条不超过 22 字

## 一、盘面与动能
1. 连涨节奏：连涨天数、累计涨幅、今日涨跌，是加速还是乏力
2. 量能换手：今日换手和成交额是否配合，有无天量见顶迹象
3. 散户情绪：散户指数方向，更像主力吸筹还是散户接盘

## 二、位置与博弈
4. 支撑压力：给出 1–2 个短线关键价位及依据
5. 板块效应：所属行业是否当周热点，有没有领涨龙
6. 短线筹码：龙虎榜、明显减持或砸盘风险（没有就写未查到）

## 三、催化与持续性
7. 近端催化：1–2 周内有无消息、政策、事件
8. 炒作阶段：新启动、主升，还是尾声

## 四、隔日风险
9. 追高回撤：连涨后可能的回撤空间
10. 流动性：换手是否过高、是否容易砸盘或跌停
11. 突发扰动：停牌、立案、异常波动公告

## 操作计划
- 买点：
- 止损：
- 目标：
- 不宜做：

## 短线风险提示
- 最需要警惕的 2–3 个点，短句"#;

pub const DEFAULT_SCORE_PROMPT: &str = r#"你是短线交易评分模型。请只根据下面这份短线要点，对【{name} / {code}】打 0–100 分。分数代表「未来 1–5 日的短线可操作性」，不是长期投资价值。

规则：
- 先看隔日硬伤（立案、停牌、跌停风险），再看量价是否配合，最后看位置和题材热度。
- 连涨过热、天量、散户大幅流入、明显追高，分数应低于 60。
- 有立案、停牌、异常波动监管等硬伤，分数必须低于 40。
- 量价健康、有支撑、板块仍热，可以给 70 以上。
- reason 只写最关键的一句，不超过 28 字。

只输出 JSON：
{"score": 0, "label": "不宜追高|谨慎参与|可关注|短线活跃", "reason": "一句理由"}

短线要点：
{analysis}"#;

pub const DEFAULT_JJZT_ANALYSIS_PROMPT: &str = r#"你是短线研究员。标的是【股票名称/代码：______】：昨天涨停，今天集合竞价结束后红盘，涨幅落在 2%–8%。请判断「昨强今不追高、能否弱转强」。优先使用文末【行情快照】里的今开涨幅、今日涨跌幅、昨连板、换手、散户指数、现价。

写作原则：
- 只看竞价后到午前的承接，不写年报故事。
- 先结论后证据，每条最多两句话。关键价位和百分比加 **加粗**。
- 查不到写「未查到公开信息」，禁止编造。

必须按下面 Markdown 结构输出：

## 短线结论
一句话：2%–8% 红盘是健康高开还是冲高乏力，今天更像弱转强还是诱多。

## 操作要点
- 三条，每条不超过 22 字

## 一、竞价与高开
1. 今开涨幅：是否落在 2%–8%，偏下限还是上限
2. 红盘质量：开盘后有没有立刻回落变绿
3. 量能：换手和成交是否够承接昨日涨停

## 二、昨日连板与情绪
4. 昨连板：首板还是高位，今日溢价是否匹配
5. 散户方向：更像资金回流还是散户接力
6. 板块：同板块昨日涨停今天是否一起红

## 三、日内博弈
7. 回踩买点：高开后回踩今开/均价是否可做
8. 冲高风险：靠近 8% 后是否容易回吐

## 操作计划
- 买点：
- 止损：
- 目标：
- 不宜做：

## 短线风险提示
- 2–3 个最要紧的点"#;

pub const DEFAULT_JJZT_SCORE_PROMPT: &str = r#"你是「昨涨停、今开 2%–8% 红盘」评分模型。请只根据下面要点，对【{name} / {code}】打 0–100 分。分数代表今天弱转强的可操作性。

规则：
- 今开 3%–6%、量能承接好、低位首板次日，可以 70 以上。
- 今开靠近 8%、高位连板次日、散户大幅流入，低于 60。
- 开盘后迅速回落、量能萎缩，低于 50。
- reason 不超过 28 字。

只输出 JSON：
{"score": 0, "label": "不宜追高|谨慎参与|可关注|短线活跃", "reason": "一句理由"}

要点：
{analysis}"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    pub code: String,
    pub name: String,
    #[serde(default)]
    pub facts: StockRow,
    #[serde(default)]
    pub scene: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResult {
    pub code: String,
    pub name: String,
    pub analysis: String,
    pub score: Option<u8>,
    pub score_label: Option<String>,
    pub score_reason: Option<String>,
    pub model: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScoreCard {
    pub score: Option<u8>,
    pub label: Option<String>,
    pub reason: Option<String>,
}

pub fn stock_label(name: &str, code: &str) -> String {
    let name = name.trim();
    let code = code.trim();
    if name.is_empty() {
        code.to_string()
    } else if code.is_empty() {
        name.to_string()
    } else {
        format!("{name} / {code}")
    }
}

pub fn fill_stock_prompt(template: &str, name: &str, code: &str) -> String {
    let label = stock_label(name, code);
    let trimmed = template.trim();
    let source = if trimmed.is_empty() {
        DEFAULT_ANALYSIS_PROMPT
    } else {
        trimmed
    };
    let mut out = source
        .replace("{name}", name.trim())
        .replace("{code}", code.trim())
        .replace("{stock}", &label);
    if out.contains("【股票名称/代码：______】") {
        out = out.replace(
            "【股票名称/代码：______】",
            &format!("【股票名称/代码：{label}】"),
        );
    } else if out.contains("______") {
        out = out.replacen("______", &label, 1);
    } else if !out.contains(name.trim()) && !out.contains(code.trim()) {
        out = format!("股票名称/代码：{label}\n\n{out}");
    }
    out
}

pub fn fill_score_prompt(template: &str, name: &str, code: &str, analysis: &str) -> String {
    let trimmed = template.trim();
    let source = if trimmed.is_empty() {
        DEFAULT_SCORE_PROMPT
    } else {
        trimmed
    };
    fill_stock_prompt(source, name, code).replace("{analysis}", analysis)
}

pub fn append_facts(prompt: &str, facts: &StockRow) -> String {
    if facts.is_empty() {
        return prompt.to_string();
    }
    let mut lines = vec!["【行情快照（软件内抓取，供对照，不替代公告）】".to_string()];
    for (key, value) in facts {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        lines.push(format!("{key}：{value}"));
    }
    format!("{prompt}\n\n{}", lines.join("\n"))
}

pub fn parse_score_payload(text: &str) -> ScoreCard {
    let trimmed = text.trim();
    let json_slice = extract_json_object(trimmed).unwrap_or(trimmed);
    if let Ok(value) = serde_json::from_str::<Value>(json_slice) {
        return score_from_value(&value);
    }
    let score = RegexScore::find(trimmed);
    ScoreCard {
        score,
        label: None,
        reason: if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.chars().take(120).collect())
        },
    }
}

fn extract_json_object(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(&text[start..=end])
}

fn score_from_value(value: &Value) -> ScoreCard {
    let score = value
        .get("score")
        .and_then(|v| {
            v.as_u64()
                .or_else(|| v.as_f64().map(|n| n.round() as u64))
                .or_else(|| v.as_str().and_then(|s| s.trim().parse::<f64>().ok()).map(|n| n.round() as u64))
        })
        .map(|n| n.min(100) as u8);
    let label = value
        .get("label")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let reason = value
        .get("reason")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    ScoreCard {
        score,
        label,
        reason,
    }
}

struct RegexScore;
impl RegexScore {
    fn find(text: &str) -> Option<u8> {
        let re = regex::Regex::new(r"(?i)(?:score|评分)\s*[:：]?\s*(\d{1,3})").ok()?;
        let cap = re.captures(text)?;
        cap.get(1)?
            .as_str()
            .parse::<u16>()
            .ok()
            .map(|n| n.min(100) as u8)
    }
}

pub fn analyze_stock(settings: &AppSettings, req: AnalyzeRequest) -> Result<AnalyzeResult, String> {
    let key = settings.deepseek_api_key.trim();
    if key.is_empty() {
        return Err("请先在设置中填写 DeepSeek API Key".into());
    }
    let code = req.code.trim().to_string();
    let name = req.name.trim().to_string();
    if code.is_empty() && name.is_empty() {
        return Err("缺少股票代码或名称".into());
    }
    let model = if settings.deepseek_model.trim().is_empty() {
        DEFAULT_MODEL.to_string()
    } else {
        settings.deepseek_model.trim().to_string()
    };
    let base = if settings.deepseek_base_url.trim().is_empty() {
        DEFAULT_BASE_URL.to_string()
    } else {
        settings.deepseek_base_url.trim().trim_end_matches('/').to_string()
    };

    let auction = req.scene.trim().eq_ignore_ascii_case("jjzt");
    let analysis_template = if auction {
        DEFAULT_JJZT_ANALYSIS_PROMPT
    } else if settings.analysis_prompt.trim().is_empty() {
        DEFAULT_ANALYSIS_PROMPT
    } else {
        settings.analysis_prompt.as_str()
    };
    let score_template = if auction {
        DEFAULT_JJZT_SCORE_PROMPT
    } else {
        settings.score_prompt.as_str()
    };
    let analysis_user = append_facts(&fill_stock_prompt(analysis_template, &name, &code), &req.facts);
    crate::applog::info(
        "deepseek",
        format!("开始分析 {name} {code} scene={}", req.scene),
    );
    let analysis = chat_completion(&base, key, &model, &analysis_user, Duration::from_secs(120))?;
    let score_user = fill_score_prompt(score_template, &name, &code, &analysis);
    let score_raw = chat_completion(&base, key, &model, &score_user, Duration::from_secs(60))
        .unwrap_or_default();
    let card = parse_score_payload(&score_raw);
    crate::applog::info(
        "deepseek",
        format!(
            "分析完成 {code}  score={}",
            card.score.map(|s| s.to_string()).unwrap_or_else(|| "-".into())
        ),
    );
    Ok(AnalyzeResult {
        code,
        name,
        analysis,
        score: card.score,
        score_label: card.label,
        score_reason: card.reason,
        model,
    })
}

fn chat_completion(
    base: &str,
    api_key: &str,
    model: &str,
    user_content: &str,
    timeout: Duration,
) -> Result<String, String> {
    let url = format!("{base}/chat/completions");
    let client = reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    let body = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是短线交易助手。只看未来1–5个交易日，用短句，先结论后证据。没有公开来源就写“未查到公开信息”。禁止编造，禁止长段落和长期基本面故事。"
            },
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.2,
    });
    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("请求 DeepSeek 失败: {e}"))?;
    let status = response.status();
    let text = response.text().map_err(|e| format!("读取 DeepSeek 响应失败: {e}"))?;
    if !status.is_success() {
        return Err(format_api_error(status.as_u16(), &text));
    }
    let payload: Value =
        serde_json::from_str(&text).map_err(|e| format!("DeepSeek 返回不是 JSON: {e}"))?;
    extract_message_content(&payload).ok_or_else(|| "DeepSeek 未返回文本内容".into())
}

fn format_api_error(status: u16, text: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(text) {
        if let Some(msg) = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .or_else(|| value.get("message").and_then(Value::as_str))
        {
            return format!("DeepSeek HTTP {status}: {msg}");
        }
    }
    let snippet = text.trim().chars().take(180).collect::<String>();
    if snippet.is_empty() {
        format!("DeepSeek HTTP {status}")
    } else {
        format!("DeepSeek HTTP {status}: {snippet}")
    }
}

fn extract_message_content(payload: &Value) -> Option<String> {
    let content = payload
        .pointer("/choices/0/message/content")
        .or_else(|| payload.pointer("/choices/0/delta/content"))?;
    match content {
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(s.clone())
            }
        }
        Value::Array(parts) => {
            let mut out = String::new();
            for part in parts {
                if let Some(t) = part.get("text").and_then(Value::as_str) {
                    out.push_str(t);
                } else if let Some(t) = part.get("content").and_then(Value::as_str) {
                    out.push_str(t);
                }
            }
            let t = out.trim();
            if t.is_empty() {
                None
            } else {
                Some(out)
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_blank_stock_slot() {
        let out = fill_stock_prompt(DEFAULT_ANALYSIS_PROMPT, "平安银行", "000001");
        assert!(out.contains("【股票名称/代码：平安银行 / 000001】"));
        assert!(!out.contains("______"));
    }

    #[test]
    fn fills_named_placeholders() {
        let out = fill_stock_prompt("分析 {name}（{code}）", "贵州茅台", "600519");
        assert_eq!(out, "分析 贵州茅台（600519）");
    }

    #[test]
    fn score_prompt_injects_analysis() {
        let out = fill_score_prompt(DEFAULT_SCORE_PROMPT, "平安银行", "000001", "清单正文");
        assert!(out.contains("清单正文"));
        assert!(out.contains("平安银行 / 000001"));
    }

    #[test]
    fn parse_score_json() {
        let card = parse_score_payload(r#"{"score": 72, "label": "谨慎关注", "reason": "现金流偏弱"}"#);
        assert_eq!(card.score, Some(72));
        assert_eq!(card.label.as_deref(), Some("谨慎关注"));
        assert_eq!(card.reason.as_deref(), Some("现金流偏弱"));
    }

    #[test]
    fn parse_score_from_fenced_json() {
        let card = parse_score_payload("```json\n{\"score\": 88, \"label\": \"相对稳健\"}\n```");
        assert_eq!(card.score, Some(88));
        assert_eq!(card.label.as_deref(), Some("相对稳健"));
    }

    #[test]
    fn parse_score_plain_text() {
        let card = parse_score_payload("综合评分：65 分，建议谨慎。");
        assert_eq!(card.score, Some(65));
    }
}
