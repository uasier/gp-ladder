use crate::applog;
use crate::board::BoardKind;
use crate::deepseek;
use crate::pipeline;
use crate::refresh::{self, RefreshState};
use crate::settings::{self, SettingsPatch, SettingsState};
use crate::types::{ExportRequest, Snapshot};
use crate::workspace;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone)]
pub struct AppState {
    refresh: Arc<RefreshState>,
    settings: Arc<SettingsState>,
    settings_path: PathBuf,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: msg.into(),
        }
    }
}

impl From<String> for ApiError {
    fn from(message: String) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(json!({ "error": self.message }));
        (self.status, body).into_response()
    }
}

async fn block_in<T, F>(f: F) -> Result<T, ApiError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| ApiError::bad(format!("后台任务失败: {e}")))?
        .map_err(ApiError::from)
}

async fn health(State(st): State<AppState>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "port": workspace::listen_port(),
        "cache": settings::resolved_cache_path(&st.settings.get().unwrap_or_default()).display().to_string(),
    }))
}

#[derive(Deserialize, Default)]
struct BoardQuery {
    board: Option<String>,
}

async fn get_snapshot(
    State(st): State<AppState>,
    Query(q): Query<BoardQuery>,
) -> Result<Json<Snapshot>, ApiError> {
    let cfg = st.settings.get()?;
    let state = Arc::clone(&st.refresh);
    let kind = BoardKind::parse(q.board.as_deref());
    block_in(move || Ok(refresh::load_ladder(state.as_ref(), &cfg, kind)))
        .await
        .map(Json)
}

async fn start_refresh(
    State(st): State<AppState>,
    Query(q): Query<BoardQuery>,
) -> Result<StatusCode, ApiError> {
    let settings = st.settings.get()?;
    let state = Arc::clone(&st.refresh);
    let kind = BoardKind::parse(q.board.as_deref());
    refresh::start_refresh(state, settings, kind, None).map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn cancel_refresh(State(st): State<AppState>) -> Result<StatusCode, ApiError> {
    refresh::cancel_refresh(st.refresh.as_ref(), None)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn refresh_snapshot(State(st): State<AppState>) -> Json<refresh::RefreshSnapshot> {
    Json(st.refresh.job_snapshot())
}

async fn get_settings(State(st): State<AppState>) -> Result<Json<settings::SettingsView>, ApiError> {
    Ok(Json(settings::view(&st.settings.get()?)))
}

async fn save_settings(
    State(st): State<AppState>,
    Json(patch): Json<SettingsPatch>,
) -> Result<Json<settings::SettingsView>, ApiError> {
    let current = st.settings.get()?;
    let next = settings::apply_patch(&current, patch);
    settings::save_to_file(&st.settings_path, &next)?;
    st.settings.replace(next.clone())?;
    applog::info("settings", format!("已保存设置  max_pages={}", next.max_pages));
    Ok(Json(settings::view(&next)))
}

async fn probe_runtime(
    State(st): State<AppState>,
) -> Result<Json<settings::SettingsView>, ApiError> {
    Ok(Json(settings::view(&st.settings.get()?)))
}

async fn export_snapshot(
    State(st): State<AppState>,
    Json(body): Json<ExportRequest>,
) -> Result<Json<crate::types::ExportResult>, ApiError> {
    let cfg = st.settings.get()?;
    let kind = BoardKind::parse(body.board.as_deref());
    block_in(move || {
        pipeline::export_snapshot(&cfg, kind, &body.format, std::path::Path::new(&body.path))
    })
    .await
    .map(Json)
}

async fn analyze_stock(
    State(st): State<AppState>,
    Json(request): Json<deepseek::AnalyzeRequest>,
) -> Result<Json<deepseek::AnalyzeResult>, ApiError> {
    let cfg = st.settings.get()?;
    block_in(move || deepseek::analyze_stock(&cfg, request))
        .await
        .map(Json)
}

#[derive(Deserialize, Default)]
struct LimitQuery {
    limit: Option<u32>,
}

#[derive(Deserialize)]
struct LogWriteBody {
    level: String,
    source: String,
    message: String,
}

async fn get_app_logs(Query(q): Query<LimitQuery>) -> Json<Vec<applog::LogEntry>> {
    let limit = q.limit.unwrap_or(500) as usize;
    Json(applog::snapshot(limit))
}

async fn get_app_log_path() -> Result<Json<Value>, ApiError> {
    let path = applog::log_path()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| ApiError::bad("日志文件尚未就绪"))?;
    Ok(Json(json!({ "path": path })))
}

async fn write_app_log(Json(body): Json<LogWriteBody>) -> StatusCode {
    applog::log(&body.level, &body.source, body.message);
    StatusCode::NO_CONTENT
}

async fn reveal_app_log() -> Result<Json<Value>, ApiError> {
    let path = applog::log_path()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| ApiError::bad("日志文件尚未就绪"))?;
    Ok(Json(json!({ "path": path })))
}

fn api_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/snapshot", get(get_snapshot))
        .route("/refresh/start", post(start_refresh))
        .route("/refresh/cancel", post(cancel_refresh))
        .route("/refresh/snapshot", get(refresh_snapshot))
        .route("/settings", get(get_settings).post(save_settings))
        .route("/runtime", get(probe_runtime))
        .route("/export", post(export_snapshot))
        .route("/analyze", post(analyze_stock))
        .route("/logs", get(get_app_logs).post(write_app_log))
        .route("/logs/path", get(get_app_log_path))
        .route("/logs/reveal", post(reveal_app_log))
}

pub async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let data_dir = workspace::data_dir();
    let dist = workspace::dist_dir();
    let port = workspace::listen_port();
    let settings_path = data_dir.join("settings.json");
    let log_path = data_dir.join("logs").join("gp-ladder.log");

    std::fs::create_dir_all(&data_dir)?;
    std::fs::create_dir_all(data_dir.join("logs"))?;

    applog::attach_path(log_path);
    let mut loaded = if settings_path.is_file() {
        settings::load_from_file(&settings_path)
    } else {
        settings::load_from_env()
    };
    if loaded.cache_path.trim().is_empty() {
        loaded.cache_path = data_dir.join("snapshot.json").to_string_lossy().into_owned();
    }
    applog::info(
        "app",
        format!(
            "连涨天梯 Web 已启动（内置抓取引擎）  port={}  cache={}",
            port, loaded.cache_path
        ),
    );

    let refresh = Arc::new(RefreshState::new());
    let _ = refresh::load_ladder(refresh.as_ref(), &loaded, BoardKind::Lxsz);
    let _ = refresh::load_ladder(refresh.as_ref(), &loaded, BoardKind::Zt);
    let _ = refresh::load_ladder(refresh.as_ref(), &loaded, BoardKind::Jjzt);

    let state = AppState {
        refresh,
        settings: Arc::new(SettingsState::new(loaded)),
        settings_path,
    };

    let mut app = Router::new().nest("/api", api_router());

    if dist.join("index.html").is_file() {
        let index = dist.join("index.html");
        let static_files = ServeDir::new(&dist).not_found_service(ServeFile::new(index));
        app = app.fallback_service(static_files);
    } else {
        applog::warn(
            "app",
            format!("未找到前端产物 {}，仅提供 /api", dist.display()),
        );
        app = app.fallback(|| async {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "前端尚未构建，请先 npm run build",
            )
        });
    }

    let app = app.with_state(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    println!("连涨天梯  http://0.0.0.0:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
