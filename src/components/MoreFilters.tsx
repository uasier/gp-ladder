import { DEFAULT_HIGHLIGHT, type FilterState, type HighlightRule } from "../types"
import { toNullableNumber } from "../stock"

type Props = {
  filters: FilterState
  rule: HighlightRule
  onChange: (patch: Partial<FilterState>) => void
  onRuleChange: (patch: Partial<HighlightRule>) => void
}

function numInput(
  value: number | null,
  onValue: (v: number | null) => void,
  extra: { step?: string; min?: string; placeholder?: string } = {},
) {
  return (
    <input
      type="number"
      step={extra.step ?? "0.1"}
      min={extra.min}
      placeholder={extra.placeholder}
      value={value ?? ""}
      onChange={(e) => onValue(toNullableNumber(e.target.value))}
    />
  )
}

export function MoreFilters({ filters, rule, onChange, onRuleChange }: Props) {
  const activeCount = [
    filters.pctRange !== "all",
    filters.turnoverRange !== "all",
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

  return (
    <details className="more-filters">
      <summary>
        <div className="summary-left">
          <svg className="summary-arrow" viewBox="0 0 24 24">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
          <span>更多高级筛选与精选条件</span>
          {activeCount > 0 ? (
            <span className="badge" style={{ fontSize: 11, padding: "1px 7px" }}>
              {activeCount} 项已生效
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: "normal" }}>
            涨跌幅、换手率区间与主力散户模型
          </span>
        </div>
      </summary>
      <section className="filters">
        <div className="filter-item">
          <label>平均涨幅区间</label>
          <select value={filters.pctRange} onChange={(e) => onChange({ pctRange: e.target.value })}>
            <option value="all">全部平均涨幅</option>
            <option value="0-5">0% - 5%</option>
            <option value="5-10">5% - 10%</option>
            <option value="10-15">10% - 15%</option>
            <option value="15+">15%+</option>
          </select>
        </div>
        <div className="filter-item">
          <label>平均换手率区间</label>
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
          <label>累计涨跌幅区间（%）</label>
          <div className="filter-range">
            {numInput(filters.pctTotalMin, (v) => onChange({ pctTotalMin: v }), { placeholder: "最小" })}
            <span>～</span>
            {numInput(filters.pctTotalMax, (v) => onChange({ pctTotalMax: v }), { placeholder: "最大" })}
          </div>
        </div>
        <div className="filter-item">
          <label>今日涨跌幅区间（%）</label>
          <div className="filter-range">
            {numInput(filters.todayPctMin, (v) => onChange({ todayPctMin: v }), { placeholder: "最小" })}
            <span>～</span>
            {numInput(filters.todayPctMax, (v) => onChange({ todayPctMax: v }), { placeholder: "最大" })}
          </div>
        </div>
        <div className="filter-item">
          <label>当前股价区间</label>
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
          <label>当前股价自定义（元）</label>
          <div className="filter-range">
            {numInput(filters.priceMin, (v) => onChange({ priceMin: v }), { step: "0.01", min: "0", placeholder: "最低价" })}
            <span>～</span>
            {numInput(filters.priceMax, (v) => onChange({ priceMax: v }), { step: "0.01", min: "0", placeholder: "最高价" })}
          </div>
        </div>
        <div className="filter-item">
          <label>累计换手率区间（%）</label>
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
          <label>散户指数自定义区间（%）</label>
          <div className="filter-range">
            {numInput(filters.retailMin, (v) => onChange({ retailMin: v }), { placeholder: "最小" })}
            <span>～</span>
            {numInput(filters.retailMax, (v) => onChange({ retailMax: v }), { placeholder: "最大" })}
          </div>
        </div>
        <div className="filter-item filter-wide">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontWeight: 650, color: "var(--text)" }}>⭐️ 精选判定规则</label>
            <button
              type="button"
              className="btn"
              style={{ padding: "2px 8px", fontSize: 11 }}
              onClick={() => onRuleChange(DEFAULT_HIGHLIGHT)}
              title="恢复为系统推荐的精选阈值"
            >
              恢复默认规则
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 8 }}>
            <div className="filter-range">
              <span>散户指数 &lt;</span>
              <input
                type="number"
                step="0.1"
                value={rule.retailMax}
                onChange={(e) => onRuleChange({ retailMax: Number(e.target.value) })}
              />
              <span>%</span>
            </div>
            <div className="filter-range">
              <span>当日换手率 &lt;</span>
              <input
                type="number"
                step="0.1"
                value={rule.todayTurnoverMax}
                onChange={(e) => onRuleChange({ todayTurnoverMax: Number(e.target.value) })}
              />
              <span>%</span>
            </div>
            <div className="filter-range">
              <span>平均日涨幅 &gt;</span>
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
        {activeCount > 0 ? (
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              className="btn danger"
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={resetMoreFilters}
            >
              重置上述高级筛选
            </button>
          </div>
        ) : null}
      </section>
    </details>
  )
}
