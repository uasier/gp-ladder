//! 内置刷新管线：本地行情库计算连涨和涨停连板，昨日涨停仍走涨停池。

use crate::board::BoardKind;
use crate::enrich;
use crate::format::now_stamp;
use crate::settings::AppSettings;
use crate::snapshot;
use crate::types::Snapshot;
use crate::jjzt;
use crate::market_db;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub fn cache_path(settings: &AppSettings, board: BoardKind) -> PathBuf {
    crate::settings::resolved_cache_path_for(settings, board)
}

pub fn run_refresh(
    settings: &AppSettings,
    board: BoardKind,
    cancel: &AtomicBool,
    on_progress: impl Fn(&str),
) -> Result<Snapshot, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("已取消".into());
    }
    let cache = cache_path(settings, board);
    let rows = match board {
        BoardKind::Lxsz => market_db::build_ladder(
            &market_db::db_dir_near(&cache),
            settings.max_pages,
            cancel,
            &on_progress,
        )?,
        BoardKind::Zt => market_db::build_limit_up(
            &market_db::db_dir_near(&cache),
            settings.max_pages,
            cancel,
            &on_progress,
        )?,
        BoardKind::Jjzt => {
            let (rows, date) = jjzt::crawl_yesterday_red(&on_progress)?;
            on_progress(&format!("昨日涨停池 {date}，共 {} 只，正在看今日竞价", rows.len()));
            rows
        }
    };
    if rows.is_empty() {
        return Err("未获取到榜单数据".into());
    }
    if cancel.load(Ordering::SeqCst) {
        return Err("已取消".into());
    }
    let mut rows = enrich::enrich_output_rows(rows, Some(cancel), &on_progress)?;
    if board == BoardKind::Jjzt {
        on_progress("筛选竞价后红盘且涨幅 2%–8%");
        rows = jjzt::keep_open_gain_2_to_8(rows);
        if rows.is_empty() {
            return Err("昨日涨停里，今日竞价后涨幅落在 2%–8% 的红盘暂无".into());
        }
    }
    on_progress("正在保存快照…");
    let updated = now_stamp();
    snapshot::save_cache(&cache, &rows, &updated)?;
    Ok(snapshot::build_snapshot(rows, Some(updated)))
}

pub fn load_snapshot(settings: &AppSettings, board: BoardKind) -> Snapshot {
    snapshot::load_cache(&cache_path(settings, board))
}

pub fn export_snapshot(
    settings: &AppSettings,
    board: BoardKind,
    format: &str,
    path: &Path,
) -> Result<crate::types::ExportResult, String> {
    crate::export::export_from_cache(&cache_path(settings, board), format, path)
}
