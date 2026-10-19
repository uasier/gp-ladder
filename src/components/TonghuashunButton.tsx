import { openTonghuashunStock } from "../openStock"

type Props = {
  code: string
  name?: string
  label?: string
  className?: string
  onOpen?: () => void
}

export function TonghuashunButton({ code, name, label = "同花顺", className = "", onOpen }: Props) {
  return (
    <button
      type="button"
      className={`ths-open-btn ${className}`.trim()}
      title="在同花顺打开该股票"
      aria-label={`在同花顺打开${name ? ` ${name}` : ""} ${code}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void openTonghuashunStock(code)
        onOpen?.()
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      <span>{label}</span>
    </button>
  )
}
