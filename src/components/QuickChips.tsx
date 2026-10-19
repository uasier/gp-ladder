import type { FilterState } from "../types"

type Props = {
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

const PRICE_CHIPS = [
  { value: "0-10", label: "<10元" },
  { value: "10-20", label: "10–20元" },
  { value: "20-50", label: "20–50元" },
  { value: "50-100", label: "50–100元" },
  { value: "100+", label: ">100元" },
]

export function QuickChips({ filters, onChange }: Props) {
  return (
    <div className="quick" role="region" aria-label="快捷精选过滤器">
      <div className="quick-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span>快捷模式</span>
      </div>

      <div className="quick-chips-scroll">
        <button
          type="button"
          className={`chip ${filters.excludeSt ? "on" : ""}`}
          onClick={() => onChange({ excludeSt: !filters.excludeSt })}
          title="过滤 ST 与 *ST 股票"
        >
          非 ST
        </button>
        <button
          type="button"
          className={`chip gold-chip ${filters.onlyHighlight ? "on" : ""}`}
          onClick={() => onChange({ onlyHighlight: !filters.onlyHighlight })}
          title="仅显示触发精选规则的强势标的"
        >
          ⭐️ 仅精选
        </button>
        <button
          type="button"
          className={`chip up-chip ${filters.todayPctMin === 0 ? "on" : ""}`}
          onClick={() => onChange({ todayPctMin: filters.todayPctMin === 0 ? null : 0 })}
          title="过滤今日涨跌幅大于 0 的红盘标的"
        >
          📈 今日红盘
        </button>
        <button
          type="button"
          className={`chip ${filters.retailRange === "out" ? "on" : ""}`}
          onClick={() => onChange({ retailRange: filters.retailRange === "out" ? "all" : "out" })}
          title="散户指数负数：主力吸筹或散户离场"
        >
          🌊 散户净流出
        </button>
        <button
          type="button"
          className={`chip ${filters.nearDayHigh ? "on" : ""}`}
          title="现价与今日盘中最高价相差不超过 0.5%"
          onClick={() => onChange({ nearDayHigh: !filters.nearDayHigh })}
        >
          ⚡️ 现价近最高
        </button>

        <span className="chip-divider" aria-hidden="true" />

        {PRICE_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={`chip price-chip ${filters.priceRange === chip.value ? "on" : ""}`}
            onClick={() =>
              onChange({
                priceRange: filters.priceRange === chip.value ? "all" : chip.value,
                priceMin: null,
                priceMax: null,
              })
            }
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  )
}
