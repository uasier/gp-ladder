import { useState } from "react"
import type { HighlightRule, StockRow } from "../types"
import {
  buildDetailUrl,
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
}

export function StockDrawer({ item, rule, onClose }: Props) {
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
    retail === null ? "" : retail > 0 ? "(主力流出/散户追高)" : "(主力吸筹/散户离场)"
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

  return (
    <>
      <div className="mask open" onClick={onClose} />
      <aside className="drawer open" aria-hidden="false">
        <div className="drawer-header">
          <div>
            <div className="code-wrap">
              <span className="code" style={{ fontSize: 13 }}>
                {code}
              </span>
            </div>
            <h2>{item["股票简称"]}</h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
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
          <div className="drawer-section-title">当日盘口表现</div>
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
          <div className="drawer-section-title">{item["连板天数"] ? "涨停天梯数据" : "连涨天梯数据"}</div>
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
                <div className="kv-item">
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
                <div className="kv-item">
                  <span>昨日连板</span>
                  <b>{item["昨日连板"] || item["连板天数"] || "--"}</b>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div>
          <div className="drawer-section-title">资金情绪与估值</div>
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
          <a className="primary" href={buildDetailUrl(code)} target="_blank" rel="noopener">
            打开东财行情
          </a>
          <button type="button" onClick={() => void copyCode()}>
            {copied ? "✓ 已复制" : "复制代码"}
          </button>
        </div>
        <div className="hint">按 Esc 键或点击外部遮罩退出详情</div>
      </aside>
    </>
  )
}
