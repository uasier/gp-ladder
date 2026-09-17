type Props = {
  x: number
  y: number
  name: string
  code: string
  onAnalyze: () => void
  analyzeLabel?: string
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
  onDetail,
  onClose,
}: Props) {
  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 120)
  return (
    <>
      <div className="ctx-mask" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="ctx-menu" style={{ left, top }} role="menu">
        <div className="ctx-title">
          {name} <span className="muted">{code}</span>
        </div>
        <button type="button" role="menuitem" onClick={onAnalyze}>
          {analyzeLabel}
        </button>
        <button type="button" role="menuitem" onClick={onDetail}>
          查看详情
        </button>
      </div>
    </>
  )
}
