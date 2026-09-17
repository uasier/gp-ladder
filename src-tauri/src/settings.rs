use crate::deepseek::{DEFAULT_ANALYSIS_PROMPT, DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_SCORE_PROMPT};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
#[cfg(feature = "desktop")]
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// 0 表示不限制页数
    #[serde(default)]
    pub max_pages: u32,
    /// 快照 JSON 绝对路径；启动时填入 App 数据目录
    #[serde(default)]
    pub cache_path: String,
    #[serde(default)]
    pub deepseek_api_key: String,
    #[serde(default = "default_base_url")]
    pub deepseek_base_url: String,
    #[serde(default = "default_model")]
    pub deepseek_model: String,
    #[serde(default = "default_analysis_prompt")]
    pub analysis_prompt: String,
    #[serde(default = "default_score_prompt")]
    pub score_prompt: String,
}

fn default_base_url() -> String {
    DEFAULT_BASE_URL.into()
}
fn default_model() -> String {
    DEFAULT_MODEL.into()
}
fn default_analysis_prompt() -> String {
    DEFAULT_ANALYSIS_PROMPT.into()
}
fn default_score_prompt() -> String {
    DEFAULT_SCORE_PROMPT.into()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            max_pages: 0,
            cache_path: String::new(),
            deepseek_api_key: String::new(),
            deepseek_base_url: default_base_url(),
            deepseek_model: default_model(),
            analysis_prompt: default_analysis_prompt(),
            score_prompt: default_score_prompt(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub found: bool,
    pub builtin: bool,
    pub max_pages: u32,
    pub cache_path: String,
    pub version: String,
    pub has_deepseek_key: bool,
    pub deepseek_api_key: String,
    pub deepseek_base_url: String,
    pub deepseek_model: String,
    pub analysis_prompt: String,
    pub score_prompt: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub max_pages: Option<u32>,
    pub deepseek_api_key: Option<String>,
    pub deepseek_base_url: Option<String>,
    pub deepseek_model: Option<String>,
    pub analysis_prompt: Option<String>,
    pub score_prompt: Option<String>,
}

pub struct SettingsState {
    inner: Mutex<AppSettings>,
}

impl SettingsState {
    pub fn new(settings: AppSettings) -> Self {
        Self {
            inner: Mutex::new(settings),
        }
    }

    pub fn get(&self) -> Result<AppSettings, String> {
        self.inner
            .lock()
            .map(|g| g.clone())
            .map_err(|e| format!("读取设置失败: {e}"))
    }

    pub fn replace(&self, next: AppSettings) -> Result<(), String> {
        let mut g = self
            .inner
            .lock()
            .map_err(|e| format!("写入设置失败: {e}"))?;
        *g = next;
        Ok(())
    }
}

pub fn load_from_file(path: &Path) -> AppSettings {
    let mut settings = AppSettings::default();
    if let Ok(raw) = fs::read_to_string(path) {
        if let Ok(file) = serde_json::from_str::<AppSettings>(&raw) {
            settings = file;
        }
    }
    migrate_legacy_prompts(&mut settings);
    apply_env(&mut settings);
    settings
}

fn migrate_legacy_prompts(settings: &mut AppSettings) {
    let analysis = settings.analysis_prompt.as_str();
    let old_analysis = analysis.contains("买入前关键信息检查清单")
        || analysis.contains("买入前要点")
        || analysis.contains("公司基本面与财务健康");
    if old_analysis && !analysis.contains("短线交易研究员") {
        settings.analysis_prompt = default_analysis_prompt();
    }
    let score = settings.score_prompt.as_str();
    let old_score = score.contains("买入前关键信息检查清单")
        || score.contains("先看合规雷点")
        || score.contains("相对稳健");
    if old_score && !score.contains("短线可操作性") {
        settings.score_prompt = default_score_prompt();
    }
}

pub fn load_from_env() -> AppSettings {
    let mut settings = AppSettings::default();
    apply_env(&mut settings);
    settings
}

pub fn save_to_file(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| format!("写入设置失败: {e}"))
}

fn apply_env(settings: &mut AppSettings) {
    if let Ok(v) = std::env::var("GP_MAX_PAGES") {
        if let Ok(n) = v.trim().parse::<u32>() {
            settings.max_pages = n;
        }
    }
    if let Ok(v) = std::env::var("GP_CACHE_PATH") {
        if !v.trim().is_empty() {
            settings.cache_path = v.trim().to_string();
        }
    }
    if let Ok(v) = std::env::var("DEEPSEEK_API_KEY") {
        if !v.trim().is_empty() {
            settings.deepseek_api_key = v.trim().to_string();
        }
    }
    if let Ok(v) = std::env::var("DEEPSEEK_BASE_URL") {
        if !v.trim().is_empty() {
            settings.deepseek_base_url = v.trim().to_string();
        }
    }
    if let Ok(v) = std::env::var("DEEPSEEK_MODEL") {
        if !v.trim().is_empty() {
            settings.deepseek_model = v.trim().to_string();
        }
    }
}

#[cfg(feature = "desktop")]
pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析配置目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
    Ok(dir.join("settings.json"))
}

#[cfg(feature = "desktop")]
pub fn load(app: &AppHandle) -> AppSettings {
    let mut settings = match config_path(app) {
        Ok(path) => load_from_file(&path),
        Err(_) => load_from_env(),
    };
    if settings.cache_path.trim().is_empty() {
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = fs::create_dir_all(&dir);
            settings.cache_path = dir.join("snapshot.json").to_string_lossy().into_owned();
        }
    }
    settings
}

#[cfg(feature = "desktop")]
pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    save_to_file(&config_path(app)?, settings)
}

pub fn resolved_cache_path(settings: &AppSettings) -> PathBuf {
    resolved_cache_path_for(settings, crate::board::BoardKind::Lxsz)
}

pub fn resolved_cache_path_for(
    settings: &AppSettings,
    board: crate::board::BoardKind,
) -> PathBuf {
    let base = if !settings.cache_path.trim().is_empty() {
        PathBuf::from(settings.cache_path.trim())
    } else {
        crate::workspace::data_dir().join("snapshot.json")
    };
    match board {
        crate::board::BoardKind::Lxsz => base,
        crate::board::BoardKind::Zt => base
            .parent()
            .map(|dir| dir.join("zt-snapshot.json"))
            .unwrap_or_else(|| PathBuf::from("zt-snapshot.json")),
        crate::board::BoardKind::Jjzt => base
            .parent()
            .map(|dir| dir.join("jjzt-snapshot.json"))
            .unwrap_or_else(|| PathBuf::from("jjzt-snapshot.json")),
    }
}

pub fn view(settings: &AppSettings) -> SettingsView {
    SettingsView {
        found: true,
        builtin: true,
        max_pages: settings.max_pages,
        cache_path: resolved_cache_path(settings).to_string_lossy().into_owned(),
        version: env!("CARGO_PKG_VERSION").into(),
        has_deepseek_key: !settings.deepseek_api_key.trim().is_empty(),
        deepseek_api_key: settings.deepseek_api_key.clone(),
        deepseek_base_url: if settings.deepseek_base_url.trim().is_empty() {
            default_base_url()
        } else {
            settings.deepseek_base_url.clone()
        },
        deepseek_model: if settings.deepseek_model.trim().is_empty() {
            default_model()
        } else {
            settings.deepseek_model.clone()
        },
        analysis_prompt: if settings.analysis_prompt.trim().is_empty() {
            default_analysis_prompt()
        } else {
            settings.analysis_prompt.clone()
        },
        score_prompt: if settings.score_prompt.trim().is_empty() {
            default_score_prompt()
        } else {
            settings.score_prompt.clone()
        },
    }
}

pub fn apply_patch(current: &AppSettings, patch: SettingsPatch) -> AppSettings {
    let mut next = current.clone();
    if let Some(pages) = patch.max_pages {
        next.max_pages = pages;
    }
    if let Some(key) = patch.deepseek_api_key {
        next.deepseek_api_key = key.trim().to_string();
    }
    if let Some(url) = patch.deepseek_base_url {
        let url = url.trim().to_string();
        next.deepseek_base_url = if url.is_empty() { default_base_url() } else { url };
    }
    if let Some(model) = patch.deepseek_model {
        let model = model.trim().to_string();
        next.deepseek_model = if model.is_empty() { default_model() } else { model };
    }
    if let Some(prompt) = patch.analysis_prompt {
        next.analysis_prompt = if prompt.trim().is_empty() {
            default_analysis_prompt()
        } else {
            prompt
        };
    }
    if let Some(prompt) = patch.score_prompt {
        next.score_prompt = if prompt.trim().is_empty() {
            default_score_prompt()
        } else {
            prompt
        };
    }
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_only_changes_pages() {
        let cur = AppSettings {
            max_pages: 0,
            cache_path: "/tmp/snap.json".into(),
            ..AppSettings::default()
        };
        let next = apply_patch(
            &cur,
            SettingsPatch {
                max_pages: Some(2),
                deepseek_api_key: Some(" sk-test ".into()),
                deepseek_base_url: None,
                deepseek_model: None,
                analysis_prompt: None,
                score_prompt: None,
            },
        );
        assert_eq!(next.max_pages, 2);
        assert_eq!(next.cache_path, "/tmp/snap.json");
        assert_eq!(next.deepseek_api_key, "sk-test");
    }

    #[test]
    fn empty_prompt_patch_restores_default() {
        let mut cur = AppSettings::default();
        cur.analysis_prompt = "custom".into();
        let next = apply_patch(
            &cur,
            SettingsPatch {
                max_pages: None,
                deepseek_api_key: None,
                deepseek_base_url: None,
                deepseek_model: None,
                analysis_prompt: Some("  ".into()),
                score_prompt: None,
            },
        );
        assert!(next.analysis_prompt.contains("短线交易研究员"));
    }

    #[test]
    fn save_and_load_roundtrip() {
        let dir = std::env::temp_dir().join(format!(
            "gp-settings-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        let mut settings = AppSettings::default();
        settings.max_pages = 3;
        save_to_file(&path, &settings).unwrap();
        let loaded = load_from_file(&path);
        assert_eq!(loaded.max_pages, 3);
        let _ = fs::remove_dir_all(&dir);
    }
}
