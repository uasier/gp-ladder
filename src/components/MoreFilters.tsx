import { useEffect } from "react"
import { DEFAULT_HIGHLIGHT, type FilterState, type HighlightRule } from "../types"
import { toNullableNumber } from "../stock"

type Props = {
  open: boolean
  onClose: () => void
  filters: FilterState
  rule: HighlightRule
  onChange: (patch: Partial<FilterState>) => void
  onRuleChange: (patch: Partial<HighlightRule>) => void
}

function numInput(
  value: number | null,
  onValue: (v: number | null) => void,
  extra: { step?: string; min?: string; placeholder?: string; label?: string } = {},
) {
  return (
    <input
      type="number"
      step={extra.step ?? "0.1"}
      min={extra.min}
      placeholder={extra.placeholder}
      aria-label={extra.label}
      value={value ?? ""}
      onChange={(e) => onValue(toNullableNumber(e.target.value))}
    />
  )
}

export function MoreFilters({ open, onClose, filters, rule, onChange, onRuleChange }: Props) {
  const activeCount = [
    filters.pctRange !== "all",
    filters.turnoverRange !== "all",
    filters.volumeRatioMin != null || filters.volumeRatioMax != null,
    filters.pctTotalMin != null || filters.pctTotalMax != null,
    filters.todayPctMin != null || filters.todayPctMax != null,
    filters.priceRange !== "all",
    filters.priceMin != null || filters.priceMax != null,
    filters.turnTotalMin != null || filters.turnTotalMax != null,
    filters.retailRange !== "all",
    filters.retailMin != null || filters.retailMax != null,
  ].filter(Boolean).length

  function resetMoreFilters() {
    onChange({
      pctRange: "all",
      turnoverRange: "all",
      volumeRatioMin: null,
      volumeRatioMax: null,
      pctTotalMin: null,
      pctTotalMax: null,
      todayPctMin: null,
      todayPctMax: null,
      priceRange: "all",
      priceMin: null,
      priceMax: null,
      turnTotalMin: null,
      turnTotalMax: null,
      retailRange: "all",
      retailMin: null,
      retailMax: null,
    })
  }

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal more-filters-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-filters-title"
      >
        <header className="modal-header">
          <div className="modal-title-wrap">
            <h3 id="more-filters-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>高级筛选</span>
              {activeCount > 0 ? (
                <span className="badge" style={{ fontSize: 11, padding: "1px 8px" }}>
                  {activeCount} 项已生效
                </span>
              ) : null}
            </h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭高级筛选 (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body more-filters-body">
          <div className="more-filters-section-title">涨幅与股价</div>
          <section className="filters modal-filters-grid">
            <div className="filter-item">
              <label>平均涨幅</label>
              <select value={filters.pctRange} onChange={(e) => onChange({ pctRange: e.target.value })}>
                <option value="all">全部平均涨幅</option>
                <option value="0-5">0% - 5%</option>
                <option value="5-10">5% - 10%</option>
                <option value="10-15">10% - 15%</option>
                <option value="15+">15%+</option>
              </select>
            </div>
            <div className="filter-item">
              <label>累计涨跌幅（%）</label>
              <div className="filter-range">
                {numInput(filters.pctTotalMin, (v) => onChange({ pctTotalMin: v }), { placeholder: "最小" })}
                <span>～</span>
                {numInput(filters.pctTotalMax, (v) => onChange({ pctTotalMax: v }), { placeholder: "最大" })}
              </div>
            </div>
            <div className="filter-item">
              <label>今日涨跌幅（%）</label>
              <div className="filter-range">
                {numInput(filters.todayPctMin, (v) => onChange({ todayPctMin: v }), { placeholder: "最小" })}
                <span>～</span>
                {numInput(filters.todayPctMax, (v) => onChange({ todayPctMax: v }), { placeholder: "最大" })}
              </div>
            </div>
            <div className="filter-item">
              <label>股价区间</label>
              <select value={filters.priceRange} onChange={(e) => onChange({ priceRange: e.target.value })}>
                <option value="all">全部股价</option>
                <option value="0-10">10 元以下</option>
                <option value="10-20">10 – 20 元</option>
                <option value="20-50">20 – 50 元</option>
                <option value="50-100">50 – 100 元</option>
                <option value="100+">100 元以上</option>
              </select>
            </div>
            <div className="filter-item">
              <label>自定义股价（元）</label>
              <div className="filter-range">
                {numInput(filters.priceMin, (v) => onChange({ priceMin: v }), { step: "0.01", min: "0", placeholder: "最低价" })}
                <span>～</span>
                {numInput(filters.priceMax, (v) => onChange({ priceMax: v }), { step: "0.01", min: "0", placeholder: "最高价" })}
              </div>
            </div>
          </section>

          <div className="more-filters-section-title" style={{ marginTop: 20 }}>
            换手、量比与资金
          </div>
          <section className="filters modal-filters-grid">
            <div className="filter-item">
              <label>平均换手率</label>
              <select
                value={filters.turnoverRange}
                onChange={(e) => onChange({ turnoverRange: e.target.value })}
              >
                <option value="all">全部平均换手率</option>
                <option value="0-5">0% - 5%</option>
                <option value="5-10">5% - 10%</option>
                <option value="10-20">10% - 20%</option>
                <option value="20+">20%+</option>
              </select>
            </div>
            <div className="filter-item">
              <label>量比区间（倍）</label>
              <div className="filter-range" role="group" aria-label="量比区间">
                {numInput(filters.volumeRatioMin, (v) => onChange({ volumeRatioMin: v }), {
                  step: "0.01", min: "0", placeholder: "最小量比", label: "最小量比",
                })}
                <span>～</span>
                {numInput(filters.volumeRatioMax, (v) => onChange({ volumeRatioMax: v }), {
                  step: "0.01", min: "0", placeholder: "最大量比", label: "最大量比",
                })}
              </div>
              <small className="muted">含边界 · 留空不限 · 筛选时排除缺失值</small>
              {filters.volumeRatioMin != null && filters.volumeRatioMax != null &&
                filters.volumeRatioMin > filters.volumeRatioMax ? (
                  <small className="up" role="status">最小量比不能大于最大量比</small>
                ) : null}
            </div>
            <div className="filter-item">
              <label>累计换手率（%）</label>
              <div className="filter-range">
                {numInput(filters.turnTotalMin, (v) => onChange({ turnTotalMin: v }), { placeholder: "最小" })}
                <span>～</span>
                {numInput(filters.turnTotalMax, (v) => onChange({ turnTotalMax: v }), { placeholder: "最大" })}
              </div>
            </div>
            <div className="filter-item">
              <label>散户指数</label>
              <select value={filters.retailRange} onChange={(e) => onChange({ retailRange: e.target.value })}>
                <option value="all">全部散户指数</option>
                <option value="out">净流出（&lt; 0%）</option>
                <option value="-5-0">-5% ~ 0%</option>
                <option value="0-5">0% ~ 5%</option>
                <option value="5-10">5% ~ 10%</option>
                <option value="10+">10%+</option>
                <option value="in">净流入（&gt; 0%）</option>
              </select>
            </div>
            <div className="filter-item">
              <label>自定义散户指数（%）</label>
              <div className="filter-range">
                {numInput(filters.retailMin, (v) => onChange({ retailMin: v }), { placeholder: "最小" })}
                <span>～</span>
                {numInput(filters.retailMax, (v) => onChange({ retailMax: v }), { placeholder: "最大" })}
              </div>
            </div>
          </section>

          <div className="more-filters-section-title" style={{ marginTop: 20 }}>
            ⭐️ 精选规则
          </div>
          <section className="highlight-rule-box">
            <div className="rule-box-header">
              <span className="rule-box-hint">
                满足全部条件即为精选
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: "3px 10px", fontSize: 11 }}
                onClick={() => onRuleChange(DEFAULT_HIGHLIGHT)}
                title="恢复为系统默认阈值"
              >
                恢复默认规则
              </button>
            </div>
            <div className="rule-inputs-row">
              <div className="filter-item">
                <label>散户指数上限</label>
                <div className="filter-range">
                  <span>&lt;</span>
                  <input
                    type="number"
                    step="0.1"
                    value={rule.retailMax}
                    onChange={(e) => onRuleChange({ retailMax: Number(e.target.value) })}
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="filter-item">
                <label>当日换手率上限</label>
                <div className="filter-range">
                  <span>&lt;</span>
                  <input
                    type="number"
                    step="0.1"
                    value={rule.todayTurnoverMax}
                    onChange={(e) => onRuleChange({ todayTurnoverMax: Number(e.target.value) })}
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="filter-item">
                <label>平均日涨幅下限</label>
                <div className="filter-range">
                  <span>&gt;</span>
                  <input
                    type="number"
                    step="0.1"
                    value={rule.avgPctMin}
                    onChange={(e) => onRuleChange({ avgPctMin: Number(e.target.value) })}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="modal-footer" style={{ justifyContent: "space-between" }}>
          <div>
            {activeCount > 0 ? (
              <button
                type="button"
                className="btn danger"
                style={{ fontSize: 12, padding: "6px 14px" }}
                onClick={resetMoreFilters}
              >
                重置高级筛选 ({activeCount})
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 13, padding: "6px 20px" }}
              onClick={onClose}
            >
              完成
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
