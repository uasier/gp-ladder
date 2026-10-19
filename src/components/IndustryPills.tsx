import type { WheelEvent } from "react"

type Props = {
  items: { name: string; count: number }[]
  current: string
  onSelect: (name: string) => void
}

export function IndustryPills({ items, current, onSelect }: Props) {
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && !e.deltaX) {
      e.currentTarget.scrollLeft += e.deltaY
    }
  }

  return (
    <div className="industry-bar" onWheel={handleWheel}>
      <button
        type="button"
        className={`ind-chip ${current === "all" ? "on" : ""}`}
        onClick={() => onSelect("all")}
      >
        全部行业
      </button>
      {items.map((item) => (
        <button
          key={item.name}
          type="button"
          className={`ind-chip ${current === item.name ? "on" : ""}`}
          onClick={() => onSelect(item.name)}
        >
          {item.name} <span className="badge-count">{item.count}</span>
        </button>
      ))}
    </div>
  )
}
