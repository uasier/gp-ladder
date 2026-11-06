import { useEffect, useRef, useState } from "react"
import {
  WATCH_REASON_MAX,
  WATCH_REASON_PRESETS,
  applyReasonPreset,
  localDateString,
  sourceLabel,
  validateWatchDraft,
  type WatchDraft,
  type WatchQuote,
} from "../watchlist"

type Props = {
  open: boolean
  mode: "add" | "edit"
  session: number
  initial: WatchDraft
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (draft: WatchDraft) => void
  onLookup: (code: string) => Promise<WatchQuote | null>
}

export function WatchlistEditor({
  open,
  mode,
  session,
  initial,
  saving,
  error,
  onClose,
  onSubmit,
  onLookup,
}: Props) {
  const [draft, setDraft] = useState(initial)
  const [localError, setLocalError] = useState<string | null>(null)
  const [lookupHint, setLookupHint] = useState("")
  const codeRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const today = localDateString()
  const codeLocked = mode === "edit" || initial.source !== "manual"

  useEffect(() => {
    if (!open) return
    setDraft(initial)
    setLocalError(null)
    setLookupHint("")
    const timer = window.setTimeout(() => {
      if (codeLocked) reasonRef.current?.focus()
      else codeRef.current?.focus()
    }, 30)
    return () => window.clearTimeout(timer)
    // session 变化才重置，避免父组件重绘打断正在输入的内容。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session])

  useEffect(() => {
    if (!open || mode !== "add") return
    if (!/^\d{6}$/.test(draft.code)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void onLookup(draft.code)
        .then((quote) => {
          if (cancelled) return
          if (!quote) {
            setLookupHint("未获取到现价，请手动填写自选价格")
            return
          }
          let filled = false
          setDraft((current) => {
            if (current.code !== draft.code) return current
            const next = { ...current }
            if (!current.name.trim() && quote.name) next.name = quote.name
            if (!current.addedPrice.trim() && quote.price != null) {
              next.addedPrice = quote.price.toFixed(2)
              filled = true
            }
            return next
          })
          setLookupHint(quote.price == null ? "未获取到现价，请手动填写自选价格" : filled ? "已填入当前现价，可按需要修改" : "")
        })
        .catch(() => {
          if (!cancelled && !draftRef.current.addedPrice.trim()) {
            setLookupHint("暂时无法获取现价，请手动填写")
          }
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, mode, draft.code, onLookup])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, saving, onClose])

  if (!open) return null
  const message = localError || error
  const reasonLength = [...draft.reason.trim()].length

  function submit() {
    const next = { ...draft, code: draft.code.trim(), name: draft.name.trim(), reason: draft.reason.trim() }
    const invalid = validateWatchDraft(next, today)
    if (invalid) {
      setLocalError(invalid)
      return
    }
    setLocalError(null)
    onSubmit(next)
  }

  return (
    <div
      className="modal-backdrop watch-editor-backdrop"
      onClick={() => {
        if (!saving) onClose()
      }}
      role="presentation"
    >
      <form
        className="modal watch-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="watch-editor-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <header>
          <div>
            <h2 id="watch-editor-title">{mode === "edit" ? "编辑自选" : "加入自选"}</h2>
            <p className="tip">记录加入时的日期、价格和原因。之后刷新现价不会改写这些记录。</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="watch-form-grid">
          <label className="field">
            股票代码
            <input
              ref={codeRef}
              value={draft.code}
              inputMode="numeric"
              maxLength={6}
              readOnly={codeLocked}
              placeholder="6 位代码"
              onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
            />
          </label>
          <label className="field">
            股票简称
            <input
              value={draft.name}
              maxLength={32}
              placeholder="例如 贵州茅台"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field">
            自选日期
            <input
              type="date"
              value={draft.addedDate}
              min="1990-01-01"
              max={today}
              required
              onChange={(event) => setDraft((current) => ({ ...current, addedDate: event.target.value }))}
            />
          </label>
          <label className="field">
            自选价格
            <input
              value={draft.addedPrice}
              inputMode="decimal"
              placeholder="加入时的价格"
              onChange={(event) => setDraft((current) => ({ ...current, addedPrice: event.target.value }))}
            />
          </label>
        </div>
        <label className="field">
          所属行业
          <input
            value={draft.industry}
            maxLength={40}
            placeholder="可选"
            onChange={(event) => setDraft((current) => ({ ...current, industry: event.target.value }))}
          />
        </label>
        <label className="field">
          <span className="watch-label-row">
            <span>自选原因</span>
            <span>{reasonLength}/{WATCH_REASON_MAX}</span>
          </span>
          <textarea
            ref={reasonRef}
            rows={3}
            maxLength={WATCH_REASON_MAX}
            value={draft.reason}
            placeholder="为什么加入自选，例如连板观察、回封确认"
            onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
          />
        </label>
        <div className="watch-presets" aria-label="原因快捷填入">
          {WATCH_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setDraft((current) => ({ ...current, reason: applyReasonPreset(current.reason, preset) }))}
            >
              {preset}
            </button>
          ))}
        </div>
        <p className="resolved-hint">{lookupHint || `来源：${sourceLabel(draft.source)}`}</p>
        {message ? <p className="watch-form-error" role="alert">{message}</p> : null}
        <div className="watch-editor-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "保存中…" : mode === "edit" ? "保存修改" : "加入自选"}
          </button>
        </div>
      </form>
    </div>
  )
}
