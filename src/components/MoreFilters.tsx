import type { FilterState, HighlightRule } from "../types"
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
  return (
    <details className="more-filters">
      <summary>
        <div className="summary-left">
          <svg className="summary-arrow" viewBox="0 0 24 24">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
          <span>更多筛选与精选条件</span>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: "normal" }}>
          自定义涨跌幅、换手率与主力散户模型
        </span>
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
          <label>精选条件</label>
          <div className="filter-range" style={{ marginTop: 6 }}>
            <span>散户指数 &lt;</span>
            <input
              type="number"
              step="0.1"
              value={rule.retailMax}
              onChange={(e) => onRuleChange({ retailMax: Number(e.target.value) })}
            />
            <span>%</span>
          </div>
          <div className="filter-range" style={{ marginTop: 8 }}>
            <span>当日换手率 &lt;</span>
            <input
              type="number"
              step="0.1"
              value={rule.todayTurnoverMax}
              onChange={(e) => onRuleChange({ todayTurnoverMax: Number(e.target.value) })}
            />
            <span>%</span>
          </div>
          <div className="filter-range" style={{ marginTop: 8 }}>
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
      </section>
    </details>
  )
}
