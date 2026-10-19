import { useEffect, useRef } from "react"
import type { BoardKind, StockPickRequest, StockPickResult } from "../types"
import "./StockPickModal.css"

const BOARD_LABELS: Record<BoardKind, string> = {
  lxsz: "连涨天梯",
  zt: "涨停天梯",
  jjzt: "昨日涨停",
}

type Props = {
  open: boolean
  loading: boolean
  error: string | null
  source: StockPickRequest | null
  result: StockPickResult | null
  onClose: () => void
  onRetry: () => void
  onSettings: () => void
}

export function StockPickModal({ open, loading, error, source, result, onClose, onRetry, onSettings }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
      else document.querySelector<HTMLButtonElement>(".toolbox-fab")?.focus()
    }
  }, [open])

  if (!open || !source) return null
  const count = result?.candidateCount ?? new Set(source.rows.map(row => row["股票代码"])).size
  const scene = result?.scene ?? source.scene
  const quoteAt = source.quoteAt || source.updatedAt

  return (
    <div className="modal-backdrop stock-pick-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className="modal stock-pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-pick-title"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === "Escape") {
            onClose()
          }
          if (event.key !== "Tab") return
          const controls = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])]
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        <header className="stock-pick-header">
          <div>
            <span className="stock-pick-eyebrow">DeepSeek · 短线候选</span>
            <h2 id="stock-pick-title">AI 快速选股</h2>
          </div>
          <button ref={closeButton} type="button" className="btn" onClick={onClose}>
            {loading ? "收起" : "关闭"}
          </button>
        </header>
        <div className="stock-pick-context">
          <span>{BOARD_LABELS[scene]} · 本次筛选 {count} 只</span>
          <span>行情时间：{quoteAt || "未知"}</span>
        </div>
        <div className="stock-pick-body" aria-busy={loading}>
          {loading ? (
            <div className="stock-pick-loading" role="status">
              <div className="an-loading-bar" />
              <strong>正在比较 {count} 只候选股票…</strong>
              <p>将选出最多 4 只，并说明入选理由与主要风险。</p>
              <span>收起后可从工具箱查看进度。</span>
            </div>
          ) : error ? (
            <div className="stock-pick-error" role="alert">
              <strong>本次选股未完成</strong>
              <p>{error}</p>
              <button type="button" className="btn primary" onClick={onRetry}>重试这批候选</button>
            </div>
          ) : result ? (
            <>
              <p className="stock-pick-summary">{result.summary}</p>
              {count < 4 ? <p className="stock-pick-note">候选不足 4 只，已按实际数量分析。</p> : null}
              <div className="stock-pick-grid">
                {result.picks.map((pick, index) => (
                  <article className="stock-pick-card" key={pick.code}>
                    <div className="stock-pick-card-heading">
                      <span className="stock-pick-rank">{String(index + 1).padStart(2, "0")}</span>
                      <div className="stock-pick-identity">
                        <h3>{pick.name}</h3>
                        <span>{pick.code}</span>
                      </div>
                      <div className="stock-pick-score"><strong>{pick.score}</strong><span>相对评分</span></div>
                    </div>
                    <dl>
                      <div><dt>入选理由</dt><dd>{pick.reason}</dd></div>
                      <div className="stock-pick-risk"><dt>主要风险</dt><dd>{pick.risk}</dd></div>
                      <div><dt>观察条件</dt><dd>{pick.watch}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
              <p className="stock-pick-meta">{result.model} · 生成于 {result.createdAt}</p>
            </>
          ) : null}
        </div>
        <footer className="stock-pick-footer">
          <p>基于本次快照的相对比较，仅供研究参考。</p>
          <button type="button" className="btn" onClick={onSettings} disabled={loading}>选股提示词</button>
        </footer>
      </div>
    </div>
  )
}
