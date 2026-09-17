use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type StockRow = BTreeMap<String, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub rows: Vec<StockRow>,
    pub updated_at: Option<String>,
    pub count: usize,
    pub max_days: i64,
    pub quote_at: Option<String>,
    pub industries: Vec<String>,
}

impl Snapshot {
    pub fn empty() -> Self {
        Self {
            rows: Vec::new(),
            updated_at: None,
            count: 0,
            max_days: 0,
            quote_at: None,
            industries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshEvent {
    pub session_id: u64,
    pub phase: String,
    pub progress: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub selected_path: String,
    pub count: usize,
    pub selected: u32,
    pub format: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(feature = "web"), allow(dead_code))]
pub struct ExportRequest {
    pub format: String,
    pub path: String,
    #[serde(default)]
    pub board: Option<String>,
}
