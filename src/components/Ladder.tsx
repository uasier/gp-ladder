import { useState } from "react"
import type { BoardKind, HighlightRule, StockRow, ViewMode } from "../types"
import { useLongPress } from "../longPress"
import { TonghuashunButton } from "./TonghuashunButton"
import {
  formatVolumeRatio,
  getBodyPct,
  getRetailIndex,
  getTodayPct,
  groupByDays,
  normalizeNumber,
  pctClass,
  shouldHighlight,
} from "../stock"

type Props = {
  rows: StockRow[]
  filtered: StockRow[]
  viewMode: ViewMode
  rule: HighlightRule
  selectedCode: string | null
  refreshing: boolean
  onRefresh: () => void
  onReset: () => void
  onSelect: (code: string) => void
  onContextStock: (item: StockRow, x: number, y: number) => void
  board?: BoardKind
}

export function Ladder({
  rows,
  filtered,
  viewMode,
  rule,
  selectedCode,
  refreshing,
  onRefresh,
  onReset,
  onSelect,
  onContextStock,
  board = "lxsz",
}: Props) {
  if (!rows.length) {
    return (
      <div className="empty-state-modern">
        <div className="empty-glow-orb" />
        <div className="empty-icon-wrap">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <h3>暂无行情数据</h3>
        <p>系统尚未抓取到最新交易日天梯数据，点击下方一键开始同步</p>
        <button type="button" className="btn primary pulse-btn" onClick={onRefresh} disabled={refreshing}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
          {refreshing ? "正在极速抓取…" : "立即抓取行情"}
        </button>
      </div>
    )
  }

  if (!filtered.length) {
    return (
      <div className="empty-state-modern">
        <div className="empty-icon-wrap subtle">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <h3>未找到符合条件的标的</h3>
        <p>当前高级筛选或搜索关键词过滤了所有股票，您可以一键重置筛选条件</p>
        <button type="button" className="btn" onClick={onReset}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          重置筛选条件
        </button>
      </div>
    )
  }

  if (viewMode === "list") {
    return (
      <div className="table-wrap">
        <table className="list modern-table">
          <thead>
            <tr>
              <th>股票标的</th>
              <th className="num">{board === "lxsz" ? "连涨天数" : "连板身位"}</th>
              <th className="num">{board === "jjzt" ? "今开涨幅" : board === "zt" ? "今日涨跌" : "连涨累计"}</th>
              <th className="num">现价</th>
              <th className="num">今日涨跌</th>
              <th className="num">实体涨幅</th>
              <th className="num">散户指数</th>
              <th className="num">换手率</th>
              <th className="num">量比</th>
              <th>所属板块</th>
              <th style={{ width: 68, textAlign: "center" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <StockTableRow
                key={item["股票代码"]}
                item={item}
                rule={rule}
                active={selectedCode === item["股票代码"]}
                board={board}
                onSelect={onSelect}
                onContextStock={onContextStock}
              />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const groups = groupByDays(filtered)
  return (
    <div className="ladder-list">
      {groups.map((group) => {
        const isTopTier = group.day >= 4
        return (
          <section className={`group ${isTopTier ? "top-stage" : ""}`} key={group.day}>
            <div className="group-h modern-stage-header">
              <div className="stage-left">
                <span className={`stage-badge ${isTopTier ? "top-badge" : ""}`}>
                  {isTopTier ? <span className="stage-fire" aria-hidden="true">🔥</span> : null}
                  {group.day}
                </span>
                <div className="stage-info">
                  <span className="stage-title">
                    {board === "lxsz"
                      ? `${group.day} 天连续收阳`
                      : board === "jjzt"
                        ? `昨日 ${group.day} 连板梯队`
                        : `${group.day} 连板空间板`}
                  </span>
                  <span className="stage-count">
                    共 <b>{group.items.length}</b> 只标的
                  </span>
                </div>
              </div>
            </div>

            <div className="cards modern-cards-grid">
              {group.items.map((item) => (
                <StockCard
                  key={item["股票代码"]}
                  item={item}
                  rule={rule}
                  active={selectedCode === item["股票代码"]}
                  onSelect={onSelect}
                  onContextStock={onContextStock}
                  board={board}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function StockTableRow({
  item,
  rule,
  active,
  board,
  onSelect,
  onContextStock,
}: {
  item: StockRow
  rule: HighlightRule
  active: boolean
  board: BoardKind
  onSelect: (code: string) => void
  onContextStock: (item: StockRow, x: number, y: number) => void
}) {
  const todayPct = getTodayPct(item)
  const bodyPct = getBodyPct(item)
  const pctValue = normalizeNumber(item["连续涨跌幅"])
  const hl = shouldHighlight(item, rule)
  const retail = getRetailIndex(item)
  const retailColor = retail === null ? "flat" : retail > 0 ? "up" : "down"
  const code = item["股票代码"]
  const press = useLongPress((x, y) => onContextStock(item, x, y))

  return (
    <tr
      className={`table-row-modern ${active ? "active" : ""}`}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={(e) => {
        if (press.consumeClick(e)) return
        onSelect(code)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextStock(item, e.clientX, e.clientY)
      }}
    >
      <td>
        <div className="table-stock-name">
          <span className="name-text">{item["股票简称"]}</span>
          {hl ? <span className="highlight-star" title="满足精选规则">⭐️</span> : null}
          <TonghuashunButton code={code} name={item["股票简称"]} />
        </div>
        <span className="table-stock-code">{code}</span>
      </td>
      <td className="num">
        <span className="tier-number-highlight">{item["连涨天数"]}</span>
        <span className="unit-label">{board === "lxsz" ? "天" : "板"}</span>
      </td>
      <td className={`num ${pctClass(pctValue)}`} style={{ fontWeight: 700, fontSize: 14 }}>
        {board === "jjzt"
          ? item["今开涨幅"] || item["今日涨跌幅"] || "--"
          : item["连续涨跌幅"] || "--"}
      </td>
      <td className="num price-cell">{item["现价"] || "--"}</td>
      <td className={`num ${pctClass(todayPct ?? 0)}`} style={{ fontWeight: 600 }}>
        {item["今日涨跌幅"] || "--"}
      </td>
      <td className={`num ${pctClass(bodyPct ?? 0)}`} style={{ fontWeight: 600 }}>
        {item["实体涨幅"] || "--"}
      </td>
      <td className={`num ${retailColor}`}>
        {item["散户指数"] ? `${item["散户指数"]}` : "--"}
      </td>
      <td className="num">{item["今日换手率"] || "--"}</td>
      <td className="num font-mono">{formatVolumeRatio(item)}</td>
      <td>
        <span className="tag-industry">
          {item["所属行业"] || "其他"}
        </span>
      </td>
      <td style={{ textAlign: "center" }}>
        <button
          type="button"
          className="row-ai-btn"
          title="DeepSeek AI 短线分析"
          onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            onContextStock(item, rect.left, rect.bottom + 4)
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </button>
      </td>
    </tr>
  )
}

function StockCard({
  item,
  rule,
  active,
  onSelect,
  onContextStock,
  board = "lxsz",
}: {
  item: StockRow
  rule: HighlightRule
  active: boolean
  onSelect: (code: string) => void
  onContextStock: (item: StockRow, x: number, y: number) => void
  board?: BoardKind
}) {
  const pctValue = normalizeNumber(item["连续涨跌幅"])
  const todayPct = getTodayPct(item)
  const bodyPct = getBodyPct(item)
  const retail = getRetailIndex(item)
  const hl = shouldHighlight(item, rule)
  const retailClass = retail === null ? "flat" : retail > 0 ? "in" : "out"
  const retailIcon = retail === null ? "" : retail > 0 ? "▲" : "▼"
  const [copied, setCopied] = useState(false)
  const press = useLongPress((x, y) => onContextStock(item, x, y))

  const handleCopyCode = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(item["股票代码"])
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`stock-card-modern ${hl ? "highlight" : ""} ${active ? "active" : ""}`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(item["股票代码"])
        }
      }}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={(e) => {
        if (press.consumeClick(e)) return
        onSelect(item["股票代码"])
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextStock(item, e.clientX, e.clientY)
      }}
    >
      {/* 卡片头部：标的名称与代码胶囊 */}
      <div className="card-header-modern">
        <div className="card-brand">
          <div className="card-name-row">
            <span className="card-stock-name">{item["股票简称"]}</span>
            {hl ? <span className="gold-pill-star" title="满足精选规则">⭐️ 精选</span> : null}
          </div>
          <button
            type="button"
            className="code-capsule-btn"
            onClick={handleCopyCode}
            title="点击复制股票代码"
          >
            <span>{item["股票代码"]}</span>
            {copied ? (
              <span className="copied-text">已复制</span>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>

        {/* 快捷操作：手机端同花顺 + AI 分析 */}
        <div className="card-actions-quick">
          <TonghuashunButton code={item["股票代码"]} name={item["股票简称"]} />
          <button
            type="button"
            className="card-quick-ai-btn"
            title="一键唤起 DeepSeek AI 短线复盘分析"
            onClick={(e) => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              onContextStock(item, rect.left, rect.bottom + 4)
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>AI</span>
          </button>
        </div>
      </div>

      {/* 核心涨势数字区域 */}
      <div className="card-hero-metric">
        <div className="hero-metric-content">
          <span className="hero-metric-label">
            {board === "jjzt" ? "今开涨幅" : board === "zt" ? "连板高度" : "连涨累计"}
          </span>
          <span className={`hero-metric-val ${board === "lxsz" ? pctClass(pctValue) : "up"}`}>
            {board === "zt"
              ? `${item["连涨天数"] || "--"} 板`
              : board === "jjzt"
                ? item["今开涨幅"] || item["今日涨跌幅"] || "--"
                : item["连续涨跌幅"] || "--"}
          </span>
        </div>

        <div className="hero-sub-stats">
          <div className={`sub-stat-pill ${pctClass(todayPct ?? 0)}`}>
            <span className="sub-stat-tag">今日</span>
            <span>{item["今日涨跌幅"] || "--"}</span>
          </div>
          <div className={`sub-stat-pill ${pctClass(bodyPct ?? 0)}`}>
            <span className="sub-stat-tag">实体</span>
            <span>{item["实体涨幅"] || "--"}</span>
          </div>
        </div>
      </div>

      {/* 核心指标微网格 */}
      <div className="card-metrics-grid">
        <div className="metric-cell">
          <span className="m-label">现价</span>
          <span className="m-val price font-mono">{item["现价"] || "--"}</span>
        </div>
        <div className="metric-cell">
          <span className="m-label">换手</span>
          <span className="m-val font-mono">{item["今日换手率"] || "--"}</span>
        </div>
        <div className="metric-cell">
          <span className="m-label">量比</span>
          <span className="m-val font-mono highlight-vol">{formatVolumeRatio(item)}</span>
        </div>
      </div>

      {/* 游资特异性标签栏 */}
      <div className="card-tags-cloud">
        <span className="modern-tag industry">{item["所属行业"] || "板块未知"}</span>

        <span className={`modern-tag retail ${retailClass}`}>
          散户 {retailIcon} {item["散户指数"] || "--"}
        </span>

        {board === "zt" && item["首次封板"] ? (
          <span className="modern-tag seal-time" title={`首次封板时刻: ${item["首次封板"]}`}>
            首封 {item["首次封板"].length > 5 ? item["首次封板"].slice(0, 5) : item["首次封板"]}
          </span>
        ) : null}

        {board === "zt" && item["炸板次数"] && item["炸板次数"] !== "0" ? (
          <span className="modern-tag broken-times" title={`盘中炸板 ${item["炸板次数"]} 次`}>
            炸 {item["炸板次数"]} 次
          </span>
        ) : null}

        {board === "jjzt" && item["今开涨幅"] ? (
          <span className="modern-tag open-gain">
            开盘 {item["今开涨幅"]}
          </span>
        ) : null}
      </div>
    </div>
  )
}
