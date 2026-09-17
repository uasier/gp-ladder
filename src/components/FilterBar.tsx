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
          placeholder="搜索名称 / 股票代码..."
          value={filters.keyword}
          onChange={(e) => onChange({ keyword: e.target.value })}
        />
        <span className="search-kbd">/ 聚焦</span>
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
        <option value="days">连涨天数（高→低）</option>
        <option value="pct">累计涨跌幅（高→低）</option>
        <option value="todayPct">今日涨跌幅（高→低）</option>
        <option value="avgPct">平均涨幅/天（高→低）</option>
        <option value="avgTurnover">平均换手/天（高→低）</option>
        <option value="retail">散户指数（高→低）</option>
        <option value="price">现价（高→低）</option>
        <option value="close">收盘价（高→低）</option>
      </select>
      <div className="seg">
        <button
          type="button"
          className={filters.viewMode === "cards" ? "on" : ""}
          onClick={() => onChange({ viewMode: "cards" as ViewMode })}
        >
          卡片
        </button>
        <button
          type="button"
          className={filters.viewMode === "list" ? "on" : ""}
          onClick={() => onChange({ viewMode: "list" as ViewMode })}
        >
          列表
        </button>
      </div>
      {showReset ? (
        <button type="button" className="btn-reset-filter show" onClick={onReset}>
          重置
        </button>
      ) : null}
      <div className="count">
        符合条件 <b>{visible}</b> / {total} 只
      </div>
    </div>
  )
}
