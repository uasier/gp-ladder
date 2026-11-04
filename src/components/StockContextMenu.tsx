import { TonghuashunButton } from "./TonghuashunButton"

type Props = {
  x: number
  y: number
  name: string
  code: string
  onAnalyze: () => void
  analyzeLabel?: string
  watched?: boolean
  onWatch?: () => void
  onDetail: () => void
  onClose: () => void
}

export function StockContextMenu({
  x,
  y,
  name,
  code,
  onAnalyze,
  analyzeLabel = "短线分析",
  watched = false,
  onWatch,
  onDetail,
  onClose,
}: Props) {
  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 220)
  return (
    <>
      <div className="ctx-mask" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="ctx-menu" style={{ left, top }} role="menu">
        <div className="ctx-title">
          <span>{name}</span>
          <span className="muted code">{code}</span>
        </div>
        {onWatch ? (
          <button type="button" role="menuitem" onClick={onWatch}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {watched ? "编辑自选" : "加入自选"}
          </button>
        ) : null}
        <button type="button" role="menuitem" onClick={onAnalyze}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
          {analyzeLabel}
        </button>
        <TonghuashunButton code={code} name={name} label="打开同花顺" onOpen={onClose} />
        <button type="button" role="menuitem" onClick={onDetail}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          查看标的详情
        </button>
      </div>
    </>
  )
}
