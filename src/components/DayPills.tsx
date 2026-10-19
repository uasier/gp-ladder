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
  allLabel = "全部阶梯",
  onSelect,
}: Props) {
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && !e.deltaX) {
      e.currentTarget.scrollLeft += e.deltaY
    }
  }

  return (
    <div className="days-track-container" role="navigation" aria-label="天梯阶梯层级切换">
      <div className="days" onWheel={handleWheel}>
        <button
          type="button"
          className={`day-chip ${exactDay === null ? "on" : ""}`}
          onClick={() => onSelect(null)}
        >
          <span className="chip-text">{allLabel}</span>
          <span className="badge-count">{total}</span>
        </button>
        {days.map((day) => {
          const isTopTier = day >= 4
          return (
            <button
              key={day}
              type="button"
              className={`day-chip ${isTopTier ? "top-tier" : ""} ${exactDay === day ? "on" : ""}`}
              onClick={() => onSelect(day)}
              title={isTopTier ? `高度空间梯队 (${day}${unit})` : `${day}${unit}`}
            >
              {isTopTier ? <span className="tier-icon" aria-hidden="true">🔥</span> : null}
              <span className="chip-text">{day} {unit}</span>
              <span className="badge-count">{counts[day] || 0}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
