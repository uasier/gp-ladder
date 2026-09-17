use crate::applog;
use crate::board::BoardKind;
use crate::pipeline;
use crate::settings::AppSettings;
use crate::types::{RefreshEvent, Snapshot};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

pub type RefreshEmit = Arc<dyn Fn(&RefreshEvent) + Send + Sync>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshSnapshot {
    pub session_id: u64,
    /// idle | running | done | error | cancelled
    pub phase: String,
    pub progress: String,
    pub error: Option<String>,
    pub seq: u64,
}

impl Default for RefreshSnapshot {
    fn default() -> Self {
        Self {
            session_id: 0,
            phase: "idle".into(),
            progress: String::new(),
            error: None,
            seq: 0,
        }
    }
}

pub struct RefreshState {
    pub cancel: Mutex<Arc<AtomicBool>>,
    pub snapshot: Mutex<RefreshSnapshot>,
    pub lxsz: Mutex<Snapshot>,
    pub zt: Mutex<Snapshot>,
    pub jjzt: Mutex<Snapshot>,
    pub next_session: Mutex<u64>,
}

impl RefreshState {
    pub fn new() -> Self {
        Self {
            cancel: Mutex::new(Arc::new(AtomicBool::new(false))),
            snapshot: Mutex::new(RefreshSnapshot::default()),
            lxsz: Mutex::new(Snapshot::empty()),
            zt: Mutex::new(Snapshot::empty()),
            jjzt: Mutex::new(Snapshot::empty()),
            next_session: Mutex::new(0),
        }
    }

    pub fn job_snapshot(&self) -> RefreshSnapshot {
        self.snapshot
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn replace_ladder(&self, board: BoardKind, snap: Snapshot) {
        let slot = match board {
            BoardKind::Lxsz => &self.lxsz,
            BoardKind::Zt => &self.zt,
            BoardKind::Jjzt => &self.jjzt,
        };
        if let Ok(mut g) = slot.lock() {
            *g = snap;
        }
    }

    fn update<F: FnOnce(&mut RefreshSnapshot)>(&self, f: F) {
        if let Ok(mut g) = self.snapshot.lock() {
            f(&mut g);
            g.seq = g.seq.saturating_add(1);
        }
    }

    fn begin_session(&self) -> (u64, Arc<AtomicBool>) {
        let id = {
            let mut n = self.next_session.lock().expect("session lock");
            *n = n.saturating_add(1);
            *n
        };
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut slot) = self.cancel.lock() {
            slot.store(true, Ordering::SeqCst);
            *slot = Arc::clone(&flag);
        }
        self.update(|s| {
            *s = RefreshSnapshot {
                session_id: id,
                phase: "running".into(),
                progress: "正在刷新榜单…".into(),
                error: None,
                seq: s.seq,
            };
        });
        (id, flag)
    }
}

pub fn load_ladder(state: &RefreshState, settings: &AppSettings, board: BoardKind) -> Snapshot {
    let snap = pipeline::load_snapshot(settings, board);
    state.replace_ladder(board, snap.clone());
    snap
}

pub fn start_refresh(
    state: Arc<RefreshState>,
    settings: AppSettings,
    board: BoardKind,
    emit: Option<RefreshEmit>,
) -> Result<(), String> {
    let current = state.job_snapshot();
    if current.phase == "running" {
        return Ok(());
    }
    let (session_id, cancel) = state.begin_session();
    let emit_clone = emit.clone();
    let starting = match board {
        BoardKind::Lxsz => "正在抓取同花顺连涨榜…",
        BoardKind::Zt => "正在抓取涨停天梯…",
        BoardKind::Jjzt => "正在抓取昨日涨停今红…",
    };
    thread::Builder::new()
        .name(format!("gp-refresh-{session_id}"))
        .spawn(move || {
            run_refresh(state, settings, board, session_id, cancel, emit_clone);
        })
        .map_err(|e| format!("无法启动刷新线程: {e}"))?;
    if let Some(emit) = emit {
        emit(&RefreshEvent {
            session_id,
            phase: "running".into(),
            progress: starting.into(),
            error: None,
        });
    }
    Ok(())
}

fn run_refresh(
    state: Arc<RefreshState>,
    settings: AppSettings,
    board: BoardKind,
    session_id: u64,
    cancel: Arc<AtomicBool>,
    emit: Option<RefreshEmit>,
) {
    applog::info("refresh", format!("开始刷新{}（内置引擎）", board.title()));
    let emit_event = |phase: &str, progress: &str, error: Option<String>| {
        state.update(|s| {
            if s.session_id != session_id {
                return;
            }
            s.phase = phase.into();
            s.progress = progress.into();
            s.error = error.clone();
        });
        if let Some(emit) = &emit {
            emit(&RefreshEvent {
                session_id,
                phase: phase.into(),
                progress: progress.into(),
                error,
            });
        }
    };

    let result = pipeline::run_refresh(&settings, board, &cancel, |msg| {
        if !cancel.load(Ordering::SeqCst) {
            emit_event("running", msg, None);
        }
    });

    if cancel.load(Ordering::SeqCst) {
        emit_event("cancelled", "已取消", None);
        applog::warn("refresh", "刷新已取消");
        return;
    }
    match result {
        Ok(snap) => {
            state.replace_ladder(board, snap.clone());
            let progress = match &snap.updated_at {
                Some(ts) => format!("已更新 {} 只 · {ts}", snap.count),
                None => format!("已更新 {} 只", snap.count),
            };
            emit_event("done", &progress, None);
            applog::info("refresh", progress);
        }
        Err(err) if err == "已取消" => {
            emit_event("cancelled", "已取消", None);
            applog::warn("refresh", "刷新已取消");
        }
        Err(err) => {
            emit_event("error", "", Some(err.clone()));
            applog::error("refresh", err);
        }
    }
}

pub fn cancel_refresh(state: &RefreshState, emit: Option<&RefreshEmit>) -> Result<(), String> {
    if let Ok(flag) = state.cancel.lock() {
        flag.store(true, Ordering::SeqCst);
    }
    let session_id = state.job_snapshot().session_id;
    state.update(|s| {
        if s.phase == "running" {
            s.phase = "cancelled".into();
            s.progress = "已取消".into();
        }
    });
    if let Some(emit) = emit {
        emit(&RefreshEvent {
            session_id,
            phase: "cancelled".into(),
            progress: "已取消".into(),
            error: None,
        });
    }
    applog::warn("refresh", "用户取消刷新");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn begin_session_increments() {
        let state = RefreshState::new();
        let (a, _) = state.begin_session();
        let (b, _) = state.begin_session();
        assert_eq!(a, 1);
        assert_eq!(b, 2);
        assert_eq!(state.job_snapshot().phase, "running");
    }
}
