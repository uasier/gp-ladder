import type { BoardKind, SettingsView, UpdateCheck } from "../types"

type Props = {
  settings: SettingsView | null
  board: BoardKind
  onBoardChange: (board: BoardKind) => void
  updatedAt: string | null
  refreshing: boolean
  onRefresh: () => void
  onCancel: () => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onExport: (format: "html" | "csv" | "json") => void
  theme: "dark" | "light"
  onToggleTheme: () => void
  update: UpdateCheck | null
}

export function Toolbar({
  settings,
  board,
  onBoardChange,
  updatedAt,
  refreshing,
  onRefresh,
  onCancel,
  onOpenSettings,
  onOpenAbout,
  onExport,
  theme,
  onToggleTheme,
  update,
}: Props) {
  return (
    <header className="top-nav">
      <div className="brand-section">
        <div className="brand-badge" title="连涨天梯 工作台">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        <div className="brand-title-wrap">
          <div className="brand-header-row">
            <h1>{board === "zt" ? "涨停天梯" : board === "jjzt" ? "昨日涨停" : "连涨天梯"}</h1>
            {settings?.version ? <span className="version-pill">v{settings.version}</span> : null}
          </div>
          <div className="brand-desc">
            {board === "zt"
              ? "东方财富涨停池"
              : board === "jjzt"
                ? "昨日涨停 · 今开涨幅 2%–8%"
                : "同花顺连涨榜"}
          </div>
        </div>
        <div className="board-tabs" role="tablist" aria-label="行情榜单切换">
          <button
            type="button"
            role="tab"
            aria-selected={board === "lxsz"}
            className={board === "lxsz" ? "on" : ""}
            onClick={() => onBoardChange("lxsz")}
          >
            连涨
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={board === "zt"}
            className={board === "zt" ? "on" : ""}
            onClick={() => onBoardChange("zt")}
          >
            涨停
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={board === "jjzt"}
            className={board === "jjzt" ? "on" : ""}
            onClick={() => onBoardChange("jjzt")}
          >
            昨涨
          </button>
        </div>
      </div>
      <div className="nav-actions">
        <button
          type="button"
          className="provider-chip ok"
          onClick={onOpenSettings}
          title={
            settings?.hasDeepseekKey
              ? "右键或长按股票可分析"
              : "设置 API Key 后可分析"
          }
        >
          <span className="status-dot" aria-hidden="true" />
          <div className="chip-content">
            <span className="chip-title">DeepSeek</span>
            <span className="chip-sub">
              {settings?.hasDeepseekKey ? "已配置" : "未配置"}
            </span>
          </div>
        </button>
        <div className="refresh-panel">
          <div className="refresh-meta">
            <span className="refresh-label">上次刷新</span>
            <time>{updatedAt || "尚未刷新"}</time>
          </div>
          {refreshing ? (
            <button type="button" className="refresh-btn is-loading" onClick={onCancel} title="停止抓取">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>停止</span>
            </button>
          ) : (
            <button
              type="button"
              className="refresh-btn"
              onClick={onRefresh}
              title="重新抓取榜单和东方财富实时行情"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              <span>刷新实时数据</span>
            </button>
          )}
        </div>
        <div className="export-select-wrap">
          <span className="export-icon-prefix">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </span>
          <select
            className="export-select"
            value=""
            onChange={(e) => {
              const v = e.target.value as "html" | "csv" | "json" | ""
              e.target.value = ""
              if (v) onExport(v)
            }}
            title="导出当前榜单数据"
          >
            <option value="" disabled>
              导出数据
            </option>
            <option value="html">HTML 天梯单页</option>
            <option value="csv">CSV 表格</option>
            <option value="json">JSON 数据</option>
          </select>
          <svg className="export-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {update?.available ? (
          <button type="button" className="btn update-chip" onClick={onOpenAbout} title="发现新版本">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            有更新 v{update.latestVersion}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onOpenSettings} title="打开设置面板">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          设置
        </button>
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换为浅色模式" : "切换为深色模式"}
          aria-label="切换深浅主题"
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
