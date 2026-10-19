import type { BoardKind, SettingsView, UpdateCheck } from "../types"
import { RelativeTime } from "./RelativeTime"

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
  theme,
  onToggleTheme,
  update,
}: Props) {
  const boardSubtitle =
    board === "zt"
      ? "东方财富涨停池 · 连板接力"
      : board === "jjzt"
        ? "昨日涨停 · 今开2%–8% 弱转强"
        : "同花顺连涨池 · 动能多头"

  return (
    <header className="top-nav">
      <div className="brand-section">
        <div className="brand-badge" title="短线天梯工作台">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="m7 15 4-4 4 4 6-6" />
            <path d="M17 9h4v4" />
          </svg>
        </div>
        <div className="brand-title-wrap">
          <div className="brand-header-row">
            <h1>{board === "zt" ? "涨停天梯" : board === "jjzt" ? "昨日涨停" : "连涨天梯"}</h1>
            {settings?.version ? <span className="version-pill">v{settings.version}</span> : null}
          </div>
          <div className="brand-desc">{boardSubtitle}</div>
        </div>

        {/* 现代分段选择器 (Segmented Control) */}
        <div className="board-tabs" role="tablist" aria-label="行情榜单切换">
          <button
            type="button"
            role="tab"
            aria-selected={board === "lxsz"}
            className={board === "lxsz" ? "on" : ""}
            onClick={() => onBoardChange("lxsz")}
          >
            <span className="tab-dot" aria-hidden="true" />
            <span>连涨天梯</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={board === "zt"}
            className={board === "zt" ? "on" : ""}
            onClick={() => onBoardChange("zt")}
          >
            <span className="tab-dot" aria-hidden="true" />
            <span>涨停连板</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={board === "jjzt"}
            className={board === "jjzt" ? "on" : ""}
            onClick={() => onBoardChange("jjzt")}
          >
            <span className="tab-dot" aria-hidden="true" />
            <span>昨日涨停</span>
          </button>
        </div>
      </div>

      <div className="nav-actions">
        {/* DeepSeek 智能模型状态微胶囊 */}
        <button
          type="button"
          className={`provider-chip ${settings?.hasDeepseekKey ? "ok" : "warn"}`}
          onClick={onOpenSettings}
          title={
            settings?.hasDeepseekKey
              ? `AI 已就绪（模型: ${settings.deepseekModel || "deepseek-chat"}）点击配置`
              : "点击配置 DeepSeek API Key 开启 AI 分析"
          }
        >
          <span className="status-dot" aria-hidden="true" />
          <div className="chip-content">
            <span className="chip-title">DeepSeek</span>
            <span className="chip-sub">
              {settings?.hasDeepseekKey
                ? settings.deepseekModel || "已配置"
                : "未配置"}
            </span>
          </div>
        </button>

        {/* 刷新与时效面板 */}
        <div className="refresh-panel">
          <div className="refresh-meta">
            <span className="refresh-label">同步</span>
            <RelativeTime value={updatedAt} />
          </div>
          {refreshing ? (
            <button
              type="button"
              className="refresh-btn is-loading"
              onClick={onCancel}
              title="停止当前抓取"
            >
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
              title="重新抓取榜单与东财实时行情"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              <span>刷新行情</span>
            </button>
          )}
        </div>

        {/* 版本更新提醒 */}
        {update?.available ? (
          <button type="button" className="btn update-chip" onClick={onOpenAbout} title="发现新版本，点击查看">
            <span className="update-pulse-dot" />
            v{update.latestVersion}
          </button>
        ) : null}

        {/* 设置面板唤起 */}
        <button type="button" className="btn icon-btn" onClick={onOpenSettings} title="偏好设置 (S)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* 深浅主题切换 */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换为明亮浅色" : "切换为深邃暗夜"}
          aria-label="切换深浅主题"
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
