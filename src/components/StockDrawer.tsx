import { useState } from "react"
import { isTauri } from "../api"
import { isPhoneUi } from "../platform"
import type { HighlightRule, StockRow } from "../types"
import {
  buildDetailUrl,
  formatVolumeRatio,
  getAvgPct,
  getAvgTurnover,
  getRetailIndex,
  getBodyPct,
  getTodayPct,
  normalizeNumber,
  pctClass,
  shouldHighlight,
} from "../stock"

type Props = {
  item: StockRow | null
  rule: HighlightRule
  onClose: () => void
  onAnalyze?: (item: StockRow) => void
  analyzeLabel?: string
}

export function StockDrawer({ item, rule, onClose, onAnalyze, analyzeLabel = "AI 短线分析" }: Props) {
  const [copied, setCopied] = useState(false)
  if (!item) {
    return (
      <>
        <div className="mask" />
        <aside className="drawer" aria-hidden="true" />
      </>
    )
  }
  const avgPct = getAvgPct(item)
  const avgTurnover = getAvgTurnover(item)
  const todayPct = getTodayPct(item)
  const bodyPct = getBodyPct(item)
  const hl = shouldHighlight(item, rule)
  const retail = getRetailIndex(item)
  const retailTrend =
    retail === null ? "" : retail > 0 ? "(主力流出 / 散户追高)" : "(主力吸筹 / 散户离场)"
  const code = item["股票代码"]

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  async function openQuote() {
    const url = buildDetailUrl(code)
    if (!url || url === "#") return
    try {
      if (isTauri()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener")
        await openUrl(url)
        return
      }
    } catch {
      // 回退到浏览器
    }
    window.open(url, "_blank", "noopener")
  }

  return (
    <>
      <div className="mask open" onClick={onClose} />
      <aside className="drawer open" aria-hidden="false">
        <div className="drawer-handle" />
        <div className="drawer-header">
          <div>
            <div className="code-wrap">
              <span className="code" style={{ fontSize: 13 }}>
                {code}
              </span>
            </div>
            <h2>{item["股票简称"]}</h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              <span className="tag">{item["所属行业"] || "行业未知"}</span>
              <span
                className="tag"
                style={{ color: "var(--gold)", borderColor: "var(--gold-border)", background: "var(--gold-bg)" }}
              >
                {item["连板天数"] || item["连涨天数"]} {item["连板天数"] ? "连板" : "连涨天"}
              </span>
              {hl ? <span className="badge">⭐️ 精选标的</span> : null}
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} title="关闭 (Esc)">
            ✕
          </button>
        </div>
        <div>
          <div className="drawer-section-title">今日行情</div>
          <div className="kv-card">
            <div className="kv-item">
              <span>现价</span>
              <b>{item["现价"] || "--"} 元</b>
            </div>
            <div className="kv-item">
              <span>今日涨跌幅</span>
              <b className={pctClass(todayPct ?? 0)}>{item["今日涨跌幅"] || "--"}</b>
            </div>
            <div className="kv-item">
              <span>实体涨幅</span>
              <b className={pctClass(bodyPct ?? 0)}>{item["实体涨幅"] || "--"}</b>
            </div>
            <div className="kv-item">
              <span>今日换手率</span>
              <b>{item["今日换手率"] || "--"}</b>
            </div>
            <div className="kv-item">
              <span>量比</span>
              <b>{formatVolumeRatio(item)}</b>
            </div>
            <div className="kv-item">
              <span>成交额</span>
              <b>{item["成交额"] || "--"}</b>
            </div>
            <div className="kv-item" style={{ gridColumn: "1 / -1" }}>
              <span>今开 / 最高 / 最低</span>
              <b>
                {item["今开"] || "--"} / {item["今高"] || "--"} / {item["今低"] || "--"}
              </b>
            </div>
          </div>
        </div>
        <div>
          <div className="drawer-section-title">{item["连板天数"] ? "连板数据" : "连涨数据"}</div>
          <div className="kv-card">
            <div className="kv-item">
              <span>{item["连板天数"] ? "连板天数" : "连涨天数"}</span>
              <b style={{ color: "var(--gold)" }}>
                {item["连板天数"] || item["连涨天数"]} {item["连板天数"] ? "板" : "天"}
              </b>
            </div>
            <div className="kv-item">
              <span>连涨累计</span>
              <b className={pctClass(normalizeNumber(item["连续涨跌幅"]))}>{item["连续涨跌幅"] || "--"}</b>
            </div>
            <div className="kv-item">
              <span>平均涨幅/天</span>
              <b>{avgPct.toFixed(2)}%</b>
            </div>
            <div className="kv-item">
              <span>平均换手/天</span>
              <b>{avgTurnover.toFixed(2)}%</b>
            </div>
            <div className="kv-item" style={{ gridColumn: "1 / -1" }}>
              <span>榜单收盘价</span>
              <b>{item["收盘价(元)"] || "--"} 元</b>
            </div>
            {item["首次封板"] ? (
              <>
                <div className="kv-item">
                  <span>首次封板</span>
                  <b>{item["首次封板"]}</b>
                </div>
                <div className="kv-item">
                  <span>最后封板</span>
                  <b>{item["最后封板"] || "--"}</b>
                </div>
                <div className="kv-item">
                  <span>炸板次数</span>
                  <b>{item["炸板次数"] || "0"}</b>
                </div>
                <div className="kv-item">
                  <span>封板资金</span>
                  <b>{item["封板资金"] || "--"}</b>
                </div>
                <div className="kv-item" style={{ gridColumn: "1 / -1" }}>
                  <span>涨停统计</span>
                  <b>{item["涨停统计"] || "--"}</b>
                </div>
              </>
            ) : null}
            {item["今开涨幅"] || item["昨日封板"] ? (
              <>
                <div className="kv-item">
                  <span>今开涨幅</span>
                  <b>{item["今开涨幅"] || "--"}</b>
                </div>
                <div className="kv-item">
                  <span>昨日封板</span>
                  <b>{item["昨日封板"] || "--"}</b>
                </div>
                <div className="kv-item" style={{ gridColumn: "1 / -1" }}>
                  <span>昨日连板</span>
                  <b>{item["昨日连板"] || item["连板天数"] || "--"}</b>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div>
          <div className="drawer-section-title">资金与估值</div>
          <div className="kv-card">
            <div className="kv-item">
              <span>散户指数 (小单占比)</span>
              <b className={pctClass(retail ?? 0)}>{item["散户指数"] || "--"}</b>
            </div>
            <div className="kv-item">
              <span>散户净额</span>
              <b>{item["散户净额"] || "--"}</b>
            </div>
            <div className="kv-item">
              <span>市盈率 (PE)</span>
              <b>{item["市盈率"] || "--"}</b>
            </div>
            <div className="kv-item">
              <span>行情更新时刻</span>
              <b>{item["行情时间"] || "--"}</b>
            </div>
            {retailTrend ? (
              <div className="kv-item" style={{ gridColumn: "1 / -1" }}>
                <span style={{ color: "var(--text-sub)" }}>{retailTrend}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="acts">
          <button type="button" className="primary" onClick={() => void openQuote()} title="在东财网页查看该标的分时K线行情">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            打开东财
          </button>
          {onAnalyze ? (
            <button
              type="button"
              className="analyze-act-btn"
              onClick={() => onAnalyze(item)}
              title="DeepSeek 短线分析"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
              {analyzeLabel}
            </button>
          ) : null}
          <button type="button" onClick={() => void copyCode()} title="复制股票代码到剪贴板">
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                已复制
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                复制代码
              </>
            )}
          </button>
        </div>
        <div className="hint">
          {isPhoneUi() ? "点空白处关闭" : "Esc 或点空白处关闭"}
        </div>
      </aside>
    </>
  )
}
