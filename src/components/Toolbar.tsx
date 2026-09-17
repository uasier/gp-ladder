import type { BoardKind, SettingsView } from "../types"

type Props = {
  settings: SettingsView | null
  board: BoardKind
  onBoardChange: (board: BoardKind) => void
  updatedAt: string | null
  refreshing: boolean
  onRefresh: () => void
  onCancel: () => void
  onOpenSettings: () => void
  onExport: (format: "html" | "csv" | "json") => void
  theme: "dark" | "light"
  onToggleTheme: () => void
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
  onExport,
  theme,
  onToggleTheme,
}: Props) {
  return (
    <header className="top-nav">
      <div className="brand-section">
        <div className="brand-badge">
          <svg viewBox="0 0 24 24">
            <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
          </svg>
        </div>
        <div className="brand-title-wrap">
          <h1>
            {board === "zt" ? "涨停天梯" : board === "jjzt" ? "昨日涨停" : "连涨天梯"}
          </h1>
          <div className="brand-desc">
            {board === "zt"
              ? "A股涨停连板梯队 · 东方财富涨停池"
              : board === "jjzt"
                ? "昨天涨停 · 今日竞价后红盘 2%–8%"
                : "A股同花顺强势连涨动能追踪仪表盘"}
          </div>
          <div className="board-tabs">
            <button
              type="button"
              className={board === "lxsz" ? "on" : ""}
              onClick={() => onBoardChange("lxsz")}
            >
              连涨
            </button>
            <button
              type="button"
              className={board === "zt" ? "on" : ""}
              onClick={() => onBoardChange("zt")}
            >
              涨停
            </button>
            <button
              type="button"
              className={board === "jjzt" ? "on" : ""}
              onClick={() => onBoardChange("jjzt")}
            >
              昨涨
            </button>
          </div>
        </div>
      </div>
      <div className="nav-actions">
        <button
          type="button"
          className="provider-chip ok"
          onClick={onOpenSettings}
          title={
            settings?.hasDeepseekKey
              ? "抓取内置；DeepSeek 已配置，可右键分析股票"
              : "抓取内置；右键分析前请在设置中填写 DeepSeek API Key"
          }
        >
          <span>内置引擎</span>
          <span className="muted">
            {settings?.hasDeepseekKey ? "DeepSeek 已配置" : "DeepSeek 未配置"}
            {settings?.maxPages ? ` · 最多 ${settings.maxPages} 页` : " · 全量翻页"}
          </span>
        </button>
        <div className="refresh-panel">
          <div className="refresh-meta">
            <span className="refresh-label">数据刷新时间</span>
            <time>{updatedAt || "尚未刷新"}</time>
          </div>
          {refreshing ? (
            <button type="button" className="refresh-btn is-loading" onClick={onCancel}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              <span className="refresh-btn-label">停止</span>
            </button>
          ) : (
            <button
              type="button"
              className="refresh-btn"
              onClick={onRefresh}
              title="在软件内重新抓取同花顺榜单和东方财富实时行情"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
                <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
              </svg>
              <span className="refresh-btn-label">刷新实时数据</span>
            </button>
          )}
        </div>
        <label className="export-wrap">
          <span className="sr-only">导出</span>
          <select
            className="export-select"
            value=""
            onChange={(e) => {
              const v = e.target.value as "html" | "csv" | "json" | ""
              e.target.value = ""
              if (v) onExport(v)
            }}
          >
            <option value="" disabled>
              导出
            </option>
            <option value="html">HTML 天梯页</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <button type="button" className="btn" onClick={onOpenSettings}>
          设置
        </button>
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title="切换深色/浅色主题"
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24">
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
            <svg viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}


