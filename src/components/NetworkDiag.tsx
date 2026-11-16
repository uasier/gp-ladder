import { useEffect, useState } from "react"
import { getNetworkDiagnostics } from "../api"
import {
  DIAG_HELP,
  copyFeedback,
  formatDiagReport,
  formatDiagUnavailable,
  type DiagView,
} from "../netdiag"

type Props = {
  reloadKey?: string
  onClose: () => void
}

export function NetworkDiag({ reloadKey, onClose }: Props) {
  const [view, setView] = useState<DiagView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getNetworkDiagnostics()
      .then((next) => {
        if (cancelled) return
        setView(next)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setView(null)
        setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const report = loadError ? formatDiagUnavailable(loadError) : formatDiagReport(view)

  async function copyReport() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard")
      await navigator.clipboard.writeText(report)
      setNote(copyFeedback(true))
    } catch {
      setNote(copyFeedback(false))
    }
  }

  return (
    <section className="network-diag" id="network-diag" aria-label="网络诊断">
      <div className="network-diag-head">
        <h3>网络诊断</h3>
        <button type="button" className="btn" onClick={onClose}>收起</button>
      </div>
      <p className="network-diag-help">{DIAG_HELP}</p>
      <div className="network-diag-actions">
        <button type="button" className="btn primary" onClick={() => void copyReport()} disabled={loading}>
          复制诊断
        </button>
        {note ? <span className="network-diag-note" role="status">{note}</span> : null}
      </div>
      {loading ? <p className="network-diag-note">正在读取本机记录…</p> : null}
      <textarea className="network-diag-report" readOnly spellCheck={false} aria-label="诊断报告" value={report} />
    </section>
  )
}
