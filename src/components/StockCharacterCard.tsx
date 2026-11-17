import { useEffect, useState } from "react"
import {
  clearStockCharacter,
  loadStockCharacter,
  presentStockCharacter,
  type CharacterPresentation,
  type StockCharacter,
} from "../stockCharacter"

type Phase = { kind: "loading" } | { kind: "error"; message: string } | StockCharacter

export function StockCharacterCard({ code }: { code: string }) {
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })

  useEffect(() => {
    let alive = true
    setPhase({ kind: "loading" })
    loadStockCharacter(code).then(
      (value) => {
        if (alive) setPhase(value)
      },
      (error: unknown) => {
        if (!alive) return
        const message = error instanceof Error ? error.message : "日 K 数据源暂时无法访问"
        setPhase({ kind: "error", message })
      },
    )
    return () => {
      alive = false
    }
  }, [code, attempt])

  const view = presentStockCharacter(phase)
  return (
    <div className="drawer-card-group character-card">
      <div className="drawer-group-title">
        <span>{view.title}</span>
      </div>
      <CharacterBody
        view={view}
        onRetry={() => {
          clearStockCharacter(code)
          setAttempt((value) => value + 1)
        }}
      />
    </div>
  )
}

function CharacterBody({ view, onRetry }: { view: CharacterPresentation; onRetry: () => void }) {
  if (view.kind === "ready") {
    return (
      <div className="modern-kv-grid">
        <div className="kv-box">
          <span className="kv-k">股性总分</span>
          <span className="kv-v font-mono">{view.total}</span>
        </div>
        {view.rows.map((row) => (
          <div className="kv-box" key={row.label}>
            <span className="kv-k">{row.label}</span>
            <span className="kv-v font-mono">{row.value}</span>
          </div>
        ))}
        <p className="character-note">{view.message}</p>
        <p className="character-note">{view.ruleNote}</p>
        <p className="character-source">来源：{view.source}</p>
      </div>
    )
  }
  return (
    <div className="modern-kv-grid">
      <div className="kv-box full-col">
        <span className="kv-k">股性指标</span>
        <span className="kv-v">{view.kind === "loading" ? "正在计算…" : "暂不可用"}</span>
      </div>
      <p className="character-note">{view.note}</p>
      {view.kind === "error" ? (
        <button type="button" className="btn holder-retry" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  )
}
