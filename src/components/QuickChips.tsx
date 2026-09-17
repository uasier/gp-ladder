import type { FilterState } from "../types"

type Props = {
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

const PRICE_CHIPS = [
  { value: "0-10", label: "10元以下" },
  { value: "10-20", label: "10–20元" },
  { value: "20-50", label: "20–50元" },
  { value: "50-100", label: "50–100元" },
  { value: "100+", label: "100元以上" },
]

export function QuickChips({ filters, onChange }: Props) {
  return (
    <div className="quick">
      <span className="quick-title">快捷筛选：</span>
      <button
        type="button"
        className={`chip ${filters.excludeSt ? "on" : ""}`}
        onClick={() => onChange({ excludeSt: !filters.excludeSt })}
      >
        非 ST
      </button>
      <button
        type="button"
        className={`chip ${filters.onlyHighlight ? "on gold" : ""}`}
        onClick={() => onChange({ onlyHighlight: !filters.onlyHighlight })}
      >
        仅精选 ⭐️
      </button>
      <button
        type="button"
        className={`chip ${filters.todayPctMin === 0 ? "on" : ""}`}
        onClick={() => onChange({ todayPctMin: filters.todayPctMin === 0 ? null : 0 })}
      >
        今日上涨 📈
      </button>
      <button
        type="button"
        className={`chip ${filters.retailRange === "out" ? "on" : ""}`}
        onClick={() => onChange({ retailRange: filters.retailRange === "out" ? "all" : "out" })}
      >
        散户净流出 🌊
      </button>
      {PRICE_CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          className={`chip ${filters.priceRange === chip.value ? "on" : ""}`}
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
  )
}
