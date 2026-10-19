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
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setPos({
      x: Math.max(24, window.innerWidth - 480),
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

  async function handleCopy() {
    if (!result?.analysis) return
    try {
      await navigator.clipboard.writeText(result.analysis)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

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
          <div className="analyze-float-kicker">DeepSeek 短线智能分析</div>
          <strong>{title}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {result?.analysis && !loading ? (
            <button
              type="button"
              className="btn"
              style={{ padding: "4px 8px", fontSize: 12 }}
              onClick={() => void handleCopy()}
              title="复制分析报告内容"
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  已复制
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  复制分析
                </>
              )}
            </button>
          ) : null}
          <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={onClose} title="关闭 (Esc)">
            关闭
          </button>
        </div>
      </header>
      <div className="analyze-float-score">
        <div className={`score-ring ${tone}`}>
          <em>{loading ? "…" : score == null ? "--" : score}</em>
          <span>短线评分</span>
        </div>
        <div className="score-meta">
          <div className="score-label">
            {loading
              ? "正在深度推演与评分…"
              : result?.scoreLabel
                ? result.scoreLabel
                : error
                  ? "未完成评分"
                  : "待评分"}
          </div>
          <div className="muted">
            {loading
              ? "结合盘口动能、换手率与主力博弈模型生成短线策略"
              : result?.scoreReason || error || result?.model || ""}
          </div>
        </div>
      </div>
      <div className="analyze-float-body">
        {loading ? (
          <div className="an-loading">
            <div className="an-loading-bar" />
            <p>正在按短线视角提炼盘面核心要素与风险点，请稍候…</p>
          </div>
        ) : error ? (
          <div className="analyze-error">
            <p>{error}</p>
            <button type="button" className="btn primary" onClick={onRetry}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              重试分析
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
