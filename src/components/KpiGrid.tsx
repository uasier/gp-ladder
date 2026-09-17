import type { BoardKind, Snapshot } from "../types"

export function KpiGrid({ snapshot, board }: { snapshot: Snapshot; board: BoardKind }) {
  const zt = board === "zt" || board === "jjzt"
  return (
    <section className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-label">
          <span>
            {board === "jjzt" ? "昨涨今红 2–8%" : board === "zt" ? "涨停标的总数" : "连涨标的总数"}
          </span>
        </div>
        <div className="kpi-val">
          {snapshot.count} <small>只</small>
        </div>
        <div className="kpi-sub">
          {board === "jjzt"
            ? "昨日涨停且今日竞价后涨幅 2%–8%"
            : board === "zt"
              ? "东方财富涨停池全样本"
              : "同花顺连涨榜全样本"}
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">
          <span>{zt ? "最高连板高度" : "最高连涨天梯"}</span>
        </div>
        <div className="kpi-val gold">
          {snapshot.maxDays} <small>{zt ? "板" : "天"}</small>
        </div>
        <div className="kpi-sub">{zt ? "当前连板龙头高度" : "当前领涨龙头高度"}</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">
          <span>最新行情时间</span>
        </div>
        <div className="kpi-val" style={{ fontSize: 15, fontWeight: 600 }}>
          {snapshot.quoteAt || "--"}
        </div>
        <div className="kpi-sub">东方财富盘口数据</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">
          <span>榜单抓取时间</span>
        </div>
        <div className="kpi-val" style={{ fontSize: 15, fontWeight: 600 }}>
          {snapshot.updatedAt || "尚未刷新"}
        </div>
        <div className="kpi-sub">仅手动刷新时更新</div>
      </div>
    </section>
  )
}
