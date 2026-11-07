import { useEffect, useState } from "react"
import { clearHolderCount, loadHolderCount, presentHolder, type HolderCount, type HolderPresentation } from "../holders"

type Phase = { kind: "loading" } | { kind: "error"; message: string } | HolderCount

export function HolderCountCard({ code }: { code: string }) {
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })

  useEffect(() => {
    let alive = true
    setPhase({ kind: "loading" })
    loadHolderCount(code).then(
      (value) => {
        if (alive) setPhase(value)
      },
      (error: unknown) => {
        if (!alive) return
        const message = error instanceof Error ? error.message : "股东人数数据源暂时无法访问"
        setPhase({ kind: "error", message })
      },
    )
    return () => {
      alive = false
    }
  }, [code, attempt])

  const view = presentHolder(phase)
  return (
    <div className="drawer-card-group holder-card">
      <div className="drawer-group-title">
        <span>{view.title}</span>
      </div>
      <HolderBody view={view} onRetry={() => {
        clearHolderCount(code)
        setAttempt((value) => value + 1)
      }} />
    </div>
  )
}

function HolderBody({ view, onRetry }: { view: HolderPresentation; onRetry: () => void }) {
  if (view.kind === "ok") {
    return (
      <div className="modern-kv-grid">
        <div className="kv-box">
          <span className="kv-k">股东人数</span>
          <span className="kv-v font-mono">{view.value}</span>
        </div>
        <div className="kv-box">
          <span className="kv-k">统计截止日</span>
          <span className="kv-v font-mono">{view.endDate}</span>
        </div>
        <div className="kv-box">
          <span className="kv-k">公告日期</span>
          <span className="kv-v font-mono">{view.noticeDate}</span>
        </div>
        <p className="holder-note">{view.note}</p>
      </div>
    )
  }
  return (
    <div className="modern-kv-grid">
      <div className="kv-box full-col">
        <span className="kv-k">股东人数</span>
        <span className="kv-v">{view.value}</span>
      </div>
      <p className="holder-note">{view.note}</p>
      {view.kind === "error" ? (
        <button type="button" className="btn holder-retry" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  )
}
