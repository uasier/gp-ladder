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
}: Props) {
  return (
    <div className="toolbar bar">
      <div className="search-box">
        <span className="search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref={keywordRef}
          type="search"
          placeholder="名称 / 代码"
          value={filters.keyword}
          onChange={(e) => onChange({ keyword: e.target.value })}
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
          <span className="search-kbd">/ 聚焦</span>
        )}
      </div>
      <select value={filters.industry} onChange={(e) => onChange({ industry: e.target.value })}>
        <option value="all">全部行业</option>
        {industries.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={filters.sort}
        onChange={(e) => onChange({ sort: e.target.value as SortKey })}
      >
        <option value="days">连涨天数 / 连板（高→低）</option>
        <option value="pct">累计涨跌幅（高→低）</option>
        <option value="todayPct">今日涨跌幅（高→低）</option>
        <option value="avgPct">平均涨幅/天（高→低）</option>
        <option value="avgTurnover">平均换手/天（高→低）</option>
        <option value="retail">散户指数（高→低）</option>
        <option value="price">现价（高→低）</option>
        <option value="close">收盘价（高→低）</option>
      </select>
      <div className="seg" role="group" aria-label="视图模式">
        <button
          type="button"
          className={filters.viewMode === "cards" ? "on" : ""}
          onClick={() => onChange({ viewMode: "cards" as ViewMode })}
          title="卡片视图 (按 1)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
          卡片
        </button>
        <button
          type="button"
          className={filters.viewMode === "list" ? "on" : ""}
          onClick={() => onChange({ viewMode: "list" as ViewMode })}
          title="列表视图 (按 2)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="1.5" fill="currentColor" />
            <circle cx="4" cy="12" r="1.5" fill="currentColor" />
            <circle cx="4" cy="18" r="1.5" fill="currentColor" />
          </svg>
          列表
        </button>
      </div>

      {onOpenMoreFilters ? (
        <button
          type="button"
          className={`btn-more-filter ${activeMoreCount && activeMoreCount > 0 ? "is-active" : ""}`}
          onClick={onOpenMoreFilters}
          title="高级筛选与精选规则"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>高级筛选</span>
          {activeMoreCount && activeMoreCount > 0 ? (
            <span className="badge" style={{ fontSize: 10, padding: "0 6px" }}>
              {activeMoreCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {showReset ? (
        <button type="button" className="btn-reset-filter show" onClick={onReset} title="重置当前所有筛选条件">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          重置筛选
        </button>
      ) : null}
      <div className="count">
        筛选结果 <b>{visible}</b> / {total} 只
      </div>
    </div>
  )
}
