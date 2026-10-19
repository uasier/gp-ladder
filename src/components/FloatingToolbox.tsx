import { useEffect, useRef, useState } from "react"
import type { FilterState, SettingsView, SortKey, UpdateCheck, ViewMode } from "../types"

type Props = {
  // 页面筛选组件展开状态
  showAllFilters: boolean
  onToggleAllFilters: () => void

  // 页面辅助模块开关
  showKpi: boolean
  onToggleKpi: () => void
  showLogBar: boolean
  onToggleLogBar: () => void

  // 筛选与排序直接调配
  filters: FilterState
  onChangeFilters: (patch: Partial<FilterState>) => void
  industries: string[]
  onResetFilters: () => void
  hasActiveFilters: boolean

  // 高级筛选与规则
  onOpenMoreFilters: () => void
  activeMoreCount: number

  // AI 选股使用当前筛选结果
  pickCandidateCount: number
  pickLoading: boolean
  onPickStocks: () => void
  hasPickHistory: boolean
  onViewPick: () => void

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
  showAllFilters,
  onToggleAllFilters,
  showKpi,
  onToggleKpi,
  showLogBar,
  onToggleLogBar,
  filters,
  onChangeFilters,
  industries,
  onResetFilters,
  hasActiveFilters,
  onOpenMoreFilters,
  activeMoreCount,
  pickCandidateCount,
  pickLoading,
  onPickStocks,
  hasPickHistory,
  onViewPick,
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

  // 计算红点/徽章数量 (有新版本 或 有筛选/高级筛选生效)
  const totalBadges =
    (update?.available ? 1 : 0) + (activeMoreCount > 0 ? 1 : 0) + (hasActiveFilters ? 1 : 0)

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
                <span>短线工具箱</span>
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
              <div className="toolbox-group">
                <button
                  type="button"
                  className="toolbox-action-btn primary-action toolbox-stock-pick"
                  disabled={!pickLoading && pickCandidateCount === 0}
                  onClick={() => {
                    setOpen(false)
                    onPickStocks()
                  }}
                >
                  <span className="toolbox-btn-icon" aria-hidden="true">✦</span>
                  <span className="toolbox-btn-text">
                    <strong>{pickLoading ? "查看选股进度" : "AI 快速选股"}</strong>
                    <small>{pickLoading ? "DeepSeek 正在分析本次候选" : pickCandidateCount ? `从当前 ${pickCandidateCount} 只中选出 ${Math.min(4, pickCandidateCount)} 只` : "当前无候选股票"}</small>
                  </span>
                </button>
                {hasPickHistory && !pickLoading ? (
                  <button
                    type="button"
                    className="toolbox-reset-link toolbox-pick-history"
                    onClick={() => { setOpen(false); onViewPick() }}
                  >
                    查看上次选股
                  </button>
                ) : null}
              </div>
              {/* 模块1: 筛选与排序核心调配 (全功能收纳在此) */}
              <div className="toolbox-group">
                <div className="toolbox-group-title">
                  <span>筛选与视图控制</span>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      className="toolbox-reset-link"
                      onClick={onResetFilters}
                      title="重置当前所有生效的筛选条件"
                    >
                      清空筛选
                    </button>
                  ) : null}
                </div>

                {/* 视图模式与顶部筛选展开开关 */}
                <div className="toolbox-item-row">
                  <div className="toolbox-item-info">
                    <span className="toolbox-item-name">🗂 顶部全套筛选栏</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      aria-label="展开顶部全套筛选栏"
                      checked={showAllFilters}
                      onChange={onToggleAllFilters}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="toolbox-control-row">
                  <span className="toolbox-control-label">视图模式</span>
                  <div className="toolbox-seg-group">
                    <button
                      type="button"
                      className={filters.viewMode === "cards" ? "on" : ""}
                      onClick={() => onChangeFilters({ viewMode: "cards" as ViewMode })}
                    >
                      卡片
                    </button>
                    <button
                      type="button"
                      className={filters.viewMode === "list" ? "on" : ""}
                      onClick={() => onChangeFilters({ viewMode: "list" as ViewMode })}
                    >
                      列表
                    </button>
                  </div>
                </div>

                {/* 排序方式下拉 */}
                <div className="toolbox-control-row">
                  <span className="toolbox-control-label">榜单排序</span>
                  <select
                    className="toolbox-select"
                    value={filters.sort}
                    onChange={(e) => onChangeFilters({ sort: e.target.value as SortKey })}
                  >
                    <option value="days">连板 / 连涨天数 ↓</option>
                    <option value="pct">累计涨跌幅 ↓</option>
                    <option value="todayPct">今日涨跌幅 ↓</option>
                    <option value="avgPct">日均涨幅 ↓</option>
                    <option value="avgTurnover">日均换手率 ↓</option>
                    <option value="retail">散户指数 (热度) ↓</option>
                    <option value="price">最新现价 ↓</option>
                  </select>
                </div>

                {/* 行业板块快速选择 */}
                <div className="toolbox-control-row">
                  <span className="toolbox-control-label">行业板块</span>
                  <select
                    className="toolbox-select"
                    value={filters.industry}
                    onChange={(e) => onChangeFilters({ industry: e.target.value })}
                  >
                    <option value="all">全部行业板块</option>
                    {industries.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 快捷精选芯片行 */}
                <div className="toolbox-chips-block">
                  <span className="toolbox-control-label">快捷精选</span>
                  <div className="toolbox-chips-wrap">
                    <button
                      type="button"
                      className={`toolbox-chip ${filters.excludeSt ? "on" : ""}`}
                      onClick={() => onChangeFilters({ excludeSt: !filters.excludeSt })}
                    >
                      非 ST
                    </button>
                    <button
                      type="button"
                      className={`toolbox-chip gold ${filters.onlyHighlight ? "on" : ""}`}
                      onClick={() => onChangeFilters({ onlyHighlight: !filters.onlyHighlight })}
                    >
                      ⭐️ 仅精选
                    </button>
                    <button
                      type="button"
                      className={`toolbox-chip ${filters.todayPctMin === 0 ? "on" : ""}`}
                      onClick={() => onChangeFilters({ todayPctMin: filters.todayPctMin === 0 ? null : 0 })}
                    >
                      📈 今日红盘
                    </button>
                    <button
                      type="button"
                      className={`toolbox-chip ${filters.retailRange === "out" ? "on" : ""}`}
                      onClick={() =>
                        onChangeFilters({ retailRange: filters.retailRange === "out" ? "all" : "out" })
                      }
                    >
                      🌊 散户净流出
                    </button>
                    <button
                      type="button"
                      className={`toolbox-chip ${filters.nearDayHigh ? "on" : ""}`}
                      onClick={() => onChangeFilters({ nearDayHigh: !filters.nearDayHigh })}
                    >
                      ⚡️ 现价近最高
                    </button>
                  </div>
                </div>

                {/* 打开高级量化筛选弹窗 */}
                <button
                  type="button"
                  className="toolbox-action-btn primary-action"
                  onClick={() => {
                    setOpen(false)
                    onOpenMoreFilters()
                  }}
                >
                  <span className="toolbox-btn-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </span>
                  <span className="toolbox-btn-text">高级量化指标与精选规则</span>
                  {activeMoreCount > 0 ? (
                    <span className="badge" style={{ marginLeft: "auto" }}>
                      {activeMoreCount} 项生效
                    </span>
                  ) : null}
                </button>
              </div>

              {/* 模块2: 辅助显示模块 */}
              <div className="toolbox-group">
                <div className="toolbox-group-title">辅助面板</div>
                <div className="toolbox-item-row">
                  <div className="toolbox-item-info">
                    <span className="toolbox-item-name">📊 行情概览指标卡</span>
                  </div>
                  <label className="switch">
                    <input type="checkbox" aria-label="显示指标卡" checked={showKpi} onChange={onToggleKpi} />
                    <span className="slider" />
                  </label>
                </div>
                <div className="toolbox-item-row">
                  <div className="toolbox-item-info">
                    <span className="toolbox-item-name">📜 系统运行日志</span>
                  </div>
                  <label className="switch">
                    <input type="checkbox" aria-label="显示运行日志" checked={showLogBar} onChange={onToggleLogBar} />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              {/* 模块3: 导出与系统 */}
              <div className="toolbox-group">
                <div className="toolbox-group-title">数据与系统</div>
                <div className="toolbox-sub-actions">
                  <span className="toolbox-sub-title">导出当前榜单</span>
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
                  <span className="toolbox-btn-text">系统与模型设置</span>
                  <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
                    {settings?.hasDeepseekKey ? "AI 已就绪" : "未配置"}
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
                    {theme === "dark" ? "切换明亮浅色" : "切换深邃暗夜"}
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
          title="打开短线工具箱"
          aria-label="打开短线工具箱"
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
