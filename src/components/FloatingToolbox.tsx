import { useEffect, useRef, useState } from "react"
import type { SettingsView, UpdateCheck } from "../types"

type Props = {
  // 页面模块显隐开关
  showKpi: boolean
  onToggleKpi: () => void
  showQuickChips: boolean
  onToggleQuickChips: () => void
  showLogBar: boolean
  onToggleLogBar: () => void

  // 高级筛选与规则
  onOpenMoreFilters: () => void
  activeMoreCount: number

  // 数据导出
  onExport: (format: "html" | "csv" | "json") => void

  // 设置与更新
  onOpenSettings: () => void
  update: UpdateCheck | null
  onOpenAbout: () => void
  settings: SettingsView | null

  // 主题与回到顶部
  theme: "dark" | "light"
  onToggleTheme: () => void
  onScrollTop: () => void
  showBackTop: boolean
}

export function FloatingToolbox({
  showKpi,
  onToggleKpi,
  showQuickChips,
  onToggleQuickChips,
  showLogBar,
  onToggleLogBar,
  onOpenMoreFilters,
  activeMoreCount,
  onExport,
  onOpenSettings,
  update,
  onOpenAbout,
  settings,
  theme,
  onToggleTheme,
  onScrollTop,
  showBackTop,
}: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // 计算红点/徽章数量 (有新版本 或 有高级筛选生效)
  const totalBadges = (update?.available ? 1 : 0) + (activeMoreCount > 0 ? 1 : 0)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open])

  return (
    <>
      {open ? <div className="toolbox-mask" onClick={() => setOpen(false)} /> : null}
      <aside className="floating-toolbox-anchor" aria-label="悬浮辅助工具箱">
        {showBackTop ? (
          <button
            type="button"
            className="toolbox-back-top"
            onClick={onScrollTop}
            title="回到顶部"
            aria-label="回到顶部"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        ) : null}

        {/* 悬浮工具箱展开面板 */}
        {open ? (
          <div className="toolbox-panel" ref={panelRef} role="dialog" aria-label="工具箱面板">
            <header className="toolbox-header">
              <div className="toolbox-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  <line x1="12" y1="12" x2="12.01" y2="12" />
                </svg>
                <span>工具箱</span>
              </div>
              <button
                type="button"
                className="toolbox-close-btn"
                onClick={() => setOpen(false)}
                title="收起工具箱 (Esc)"
              >
                ✕
              </button>
            </header>

            <div className="toolbox-content">
              {/* 模块1: 页面显示收起开关 */}
              <div className="toolbox-group">
                <div className="toolbox-group-title">显示</div>
                <div className="toolbox-item-row">
                  <div className="toolbox-item-info">
                    <span className="toolbox-item-name">📊 指标卡</span>
                  </div>
                  <label className="switch">
                    <input type="checkbox" aria-label="显示指标卡" checked={showKpi} onChange={onToggleKpi} />
                    <span className="slider" />
                  </label>
                </div>
                <div className="toolbox-item-row">
                  <div className="toolbox-item-info">
                    <span className="toolbox-item-name">⚡️ 快捷筛选</span>
                  </div>
                  <label className="switch">
                    <input type="checkbox" aria-label="显示快捷筛选" checked={showQuickChips} onChange={onToggleQuickChips} />
                    <span className="slider" />
                  </label>
                </div>
                <div className="toolbox-item-row">
                  <div className="toolbox-item-info">
                    <span className="toolbox-item-name">📜 运行日志</span>
                  </div>
                  <label className="switch">
                    <input type="checkbox" aria-label="显示运行日志" checked={showLogBar} onChange={onToggleLogBar} />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              {/* 模块2: 高级筛选与精选 */}
              <div className="toolbox-group">
                <div className="toolbox-group-title">数据</div>
                <button
                  type="button"
                  className="toolbox-action-btn"
                  onClick={() => {
                    setOpen(false)
                    onOpenMoreFilters()
                  }}
                >
                  <span className="toolbox-btn-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </span>
                  <span className="toolbox-btn-text">高级筛选</span>
                  {activeMoreCount > 0 ? (
                    <span className="badge" style={{ marginLeft: "auto" }}>
                      {activeMoreCount} 项生效
                    </span>
                  ) : null}
                </button>

                {/* 导出子菜单 */}
                <div className="toolbox-sub-actions">
                  <span className="toolbox-sub-title">导出榜单</span>
                  <div className="toolbox-btn-group">
                    <button
                      type="button"
                      className="toolbox-mini-btn"
                      onClick={() => {
                        setOpen(false)
                        onExport("html")
                      }}
                      title="导出自包含的交互式天梯 HTML 网页"
                    >
                      HTML 单页
                    </button>
                    <button
                      type="button"
                      className="toolbox-mini-btn"
                      onClick={() => {
                        setOpen(false)
                        onExport("csv")
                      }}
                      title="导出 CSV 电子表格"
                    >
                      CSV 表格
                    </button>
                    <button
                      type="button"
                      className="toolbox-mini-btn"
                      onClick={() => {
                        setOpen(false)
                        onExport("json")
                      }}
                      title="导出结构化 JSON 数据"
                    >
                      JSON
                    </button>
                  </div>
                </div>
              </div>

              {/* 模块3: 系统与偏好 */}
              <div className="toolbox-group">
                <div className="toolbox-group-title">偏好</div>
                <button
                  type="button"
                  className="toolbox-action-btn"
                  onClick={() => {
                    setOpen(false)
                    onOpenSettings()
                  }}
                >
                  <span className="toolbox-btn-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </span>
                  <span className="toolbox-btn-text">
                    设置
                  </span>
                  <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
                    {settings?.hasDeepseekKey ? "AI 已配置" : "AI 未配置"}
                  </span>
                </button>

                <button
                  type="button"
                  className="toolbox-action-btn"
                  onClick={onToggleTheme}
                >
                  <span className="toolbox-btn-icon">
                    {theme === "dark" ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" />
                        <line x1="21" y1="12" x2="23" y2="12" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                    )}
                  </span>
                  <span className="toolbox-btn-text">
                    {theme === "dark" ? "切换浅色" : "切换深色"}
                  </span>
                </button>

                {update?.available ? (
                  <button
                    type="button"
                    className="toolbox-action-btn"
                    style={{ color: "var(--gold)" }}
                    onClick={() => {
                      setOpen(false)
                      onOpenAbout()
                    }}
                  >
                    <span className="toolbox-btn-icon">⭐️</span>
                    <span className="toolbox-btn-text">发现新版本 v{update.latestVersion}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* 触发悬浮按钮 (FAB) */}
        <button
          type="button"
          className={`toolbox-fab ${open ? "is-active" : ""}`}
          onClick={() => setOpen(!open)}
          title="打开工具箱"
          aria-label="打开悬浮工具箱"
          aria-expanded={open}
        >
          <span className="toolbox-fab-icon-wrap">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              <line x1="12" y1="12" x2="12.01" y2="12" />
            </svg>
          </span>
          <span className="toolbox-fab-text">工具箱</span>
          {totalBadges > 0 ? <span className="toolbox-badge-dot" /> : null}
        </button>
      </aside>
    </>
  )
}
