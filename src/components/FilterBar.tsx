import type { RefObject } from "react"
import type { FilterState, SortKey, ViewMode } from "../types"

type Props = {
  filters: FilterState
  industries: string[]
  visible: number
  total: number
  showReset: boolean
  onChange: (patch: Partial<FilterState>) => void
  onReset: () => void
  keywordRef: RefObject<HTMLInputElement | null>
  onOpenMoreFilters?: () => void
  activeMoreCount?: number
  showAllFilters: boolean
  onToggleAllFilters: () => void
}

export function FilterBar({
  filters,
  industries,
  visible,
  total,
  showReset,
  onChange,
  onReset,
  keywordRef,
  onOpenMoreFilters,
  activeMoreCount,
  showAllFilters,
  onToggleAllFilters,
}: Props) {
  const isFiltered = visible !== total

  return (
    <div className={`toolbar bar ${showAllFilters ? "expanded-bar" : "minimal-bar"}`}>
      {/* 稳定主搜索行 (无论展开与否，尺寸与坐标 100% 恒定稳定) */}
      <div className="filter-primary-row">
        <div className="search-box">
          <span className="search-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={keywordRef}
            type="search"
            placeholder="搜索股票简称 / 6位代码..."
            value={filters.keyword}
            onChange={(e) => onChange({ keyword: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
          {filters.keyword ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                onChange({ keyword: "" })
                keywordRef.current?.focus()
              }}
              title="清空搜索"
              aria-label="清空搜索"
            >
              ✕
            </button>
          ) : (
            <span className="search-kbd" title="按 / 键快速聚焦">
              <kbd>/</kbd>
            </span>
          )}
        </div>

        <div className="filter-primary-actions">
          {/* 结果数量胶囊 */}
          <div className={`filter-count-badge ${isFiltered ? "filtered" : ""}`}>
            <span className="count-dot" />
            <span className="count-label">{isFiltered ? "筛选展示" : "全部标的"}&nbsp;</span>
            <b>{visible}</b>
            <span className="count-total">/{total}</span>
          </div>

          {/* 切换展示全部筛选组件按钮 */}
          <button
            type="button"
            className={`btn-toggle-filters ${showAllFilters ? "active" : ""}`}
            onClick={onToggleAllFilters}
            title={showAllFilters ? "收起筛选组件，仅保留搜索框" : "展开全部筛选组件（行业/排序/卡片列表/高级筛选等）"}
            aria-expanded={showAllFilters}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span className="toggle-text-full">{showAllFilters ? "收起筛选" : "全部筛选"}</span>
            <span className="toggle-text-short">{showAllFilters ? "收起" : "筛选"}</span>
            <svg
              className={`toggle-arrow ${showAllFilters ? "up" : "down"}`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {isFiltered ? <span className="active-dot" title="当前有筛选生效中" /> : null}
          </button>
        </div>
      </div>

      {/* 展开次级筛选面板行 (独立成行，绝不挤压主搜索框) */}
      {showAllFilters ? (
        <div className="filter-expanded-row">
          <div className="filter-select-group">
            <select
              className="modern-select"
              value={filters.industry}
              onChange={(e) => onChange({ industry: e.target.value })}
              title="选择行业分类"
            >
              <option value="all">全部行业板块</option>
              {industries.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              className="modern-select"
              value={filters.sort}
              onChange={(e) => onChange({ sort: e.target.value as SortKey })}
              title="选择排序方式"
            >
              <option value="days">按 连板 / 连涨天数 ↓</option>
              <option value="pct">按 累计涨跌幅 ↓</option>
              <option value="todayPct">按 今日涨跌幅 ↓</option>
              <option value="avgPct">按 日均涨幅 ↓</option>
              <option value="avgTurnover">按 日均换手率 ↓</option>
              <option value="retail">按 散户指数（热度）↓</option>
              <option value="price">按 现价 ↓</option>
              <option value="close">按 榜单收盘价 ↓</option>
            </select>
          </div>

          {/* 视图模式切换 */}
          <div className="view-mode-toggle" role="group" aria-label="视图模式切换">
            <button
              type="button"
              className={filters.viewMode === "cards" ? "on" : ""}
              onClick={() => onChange({ viewMode: "cards" as ViewMode })}
              title="卡片阶梯视图 (快捷键 1)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span>卡片</span>
            </button>
            <button
              type="button"
              className={filters.viewMode === "list" ? "on" : ""}
              onClick={() => onChange({ viewMode: "list" as ViewMode })}
              title="列表对比视图 (快捷键 2)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="4" cy="6" r="1.5" fill="currentColor" />
                <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                <circle cx="4" cy="18" r="1.5" fill="currentColor" />
              </svg>
              <span>列表</span>
            </button>
          </div>

          {onOpenMoreFilters ? (
            <button
              type="button"
              className={`btn-more-filter ${activeMoreCount && activeMoreCount > 0 ? "is-active" : ""}`}
              onClick={onOpenMoreFilters}
              title="高级量化指标与精选规则"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>高级筛选</span>
              {activeMoreCount && activeMoreCount > 0 ? (
                <span className="filter-active-badge">
                  {activeMoreCount}
                </span>
              ) : null}
            </button>
          ) : null}

          {showReset ? (
            <button type="button" className="btn-reset-filter show" onClick={onReset} title="一键清空全部筛选条件">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>重置</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
