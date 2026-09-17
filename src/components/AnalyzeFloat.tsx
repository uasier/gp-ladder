import { useEffect, useRef, useState } from "react"
import type { AnalyzeResult } from "../types"
import { AnalysisArticle } from "./AnalysisArticle"

type Props = {
  open: boolean
  loading: boolean
  error: string | null
  result: AnalyzeResult | null
  title: string
  onClose: () => void
  onRetry: () => void
}

export function AnalyzeFloat({ open, loading, error, result, title, onClose, onRetry }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 48, y: 72 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setPos({
      x: Math.max(24, window.innerWidth - 460),
      y: 72,
    })
  }, [open, title])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 80, e.clientX - drag.current.dx)),
        y: Math.max(8, Math.min(window.innerHeight - 80, e.clientY - drag.current.dy)),
      })
    }
    const onUp = () => {
      drag.current = null
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  if (!open) return null

  const score = result?.score ?? null
  const tone = scoreTone(score)

  return (
    <div
      ref={panel}
      className="analyze-float"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="DeepSeek 分析"
    >
      <header
        className="analyze-float-bar"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return
          const rect = panel.current?.getBoundingClientRect()
          drag.current = {
            dx: e.clientX - (rect?.left ?? 0),
            dy: e.clientY - (rect?.top ?? 0),
          }
        }}
      >
        <div>
          <div className="analyze-float-kicker">短线分析</div>
          <strong>{title}</strong>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          关闭
        </button>
      </header>
      <div className="analyze-float-score">
        <div className={`score-ring ${tone}`}>
          <em>{loading ? "…" : score == null ? "--" : score}</em>
          <span>短线评分</span>
        </div>
        <div className="score-meta">
          <div className="score-label">
            {loading
              ? "正在分析…"
              : result?.scoreLabel
                ? result.scoreLabel
                : error
                  ? "未完成评分"
                  : "待评分"}
          </div>
          <div className="muted">
            {loading
              ? "按 1–5 个交易日的盘面提炼要点并打分"
              : result?.scoreReason || error || result?.model || ""}
          </div>
        </div>
      </div>
      <div className="analyze-float-body">
        {loading ? (
          <div className="an-loading">
            <div className="an-loading-bar" />
            <p>正在按短线视角看盘面，请稍候。</p>
          </div>
        ) : error ? (
          <div className="analyze-error">
            <p>{error}</p>
            <button type="button" className="btn primary" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : (
          <AnalysisArticle text={result?.analysis || ""} />
        )}
      </div>
    </div>
  )
}

function scoreTone(score: number | null): string {
  if (score == null) return "unknown"
  if (score >= 75) return "good"
  if (score >= 60) return "mid"
  return "bad"
}
