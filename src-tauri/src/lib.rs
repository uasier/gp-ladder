mod applog;
mod board;
mod crawl;
mod deepseek;
mod enrich;
mod export;
mod format;
mod highlight;
mod http;
mod jjzt;
mod pipeline;
mod quotes;
mod refresh;
mod settings;
mod snapshot;
mod types;
mod update;
mod workspace;
mod zt;

#[cfg(feature = "web")]
pub mod server;

#[cfg(feature = "desktop")]
use refresh::RefreshState;
#[cfg(feature = "desktop")]
use settings::{SettingsPatch, SettingsState};
#[cfg(feature = "desktop")]
use std::sync::Arc;
#[cfg(feature = "desktop")]
use tauri::{Emitter, Manager};

#[cfg(feature = "desktop")]
async fn block_in<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("后台任务失败: {e}"))?
}

#[cfg(feature = "desktop")]
fn refresh_emitter(app: tauri::AppHandle) -> refresh::RefreshEmit {
    Arc::new(move |event| {
        if let Err(e) = app.emit("refresh-event", event) {
            applog::error("refresh", format!("emit(app) 失败: {e}"));
        }
        if let Some(win) = app.get_webview_window("main") {
            if let Err(e) = win.emit("refresh-event", event) {
                applog::error("refresh", format!("emit(main) 失败: {e}"));
            }
        }
    })
}

#[cfg(feature = "desktop")]
fn log_emitter(app: tauri::AppHandle) -> applog::LogEmit {
    Arc::new(move |entry| {
        let _ = app.emit("app-log", entry);
    })
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_snapshot(
    state: tauri::State<Arc<RefreshState>>,
    settings: tauri::State<SettingsState>,
    board: Option<String>,
) -> Result<types::Snapshot, String> {
    let cfg = settings.get()?;
    let kind = board::BoardKind::parse(board.as_deref());
    Ok(refresh::load_ladder(state.as_ref(), &cfg, kind))
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn start_refresh(
    app: tauri::AppHandle,
    state: tauri::State<Arc<RefreshState>>,
    settings: tauri::State<SettingsState>,
    board: Option<String>,
) -> Result<(), String> {
    let kind = board::BoardKind::parse(board.as_deref());
    refresh::start_refresh(
        Arc::clone(&state),
        settings.get()?,
        kind,
        Some(refresh_emitter(app)),
    )
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn cancel_refresh(
    app: tauri::AppHandle,
    state: tauri::State<Arc<RefreshState>>,
) -> Result<(), String> {
    refresh::cancel_refresh(state.as_ref(), Some(&refresh_emitter(app)))
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_refresh_snapshot(state: tauri::State<Arc<RefreshState>>) -> refresh::RefreshSnapshot {
    state.job_snapshot()
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn probe_runtime(settings: tauri::State<SettingsState>) -> Result<settings::SettingsView, String> {
    Ok(settings::view(&settings.get()?))
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_settings(settings: tauri::State<SettingsState>) -> Result<settings::SettingsView, String> {
    Ok(settings::view(&settings.get()?))
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    settings: tauri::State<SettingsState>,
    patch: SettingsPatch,
) -> Result<settings::SettingsView, String> {
    let current = settings.get()?;
    let next = settings::apply_patch(&current, patch);
    settings::save(&app, &next)?;
    settings.replace(next.clone())?;
    applog::info(
        "settings",
        format!(
            "已保存设置  max_pages={}  deepseek={}",
            next.max_pages,
            if next.deepseek_api_key.trim().is_empty() {
                "未配置"
            } else {
                "已配置"
            }
        ),
    );
    Ok(settings::view(&next))
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn export_snapshot(
    settings: tauri::State<'_, SettingsState>,
    format: String,
    path: String,
    board: Option<String>,
) -> Result<types::ExportResult, String> {
    let cfg = settings.get()?;
    let kind = board::BoardKind::parse(board.as_deref());
    block_in(move || {
        crate::pipeline::export_snapshot(&cfg, kind, &format, std::path::Path::new(&path))
    })
    .await
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn analyze_stock(
    settings: tauri::State<'_, SettingsState>,
    request: deepseek::AnalyzeRequest,
) -> Result<deepseek::AnalyzeResult, String> {
    let cfg = settings.get()?;
    block_in(move || crate::deepseek::analyze_stock(&cfg, request)).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_app_logs(limit: Option<usize>) -> Vec<applog::LogEntry> {
    applog::snapshot(limit.unwrap_or(500))
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_app_log_path() -> Result<String, String> {
    applog::log_path()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "日志文件尚未就绪".into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn write_app_log(level: String, source: String, message: String) {
    applog::log(&level, &source, message);
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn check_update(force: Option<bool>) -> Result<update::UpdateCheck, String> {
    let force = force.unwrap_or(false);
    block_in(move || update::check_update(force)).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn open_release_page(url: Option<String>) -> Result<(), String> {
    block_in(move || update::open_release(url)).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn install_update() -> Result<String, String> {
    block_in(update::install_update).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn reveal_app_log() -> Result<String, String> {
    let path = applog::log_path().ok_or_else(|| "日志文件尚未就绪".to_string())?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .args(["/select,", &path.to_string_lossy()])
            .spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(dir) = path.parent() {
            let _ = std::process::Command::new("xdg-open").arg(dir).spawn();
        }
    }
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(RefreshState::new()))
        .setup(|app| {
            let log_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("gp-ladder").join("logs"));
            applog::attach_path(log_dir.join("gp-ladder.log"));
            applog::set_emitter(log_emitter(app.handle().clone()));
            let loaded = settings::load(app.handle());
            applog::info(
                "app",
                format!(
                    "连涨天梯已启动（内置抓取引擎） cache={}",
                    loaded.cache_path
                ),
            );
            let refresh_state = app.state::<Arc<RefreshState>>();
            let _ = refresh::load_ladder(refresh_state.as_ref(), &loaded, board::BoardKind::Lxsz);
            let _ = refresh::load_ladder(refresh_state.as_ref(), &loaded, board::BoardKind::Zt);
            let _ = refresh::load_ladder(refresh_state.as_ref(), &loaded, board::BoardKind::Jjzt);
            app.manage(SettingsState::new(loaded));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            start_refresh,
            cancel_refresh,
            get_refresh_snapshot,
            probe_runtime,
            get_settings,
            save_settings,
            export_snapshot,
            analyze_stock,
            get_app_logs,
            get_app_log_path,
            write_app_log,
            reveal_app_log,
            check_update,
            open_release_page,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
