import { useState } from "react"
import { isTauri } from "../api"
import { isPhoneUi } from "../platform"
import { TonghuashunButton } from "./TonghuashunButton"
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

export function StockDrawer({ item, rule, onClose, onAnalyze, analyzeLabel = "AI 短线复盘" }: Props) {
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
    retail === null ? "" : retail > 0 ? "主力流出 / 散户追高" : "主力吸筹 / 散户离场"
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
      <aside className="drawer open modern-drawer" aria-hidden="false">
        <div className="drawer-handle" />

        {/* 抽屉头部 */}
        <div className="drawer-header modern-drawer-header">
          <div className="drawer-title-group">
            <div className="drawer-code-pill">
              <span className="font-mono">{code}</span>
            </div>
            <h2>{item["股票简称"]}</h2>
            <div className="drawer-tag-row">
              <span className="modern-tag industry">{item["所属行业"] || "行业未知"}</span>
              <span className="modern-tag stage">
                {item["连板天数"] || item["连涨天数"]} {item["连板天数"] ? "连板" : "连涨天"}
              </span>
              {hl ? <span className="gold-pill-star">⭐️ 精选标的</span> : null}
            </div>
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} title="关闭 (Esc)">
            ✕
          </button>
        </div>

        <div className="drawer-body-scroll">
          {/* 行情看板 */}
          <div className="drawer-card-group">
            <div className="drawer-group-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
              <span>实时行情指标</span>
            </div>
            <div className="modern-kv-grid">
              <div className="kv-box">
                <span className="kv-k">最新现价</span>
                <span className="kv-v price font-mono">{item["现价"] || "--"} 元</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">今日涨跌幅</span>
                <span className={`kv-v font-mono ${pctClass(todayPct ?? 0)}`}>{item["今日涨跌幅"] || "--"}</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">K线实体涨幅</span>
                <span className={`kv-v font-mono ${pctClass(bodyPct ?? 0)}`}>{item["实体涨幅"] || "--"}</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">今日换手率</span>
                <span className="kv-v font-mono">{item["今日换手率"] || "--"}</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">实时量比</span>
                <span className="kv-v font-mono highlight-vol">{formatVolumeRatio(item)}</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">今日成交额</span>
                <span className="kv-v font-mono">{item["成交额"] || "--"}</span>
              </div>
              <div className="kv-box full-col">
                <span className="kv-k">今开 / 最高 / 最低</span>
                <span className="kv-v font-mono">
                  {item["今开"] || "--"} / {item["今高"] || "--"} / {item["今低"] || "--"}
                </span>
              </div>
            </div>
          </div>

          {/* 连板/连涨梯队数据 */}
          <div className="drawer-card-group">
            <div className="drawer-group-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>{item["连板天数"] ? "连板游资数据" : "连涨动能数据"}</span>
            </div>
            <div className="modern-kv-grid">
              <div className="kv-box">
                <span className="kv-k">{item["连板天数"] ? "连板身位" : "连涨天数"}</span>
                <span className="kv-v gold font-mono">
                  {item["连板天数"] || item["连涨天数"]} {item["连板天数"] ? "连板" : "天"}
                </span>
              </div>
              <div className="kv-box">
                <span className="kv-k">连续累计涨幅</span>
                <span className={`kv-v font-mono ${pctClass(normalizeNumber(item["连续涨跌幅"]))}`}>
                  {item["连续涨跌幅"] || "--"}
                </span>
              </div>
              <div className="kv-box">
                <span className="kv-k">日均涨幅</span>
                <span className="kv-v font-mono">{avgPct.toFixed(2)}%</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">日均换手</span>
                <span className="kv-v font-mono">{avgTurnover.toFixed(2)}%</span>
              </div>
              {item["首次封板"] ? (
                <>
                  <div className="kv-box">
                    <span className="kv-k">首次封板时刻</span>
                    <span className="kv-v gold font-mono">{item["首次封板"]}</span>
                  </div>
                  <div className="kv-box">
                    <span className="kv-k">最后封板时刻</span>
                    <span className="kv-v font-mono">{item["最后封板"] || "--"}</span>
                  </div>
                  <div className="kv-box">
                    <span className="kv-k">盘中炸板次数</span>
                    <span className={`kv-v font-mono ${item["炸板次数"] !== "0" ? "warn" : ""}`}>
                      {item["炸板次数"] || "0"} 次
                    </span>
                  </div>
                  <div className="kv-box">
                    <span className="kv-k">封板资金</span>
                    <span className="kv-v font-mono">{item["封板资金"] || "--"}</span>
                  </div>
                  <div className="kv-box full-col">
                    <span className="kv-k">涨停特征统计</span>
                    <span className="kv-v">{item["涨停统计"] || "--"}</span>
                  </div>
                </>
              ) : null}
              {item["今开涨幅"] || item["昨日封板"] ? (
                <>
                  <div className="kv-box">
                    <span className="kv-k">今开盘涨幅</span>
                    <span className="kv-v gold font-mono">{item["今开涨幅"] || "--"}</span>
                  </div>
                  <div className="kv-box">
                    <span className="kv-k">昨日封单资金</span>
                    <span className="kv-v font-mono">{item["昨日封板"] || "--"}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* 筹码与散户博弈 */}
          <div className="drawer-card-group">
            <div className="drawer-group-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              <span>资金流向与筹码分布</span>
            </div>
            <div className="modern-kv-grid">
              <div className="kv-box">
                <span className="kv-k">散户指数 (小单)</span>
                <span className={`kv-v font-mono ${pctClass(retail ?? 0)}`}>{item["散户指数"] || "--"}</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">散户净额</span>
                <span className="kv-v font-mono">{item["散户净额"] || "--"}</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">市盈率 (PE)</span>
                <span className="kv-v font-mono">{item["市盈率"] || "--"}</span>
              </div>
              <div className="kv-box">
                <span className="kv-k">行情撮合时间</span>
                <span className="kv-v font-mono">{item["行情时间"] || "--"}</span>
              </div>
              {retailTrend ? (
                <div className="kv-box full-col">
                  <span className="kv-k">筹码倾向判定</span>
                  <span className="kv-v subtle-trend">{retailTrend}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 底部功能栏 */}
        <div className="drawer-actions modern-drawer-actions">
          <button
            type="button"
            className="btn primary glow-btn"
            onClick={() => void openQuote()}
            title="在东财网页查看该标的分时K线行情"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>打开东财分时</span>
          </button>

          <TonghuashunButton code={code} name={item["股票简称"]} label="打开同花顺" className="btn" />

          {onAnalyze ? (
            <button
              type="button"
              className="btn ai-analyze-btn"
              onClick={() => onAnalyze(item)}
              title="DeepSeek AI 专属模型短线复盘推演"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>{analyzeLabel}</span>
            </button>
          ) : null}

          <button
            type="button"
            className="btn icon-text-btn"
            onClick={() => void copyCode()}
            title="复制股票代码到剪贴板"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>已复制</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>复制代码</span>
              </>
            )}
          </button>
        </div>

        <div className="drawer-footer-hint">
          {isPhoneUi() ? "向下滑动或点击遮罩关闭" : "按 Esc 键或点击遮罩关闭"}
        </div>
      </aside>
    </>
  )
}
