import type { BoardKind, HighlightRule, StockRow, ViewMode } from "../types"
import {
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
      <div className="empty">
        <div className="empty-icon">📡</div>
        <p>尚未刷新实时数据，当前没有缓存榜单</p>
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "正在刷新…" : "刷新实时数据"}
        </button>
      </div>
    )
  }
  if (!filtered.length) {
    return (
      <div className="empty">
        <div className="empty-icon">🔍</div>
        <p>
          暂无符合当前筛选条件的
          {board === "jjzt" ? "昨涨今红" : board === "zt" ? "涨停" : "连涨"}标的
        </p>
        <button type="button" onClick={onReset}>
          重置所有筛选条件
        </button>
      </div>
    )
  }
  if (viewMode === "list") {
    return (
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>股票标的</th>
              <th className="num">{board === "lxsz" ? "连涨天数" : "连板"}</th>
              <th className="num">{board === "jjzt" ? "今开涨幅" : board === "zt" ? "今日涨跌" : "连涨累计"}</th>
              <th className="num">现价</th>
              <th className="num">今日涨跌</th>
              <th className="num">实体涨幅</th>
              <th className="num">散户指数</th>
              <th className="num">今日换手</th>
              <th>所属行业</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const todayPct = getTodayPct(item)
              const bodyPct = getBodyPct(item)
              const pctValue = normalizeNumber(item["连续涨跌幅"])
              const hl = shouldHighlight(item, rule)
              const retail = getRetailIndex(item)
              const retailColor = retail === null ? "flat" : retail > 0 ? "up" : "down"
              const code = item["股票代码"]
              return (
                <tr
                  key={code}
                  className={selectedCode === code ? "active" : ""}
                  onClick={() => onSelect(code)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onContextStock(item, e.clientX, e.clientY)
                  }}
                >
                  <td>
                    <div className="table-stock-name">
                      <span>{item["股票简称"]}</span>
                      {hl ? <span className="badge">⭐️ 精选</span> : null}
                    </div>
                    <span className="code">{code}</span>
                  </td>
                  <td className="num">
                    <span style={{ fontWeight: 700, color: "var(--gold)" }}>{item["连涨天数"]}</span>{" "}
                    {board === "lxsz" ? "天" : "板"}
                  </td>
                  <td className={`num ${pctClass(pctValue)}`} style={{ fontWeight: 700, fontSize: 14 }}>
                    {board === "jjzt"
                      ? item["今开涨幅"] || item["今日涨跌幅"] || "--"
                      : item["连续涨跌幅"] || "--"}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {item["现价"] || "--"}
                  </td>
                  <td className={`num ${pctClass(todayPct ?? 0)}`} style={{ fontWeight: 600 }}>
                    {item["今日涨跌幅"] || "--"}
                  </td>
                  <td className={`num ${pctClass(bodyPct ?? 0)}`} style={{ fontWeight: 600 }}>
                    {item["实体涨幅"] || "--"}
                  </td>
                  <td className={`num ${retailColor}`}>{item["散户指数"] || "--"}</td>
                  <td className="num">{item["今日换手率"] || "--"}</td>
                  <td>
                    <span className="tag" style={{ margin: 0 }}>
                      {item["所属行业"] || ""}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }
  const groups = groupByDays(filtered)
  return (
    <div className="ladder-list">
      {groups.map((group) => (
        <section className="group" key={group.day}>
          <div className="group-h">
            <span className="group-badge">{group.day}</span>
            <div className="t">
              {board === "jjzt" ? "昨涨今红" : board === "zt" ? "涨停天梯" : "连涨天梯"} <b>{group.day}</b>
              {board === "lxsz" ? " 连涨阶梯" : " 连板"} · 包含 <b>{group.items.length}</b> 只标的
            </div>
          </div>
          <div className="cards">
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
      ))}
    </div>
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
  const retailIcon = retail === null ? "" : retail > 0 ? "▲ 净流入" : "▼ 净流出"
  return (
    <button
      type="button"
      className={`stock-card${hl ? " highlight" : ""}${active ? " active" : ""}`}
      onClick={() => onSelect(item["股票代码"])}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextStock(item, e.clientX, e.clientY)
      }}
    >
      <div className="card-top">
        <div>
          <div className="code-wrap">
            <span className="code">{item["股票代码"] || ""}</span>
          </div>
          <div className="name">{item["股票简称"]}</div>
        </div>
        {hl ? <span className="badge">⭐️ 精选</span> : null}
      </div>
      <div className="card-main-stat">
        <span className="pct-label">
          {board === "jjzt" ? "今开涨幅" : board === "zt" ? "连板" : "连涨累计"}
        </span>
        <span className={`pct-value ${board === "lxsz" ? pctClass(pctValue) : "up"}`}>
          {board === "zt"
            ? `${item["连涨天数"] || "--"} 板`
            : board === "jjzt"
              ? item["今开涨幅"] || item["今日涨跌幅"] || "--"
              : item["连续涨跌幅"] || "--"}
        </span>
      </div>
      <div className="quote-row">
        <div>
          现价 <span className="quote-price">{item["现价"] || "--"}</span>
        </div>
        <div className={`quote-today ${pctClass(todayPct ?? 0)}`}>今 {item["今日涨跌幅"] || "--"}</div>
        <div className={`quote-today ${pctClass(bodyPct ?? 0)}`}>实体 {item["实体涨幅"] || "--"}</div>
      </div>
      <div className="tags">
        <span className="tag">{item["所属行业"] || "未知"}</span>
        <span className={`tag ${retailClass}`}>
          散户 {item["散户指数"] || "--"} {retailIcon}
        </span>
      </div>
    </button>
  )
}
