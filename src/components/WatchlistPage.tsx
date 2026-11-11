import { useMemo, useState } from "react"
import type { RefObject } from "react"
import type { BoardKind } from "../types"
import { pctClass } from "../stock"
import { TonghuashunButton } from "./TonghuashunButton"
import {
  changeSinceAdded,
  filterWatchEntries,
  formatAmount,
  formatSignedPct,
  formatWatchPrice,
  parseWatchSort,
  sortWatchEntries,
  sourceLabel,
  watchSortValue,
  type WatchEntry,
  type WatchQuote,
  type WatchSortDir,
  type WatchSortKey,
} from "../watchlist"

type Props = {
  items: WatchEntry[]
  quotes: Record<string, WatchQuote | undefined>
  loaded: boolean
  error: string | null
  refreshing: boolean
  quoteError: string | null
  searchRef?: RefObject<HTMLInputElement | null>
  onAdd: () => void
  onEdit: (entry: WatchEntry) => void
  onRemove: (code: string) => void | Promise<void>
  onOpen: (entry: WatchEntry) => void
  onRefresh: () => void
  onRetry: () => void
  onOpenPage: (page: BoardKind) => void
}

const SORTS: Array<[string, string]> = [
  ["addedDate:desc", "自选日期 · 新到旧"],
  ["addedDate:asc", "自选日期 · 旧到新"],
  ["addedPrice:desc", "自选价格 · 高到低"],
  ["addedPrice:asc", "自选价格 · 低到高"],
  ["change:desc", "自选以来 · 涨幅高"],
  ["change:asc", "自选以来 · 跌幅深"],
  ["todayPct:desc", "今日涨跌 · 高到低"],
  ["name:asc", "名称"],
  ["code:asc", "代码"],
  ["reason:asc", "原因"],
]

export function WatchlistPage({
  items,
  quotes,
  loaded,
  error,
  refreshing,
  quoteError,
  searchRef,
  onAdd,
  onEdit,
  onRemove,
  onOpen,
  onRefresh,
  onRetry,
  onOpenPage,
}: Props) {
  const [keyword, setKeyword] = useState("")
  const [sortKey, setSortKey] = useState<WatchSortKey>("addedDate")
  const [sortDir, setSortDir] = useState<WatchSortDir>("desc")
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const visible = useMemo(
    () => sortWatchEntries(filterWatchEntries(items, keyword), quotes, sortKey, sortDir),
    [items, keyword, quotes, sortKey, sortDir],
  )
  const compared = items.map((item) => changeSinceAdded(item.addedPrice, quotes[item.code]?.price))
  const above = compared.filter((value) => value != null && value > 0).length
  const below = compared.filter((value) => value != null && value < 0).length

  function toggleSort(key: WatchSortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(key === "name" || key === "code" || key === "reason" ? "asc" : "desc")
  }

  async function confirmRemove(code: string) {
    setRemoving(true)
    try {
      await onRemove(code)
      setPendingCode(null)
    } catch {
      /* 上层已提示失败，保留确认状态以便重试。 */
    } finally {
      setRemoving(false)
    }
  }

  if (!loaded) {
    return <div className="empty-state-modern"><h3>正在读取自选池…</h3></div>
  }

  return (
    <section className="watch-page" aria-label="自选池">
      <header className="watch-head">
        <div>
          <h2>自选池</h2>
          <p>记录加入日期、当时价格和原因。现价单独刷新，不会覆盖自选价格。仅作个人记录，不构成投资建议。</p>
        </div>
        <div className="watch-head-actions">
          <button type="button" className="btn" onClick={onRefresh} disabled={refreshing || items.length === 0}>
            {refreshing ? "刷新中…" : "刷新行情"}
          </button>
          <button type="button" className="btn primary" onClick={onAdd}>添加自选</button>
        </div>
      </header>

      <div className="watch-summary">
        <span><strong>{items.length}</strong> 只自选</span>
        <span className="up">现价高于自选 {above}</span>
        <span className="down">现价低于自选 {below}</span>
        {quoteError ? <span className="warn">{quoteError}</span> : null}
      </div>

      {error ? (
        <div className="watch-inline-error">
          <span>自选池读取失败：{error}</span>
          <button type="button" className="btn" onClick={onRetry}>重试</button>
        </div>
      ) : null}

      {items.length === 0 && !error ? (
        <div className="empty-state-modern">
          <div className="empty-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <h3>还没有自选股票</h3>
          <p>从连涨、涨停或昨日涨停里加入，也可以手动填写代码、价格和原因。</p>
          <div className="watch-empty-actions">
            <button type="button" className="btn primary" onClick={onAdd}>手动添加</button>
            <button type="button" className="btn" onClick={() => onOpenPage("lxsz")}>去连涨天梯挑选</button>
          </div>
        </div>
      ) : (
        <>
          <div className="watch-toolbar">
            <label className="watch-search">
              <input
                ref={searchRef}
                type="search"
                value={keyword}
                placeholder="搜索代码、名称、行业或原因"
                aria-label="搜索自选"
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <label className="watch-sort">
              <span>排序</span>
              <select
                value={watchSortValue(sortKey, sortDir)}
                aria-label="自选排序"
                onChange={(event) => {
                  const next = parseWatchSort(event.target.value)
                  setSortKey(next.key)
                  setSortDir(next.dir)
                }}
              >
                {SORTS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <span className="watch-count">{visible.length} / {items.length}</span>
          </div>

          {visible.length === 0 ? (
            <div className="empty-state-modern">
              <h3>没有匹配的自选</h3>
              <button type="button" className="btn" onClick={() => setKeyword("")}>清空搜索</button>
            </div>
          ) : (
            <>
              <div className="watch-table-wrap">
                <table className="watch-table">
                  <thead>
                    <tr>
                      <th><SortButton label="股票" active={sortKey === "name" || sortKey === "code"} dir={sortDir} onClick={() => toggleSort("name")} /></th>
                      <th>行业</th>
                      <th><SortButton label="自选日期" active={sortKey === "addedDate"} dir={sortDir} onClick={() => toggleSort("addedDate")} /></th>
                      <th className="num"><SortButton label="自选价格" active={sortKey === "addedPrice"} dir={sortDir} onClick={() => toggleSort("addedPrice")} /></th>
                      <th className="num">现价</th>
                      <th className="num"><SortButton label="自选以来" active={sortKey === "change"} dir={sortDir} onClick={() => toggleSort("change")} /></th>
                      <th className="num"><SortButton label="今日" active={sortKey === "todayPct"} dir={sortDir} onClick={() => toggleSort("todayPct")} /></th>
                      <th className="num">连涨</th>
                      <th className="num">连板</th>
                      <th className="num">换手</th>
                      <th className="num">量比</th>
                      <th><SortButton label="自选原因" active={sortKey === "reason"} dir={sortDir} onClick={() => toggleSort("reason")} /></th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <WatchRow
                        key={item.code}
                        item={item}
                        quote={quotes[item.code]}
                        pending={pendingCode === item.code}
                        removing={removing}
                        onOpen={() => onOpen(item)}
                        onEdit={() => onEdit(item)}
                        onAskRemove={() => setPendingCode(item.code)}
                        onCancelRemove={() => setPendingCode(null)}
                        onConfirmRemove={() => void confirmRemove(item.code)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="watch-cards">
                {visible.map((item) => (
                  <WatchCard
                    key={item.code}
                    item={item}
                    quote={quotes[item.code]}
                    pending={pendingCode === item.code}
                    removing={removing}
                    onOpen={() => onOpen(item)}
                    onEdit={() => onEdit(item)}
                    onAskRemove={() => setPendingCode(item.code)}
                    onCancelRemove={() => setPendingCode(null)}
                    onConfirmRemove={() => void confirmRemove(item.code)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

function SortButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: WatchSortDir; onClick: () => void }) {
  return (
    <button type="button" className={active ? "on" : ""} onClick={onClick} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      {label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  )
}

function WatchRow({
  item,
  quote,
  pending,
  removing,
  onOpen,
  onEdit,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: RowProps) {
  const change = changeSinceAdded(item.addedPrice, quote?.price)
  return (
    <tr className={pending ? "is-pending" : ""}>
      <td>
        <button type="button" className="watch-name" onClick={onOpen}>
          <strong>{item.name}</strong>
          <span>{item.code}</span>
        </button>
        <em>{sourceLabel(item.source)}</em>
      </td>
      <td>{item.industry || "—"}</td>
      <td title={`记录于 ${item.createdAt}`}>{item.addedDate}</td>
      <td className="num">{formatWatchPrice(item.addedPrice)}</td>
      <td className="num">{formatWatchPrice(quote?.price)}</td>
      <td className={`num ${pctClass(change)}`}>{formatSignedPct(change)}</td>
      <td className={`num ${pctClass(quote?.changePct)}`}>{formatSignedPct(quote?.changePct)}</td>
      <td className="num">{quote?.riseDays == null ? "--" : `${quote.riseDays}天`}</td>
      <td className="num">{quote?.limitDays ? `${quote.limitDays}板` : "--"}</td>
      <td className="num">{formatSignedPct(quote?.turnover)}</td>
      <td className="num">{quote?.volumeRatio == null ? "--" : quote.volumeRatio.toFixed(2)}</td>
      <td><span className="watch-reason" title={item.reason}>{item.reason}</span></td>
      <td><RowActions item={item} pending={pending} removing={removing} onEdit={onEdit} onAskRemove={onAskRemove} onCancelRemove={onCancelRemove} onConfirmRemove={onConfirmRemove} /></td>
    </tr>
  )
}

function WatchCard(props: RowProps) {
  const { item, quote, onOpen } = props
  const change = changeSinceAdded(item.addedPrice, quote?.price)
  return (
    <article className={`watch-card ${props.pending ? "is-pending" : ""}`}>
      <button type="button" className="watch-card-main" onClick={onOpen}>
        <div className="watch-card-title">
          <strong>{item.name}</strong>
          <span>{item.code}</span>
          <em>{sourceLabel(item.source)}</em>
        </div>
        <p>{item.reason}</p>
      </button>
      <dl>
        <div><dt>自选日期</dt><dd>{item.addedDate}</dd></div>
        <div><dt>自选价格</dt><dd>{formatWatchPrice(item.addedPrice)}</dd></div>
        <div><dt>现价</dt><dd>{formatWatchPrice(quote?.price)}</dd></div>
        <div><dt>自选以来</dt><dd className={pctClass(change)}>{formatSignedPct(change)}</dd></div>
        <div><dt>今日</dt><dd className={pctClass(quote?.changePct)}>{formatSignedPct(quote?.changePct)}</dd></div>
        <div><dt>连涨</dt><dd>{quote?.riseDays == null ? "--" : `${quote.riseDays}天`}</dd></div>
        <div><dt>连板</dt><dd>{quote?.limitDays ? `${quote.limitDays}板` : "--"}</dd></div>
        <div><dt>换手</dt><dd>{formatSignedPct(quote?.turnover)}</dd></div>
        <div><dt>量比</dt><dd>{quote?.volumeRatio == null ? "--" : quote.volumeRatio.toFixed(2)}</dd></div>
        <div><dt>成交额</dt><dd>{formatAmount(quote?.amount) || "--"}</dd></div>
        <div><dt>行业</dt><dd>{quote?.industry || item.industry || "—"}</dd></div>
      </dl>
      <RowActions {...props} />
    </article>
  )
}

type RowProps = {
  item: WatchEntry
  quote?: WatchQuote
  pending: boolean
  removing: boolean
  onOpen: () => void
  onEdit: () => void
  onAskRemove: () => void
  onCancelRemove: () => void
  onConfirmRemove: () => void
}

function RowActions({ item, pending, removing, onEdit, onAskRemove, onCancelRemove, onConfirmRemove }: Omit<RowProps, "quote" | "onOpen">) {
  return (
    <div className="watch-actions">
      <TonghuashunButton code={item.code} name={item.name} />
      <button type="button" className="btn" onClick={onEdit}>编辑</button>
      {pending ? (
        <>
          <button type="button" className="btn danger" onClick={onConfirmRemove} disabled={removing}>
            {removing ? "移除中…" : "确认移除"}
          </button>
          <button type="button" className="btn" onClick={onCancelRemove} disabled={removing}>取消</button>
        </>
      ) : (
        <button type="button" className="btn danger" onClick={onAskRemove}>移除</button>
      )}
    </div>
  )
}
