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
          <span className="kpi-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
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
          <span className="kpi-icon" aria-hidden="true" style={{ color: "var(--gold)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </span>
        </div>
        <div className="kpi-val gold">
          {snapshot.maxDays} <small>{zt ? "板" : "天"}</small>
        </div>
        <div className="kpi-sub">{zt ? "当前连板龙头高度" : "当前领涨龙头高度"}</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">
          <span>最新行情时间</span>
          <span className="kpi-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
        </div>
        <div className="kpi-val" style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          {snapshot.quoteAt || "--"}
        </div>
        <div className="kpi-sub">东方财富盘口数据</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">
          <span>榜单抓取时间</span>
          <span className="kpi-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </span>
        </div>
        <div className="kpi-val" style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          {snapshot.updatedAt || "尚未刷新"}
        </div>
        <div className="kpi-sub">仅手动刷新时更新</div>
      </div>
    </section>
  )
}
