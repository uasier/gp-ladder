import type { WheelEvent } from "react"

type Props = {
  days: number[]
  counts: Record<number, number>
  total: number
  exactDay: number | null
  unit?: string
  allLabel?: string
  onSelect: (day: number | null) => void
}

export function DayPills({
  days,
  counts,
  total,
  exactDay,
  unit = "天",
  allLabel = "全部天数",
  onSelect,
}: Props) {
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && !e.deltaX) {
      e.currentTarget.scrollLeft += e.deltaY
    }
  }

  return (
    <div className="days" onWheel={handleWheel}>
      <button
        type="button"
        className={`day-chip ${exactDay === null ? "on" : ""}`}
        onClick={() => onSelect(null)}
      >
        {allLabel} <span className="badge-count">{total}</span>
      </button>
      {days.map((day) => (
        <button
          key={day}
          type="button"
          className={`day-chip ${day >= 4 ? "top-tier" : ""} ${exactDay === day ? "on" : ""}`}
          onClick={() => onSelect(day)}
          title={day >= 4 ? `高位龙头梯队 (${day}${unit})` : `${day}${unit}`}
        >
          {day >= 4 ? <span style={{ marginRight: 1 }}>🔥</span> : null}
          {day} {unit} <span className="badge-count">{counts[day] || 0}</span>
        </button>
      ))}
    </div>
  )
}
