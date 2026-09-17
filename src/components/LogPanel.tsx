import { useEffect, useRef, useState } from "react"
import { getAppLogPath, getAppLogs, onAppLog, revealAppLog, writeAppLog } from "../api"
import type { AppLogEntry } from "../types"

type Props = {
  open: boolean
  onToggle: () => void
}

export function LogPanel({ open, onToggle }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<AppLogEntry[]>([])
  const [path, setPath] = useState<string | null>(null)
  const last = entries[entries.length - 1]
  const errors = entries.reduce((n, e) => n + (e.level === "error" ? 1 : 0), 0)

  useEffect(() => {
    let cancelled = false
    getAppLogs(500)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch(() => undefined)
    getAppLogPath()
      .then((p) => {
        if (!cancelled) setPath(p)
      })
      .catch(() => undefined)

    let buf: AppLogEntry[] = []
    let timer: number | null = null
    const flush = () => {
      timer = null
      if (buf.length === 0) return
      const add = buf
      buf = []
      setEntries((cur) => {
        const next = [...cur, ...add]
        return next.length > 800 ? next.slice(-800) : next
      })
    }
    const pending = onAppLog((entry) => {
      buf.push(entry)
      if (timer == null) timer = window.setTimeout(flush, 80)
    })
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
      flush()
      pending.then((un) => un()).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!open || !el) return
    el.scrollTop = el.scrollHeight
  }, [open, entries])

  return (
    <section className={`log-panel ${open ? "open" : ""}`}>
      <button type="button" className="log-bar" onClick={onToggle}>
        <span className="log-bar-title">
          运行日志
          {errors > 0 ? <em className="log-badge">{errors}</em> : null}
        </span>
        <span className="log-bar-last" title={last?.message}>
          {last ? `${formatTime(last.ts)}  ${last.message}` : "暂无日志"}
        </span>
        <span className="muted">{open ? "收起" : "展开"}</span>
      </button>
      {open ? (
        <div className="log-body">
          <div className="log-actions">
            <span className="muted path" title={path ?? ""}>
              {path ?? "日志文件尚未就绪"}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                revealAppLog()
                  .then((p) => setPath(p))
                  .catch((e) => writeAppLog("error", "ui", `打开日志文件失败: ${String(e)}`))
              }}
            >
              打开文件
            </button>
            <button type="button" className="btn" onClick={() => setEntries([])}>
              清空显示
            </button>
          </div>
          <div className="log-scroll" ref={scroller}>
            {entries.length === 0 ? (
              <div className="empty-inline">程序启动后会在这里记录刷新 / 导出 / 界面操作。</div>
            ) : (
              entries.map((e, i) => (
                <div key={`${e.ts}-${i}`} className={`log-line lv-${e.level}`}>
                  <span className="t">{formatTime(e.ts)}</span>
                  <span className="lv">{e.level}</span>
                  <span className="src">{e.source}</span>
                  <span className="msg">{e.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString("zh-CN", { hour12: false })
}
