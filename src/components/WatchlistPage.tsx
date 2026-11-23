import { useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import type { BoardKind } from "../types"
import { pctClass } from "../stock"
import { TonghuashunButton } from "./TonghuashunButton"
import { exportWatchXlsx } from "../watchExport"
import {
  EMPTY_WATCH_QUERY,
  WATCH_COLUMNS,
  WATCH_PREFS_KEY,
  applyWatchQuery,
  columnById,
  defaultWatchPrefs,
  exportHeader,
  formatWatchCell,
  loadWatchPrefs,
  moveColumn,
  serializeWatchPrefs,
  toggleColumn,
  visibleColumns,
  watchCell,
  watchExportFilename,
  watchIndustryOptions,
  watchMarketOptions,
  type WatchColumnId,
  type WatchPrefs,
  type WatchQuery,
  type WatchRangeKey,
} from "../watchView"
import {
  changeSinceAdded,
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
  ["price:desc", "现价 · 高到低"],
  ["price:asc", "现价 · 低到高"],
  ["change:desc", "自选以来 · 涨幅高"],
  ["change:asc", "自选以来 · 跌幅深"],
  ["todayPct:desc", "今日涨跌 · 高到低"],
  ["todayPct:asc", "今日涨跌 · 低到高"],
  ["riseDays:desc", "连涨天数 · 多到少"],
  ["riseDays:asc", "连涨天数 · 少到多"],
  ["name:asc", "名称"],
  ["code:asc", "代码"],
  ["reason:asc", "原因"],
]

const RANGE_COLUMNS = WATCH_COLUMNS.filter((column) => column.range)

function readStoredPrefs(): { prefs: WatchPrefs; repaired: boolean } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(WATCH_PREFS_KEY)
  } catch {
    raw = null
  }
  const width = typeof window === "undefined" ? 1200 : window.innerWidth
  return loadWatchPrefs(raw, width <= 860 ? "cards" : "list")
}

function storePrefs(prefs: WatchPrefs) {
  try {
    localStorage.setItem(WATCH_PREFS_KEY, serializeWatchPrefs(prefs))
  } catch {
    /* 偏好写不进去时仍使用当前内存配置，不改自选记录。 */
  }
}

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
  const initial = useRef(readStoredPrefs())
  const [prefs, setPrefs] = useState<WatchPrefs>(initial.current.prefs)
  const [query, setQuery] = useState<WatchQuery>(EMPTY_WATCH_QUERY)
  const [sortKey, setSortKey] = useState<WatchSortKey>("addedDate")
  const [sortDir, setSortDir] = useState<WatchSortDir>("desc")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportScope, setExportScope] = useState<"all" | "filtered">("filtered")
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    if (initial.current.repaired) storePrefs(initial.current.prefs)
  }, [])

  const columns = useMemo(() => visibleColumns(prefs), [prefs])
  const filtered = useMemo(() => applyWatchQuery(items, quotes, query), [items, quotes, query])
  const sortedAll = useMemo(
    () => sortWatchEntries(items, quotes, sortKey, sortDir),
    [items, quotes, sortKey, sortDir],
  )
  const visible = useMemo(
    () => sortWatchEntries(filtered.items, quotes, sortKey, sortDir),
    [filtered.items, quotes, sortKey, sortDir],
  )
  const markets = useMemo(() => watchMarketOptions(items), [items])
  const industries = useMemo(() => watchIndustryOptions(items, quotes), [items, quotes])
  const compared = items.map((item) => changeSinceAdded(item.addedPrice, quotes[item.code]?.price))
  const above = compared.filter((value) => value != null && value > 0).length
  const below = compared.filter((value) => value != null && value < 0).length
  const exportCount = exportScope === "all" ? sortedAll.length : visible.length
  const sortValue = watchSortValue(sortKey, sortDir)
  const sortOptions = SORTS.some(([value]) => value === sortValue)
    ? SORTS
    : [[sortValue, `${columnLabel(sortKey)} · ${sortDir === "asc" ? "升序" : "降序"}`], ...SORTS] as Array<[string, string]>

  function commitPrefs(next: WatchPrefs) {
    setPrefs(next)
    storePrefs(next)
  }

  function toggleSort(key: WatchSortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(key === "name" || key === "code" || key === "reason" || key === "market" || key === "industry" || key === "source" ? "asc" : "desc")
  }

  function resetQuery() {
    setQuery(EMPTY_WATCH_QUERY)
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

  async function runExport() {
    const rows = exportScope === "all" ? sortedAll : visible
    if (rows.length === 0 || columns.length === 0) return
    setExporting(true)
    setExportNote(null)
    try {
      const result = await exportWatchXlsx({ columns, rows, quotes })
      if (result.status === "cancelled") return
      setExportNote({ tone: "ok", text: `已保存 ${result.filename}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setExportNote({ tone: "error", text: `导出失败：${message}` })
    } finally {
      setExporting(false)
    }
  }

  if (!loaded) {
    return <div className="empty-state-modern"><h3>正在读取自选池…</h3></div>
  }

  const actions = (item: WatchEntry) => ({
    item,
    pending: pendingCode === item.code,
    removing,
    onEdit: () => onEdit(item),
    onAskRemove: () => setPendingCode(item.code),
    onCancelRemove: () => setPendingCode(null),
    onConfirmRemove: () => void confirmRemove(item.code),
  })

  return (
    <section className={`watch-page is-${prefs.view}`} aria-label="自选池">
      <header className="watch-head">
        <div>
          <h2>自选池</h2>
          <p>记录加入日期、当时价格和原因。现价单独刷新，不会覆盖自选价格。仅作个人记录，不构成投资建议。</p>
        </div>
        <div className="watch-head-actions">
          <div className="view-mode-toggle" role="group" aria-label="自选视图">
            <button type="button" className={prefs.view === "cards" ? "on" : ""} onClick={() => commitPrefs({ ...prefs, view: "cards" })}>卡片</button>
            <button type="button" className={prefs.view === "list" ? "on" : ""} onClick={() => commitPrefs({ ...prefs, view: "list" })}>列表</button>
          </div>
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
                value={query.keyword}
                placeholder="搜索代码、名称、行业或原因"
                aria-label="搜索自选"
                onChange={(event) => setQuery({ ...query, keyword: event.target.value })}
              />
            </label>
            <label className="watch-sort">
              <span>市场</span>
              <select aria-label="市场筛选" value={query.market} onChange={(event) => setQuery({ ...query, market: event.target.value })}>
                <option value="">全部市场</option>
                {markets.map((market) => <option key={market} value={market}>{market}</option>)}
              </select>
            </label>
            <label className="watch-sort">
              <span>行业</span>
              <select aria-label="行业筛选" value={query.industry} onChange={(event) => setQuery({ ...query, industry: event.target.value })}>
                <option value="">全部行业</option>
                {industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
              </select>
            </label>
            <label className="watch-sort">
              <span>排序</span>
              <select
                value={sortValue}
                aria-label="自选排序"
                onChange={(event) => {
                  const next = parseWatchSort(event.target.value)
                  setSortKey(next.key)
                  setSortDir(next.dir)
                }}
              >
                {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" className={`btn${filtersOpen ? " primary" : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>区间筛选</button>
            <button type="button" className={`btn${columnsOpen ? " primary" : ""}`} aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)}>展示字段</button>
            <button
              type="button"
              className="btn"
              disabled={items.length === 0}
              title={items.length === 0 ? "没有可导出的自选" : "导出 Excel"}
              onClick={() => {
                setExportScope(visible.length === 0 ? "all" : "filtered")
                setExportOpen((open) => !open)
              }}
            >
              导出 Excel
            </button>
            <span className="watch-count">筛选后 {visible.length} / {items.length}</span>
          </div>

          {filtersOpen ? (
            <div className="watch-panel" aria-label="区间筛选">
              <div className="watch-panel-head">
                <strong>数值区间</strong>
                <button type="button" className="btn" onClick={resetQuery}>重置筛选</button>
              </div>
              <p>空着表示不限制。缺失行情不会当成 0；0 仍会按 0 参与比较。无效数字或上下限颠倒时，该条件不生效。</p>
              <div className="watch-range-grid">
                {RANGE_COLUMNS.map((column) => {
                  const key = column.id as WatchRangeKey
                  const range = query.ranges[key] ?? { min: "", max: "" }
                  return (
                    <fieldset key={column.id}>
                      <legend>{column.label}{column.unit ? `（${column.unit}）` : ""}</legend>
                      <label>
                        下限
                        <input
                          inputMode="decimal"
                          aria-label={`${column.label}下限`}
                          value={range.min}
                          onChange={(event) => setQuery({ ...query, ranges: { ...query.ranges, [key]: { ...range, min: event.target.value } } })}
                        />
                      </label>
                      <label>
                        上限
                        <input
                          inputMode="decimal"
                          aria-label={`${column.label}上限`}
                          value={range.max}
                          onChange={(event) => setQuery({ ...query, ranges: { ...query.ranges, [key]: { ...range, max: event.target.value } } })}
                        />
                      </label>
                    </fieldset>
                  )
                })}
              </div>
              {filtered.errors.length > 0 ? <p className="watch-form-error">{filtered.errors.join("；")}</p> : null}
            </div>
          ) : null}

          {columnsOpen ? (
            <div className="watch-panel" aria-label="展示字段">
              <div className="watch-panel-head">
                <strong>列表与导出字段</strong>
                <button type="button" className="btn" onClick={() => commitPrefs({ ...prefs, order: defaultWatchPrefs().order, hidden: defaultWatchPrefs().hidden })}>恢复默认</button>
              </div>
              <p>代码和简称始终显示。这里的顺序同时用于列表和 Excel。</p>
              <ul className="watch-column-list">
                {prefs.order.map((id) => {
                  const column = columnById(id)
                  const hidden = prefs.hidden.includes(id)
                  return (
                    <li key={id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!hidden}
                          disabled={column.required}
                          onChange={() => commitPrefs({ ...prefs, hidden: toggleColumn(prefs.hidden, id) })}
                        />
                        {column.label}{column.required ? "（必选）" : ""}
                      </label>
                      <span>
                        <button type="button" className="btn" onClick={() => commitPrefs({ ...prefs, order: moveColumn(prefs.order, id, -1) })}>上移</button>
                        <button type="button" className="btn" onClick={() => commitPrefs({ ...prefs, order: moveColumn(prefs.order, id, 1) })}>下移</button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {exportOpen ? (
            <div className="watch-panel" aria-label="导出 Excel">
              <div className="watch-panel-head">
                <strong>导出 .xlsx</strong>
                <span>文件名类似 {watchExportFilename(new Date(2000, 0, 2, 3, 4, 5)).replace("20000102_030405", "日期_时间")}</span>
              </div>
              <p>在本机生成工作簿，不上传自选。股票代码按文本保存以保留前导零；缺失留空，0 会保留。导出顺序与当前排序一致，列与当前展示字段一致。</p>
              <div className="watch-export-scopes" role="radiogroup" aria-label="导出范围">
                <label>
                  <input type="radio" name="watch-export-scope" checked={exportScope === "all"} onChange={() => setExportScope("all")} />
                  全部自选（{sortedAll.length}）
                </label>
                <label>
                  <input type="radio" name="watch-export-scope" checked={exportScope === "filtered"} disabled={visible.length === 0} onChange={() => setExportScope("filtered")} />
                  当前筛选结果（{visible.length}）
                </label>
              </div>
              <p>本次列：{columns.map(exportHeader).join("、")}</p>
              <div className="watch-editor-actions">
                <button type="button" className="btn primary" disabled={exporting || exportCount === 0} onClick={() => void runExport()}>
                  {exporting ? "正在导出…" : exportCount === 0 ? "没有可导出的行" : `导出 ${exportCount} 行`}
                </button>
                {exportNote?.tone === "error" ? <button type="button" className="btn" onClick={() => void runExport()} disabled={exporting}>重试</button> : null}
              </div>
              {exportNote ? <p className={exportNote.tone === "error" ? "watch-form-error" : "watch-export-ok"}>{exportNote.text}</p> : null}
            </div>
          ) : null}

          {visible.length === 0 ? (
            <div className="empty-state-modern">
              <h3>没有符合筛选条件的自选</h3>
              <button type="button" className="btn" onClick={resetQuery}>重置筛选</button>
            </div>
          ) : prefs.view === "list" ? (
            <div className="watch-table-wrap">
              <table className="watch-table">
                <thead>
                  <tr>
                    {columns.map((id) => {
                      const column = columnById(id)
                      const numeric = column.kind !== "text" && column.kind !== "date"
                      return (
                        <th key={id} className={numeric ? "num" : undefined}>
                          {column.sortKey ? (
                            <SortButton
                              label={exportHeader(id)}
                              active={sortKey === column.sortKey}
                              dir={sortDir}
                              onClick={() => toggleSort(column.sortKey!)}
                            />
                          ) : exportHeader(id)}
                        </th>
                      )
                    })}
                    <th className="sticky-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.code} className={pendingCode === item.code ? "is-pending" : ""}>
                      {columns.map((id) => {
                        const column = columnById(id)
                        const cell = watchCell(id, item, quotes[item.code])
                        const numeric = column.kind !== "text" && column.kind !== "date"
                        const tone = id === "todayPct" || id === "sinceAdded" ? pctClass(cell.kind === "number" ? cell.value : null) : ""
                        return (
                          <td key={id} className={`${numeric ? "num" : ""} ${tone}`.trim()}>
                            {id === "name" || id === "code" ? (
                              <button type="button" className="watch-name" onClick={() => onOpen(item)}>
                                {id === "name" ? <strong>{item.name}</strong> : <span>{item.code}</span>}
                              </button>
                            ) : id === "reason" ? (
                              <span className="watch-reason" title={item.reason}>{formatTableNumber(id, cell)}</span>
                            ) : formatTableNumber(id, cell)}
                          </td>
                        )
                      })}
                      <td className="sticky-actions"><RowActions {...actions(item)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="watch-cards">
              {visible.map((item) => (
                <WatchCard
                  key={item.code}
                  quote={quotes[item.code]}
                  onOpen={() => onOpen(item)}
                  {...actions(item)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function formatTableNumber(id: WatchColumnId, cell: ReturnType<typeof watchCell>): string {
  if (cell.kind === "number" && (id === "todayPct" || id === "sinceAdded" || id === "turnover")) {
    const sign = cell.value > 0 ? "+" : ""
    return `${sign}${cell.value.toFixed(cell.digits)}`
  }
  return formatWatchCell(cell)
}

function columnLabel(key: WatchSortKey): string {
  return WATCH_COLUMNS.find((column) => column.sortKey === key)?.label ?? "排序"
}

function SortButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: WatchSortDir; onClick: () => void }) {
  return (
    <button type="button" className={active ? "on" : ""} onClick={onClick} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      {label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  )
}

function WatchCard({ item, quote, onOpen, ...actions }: RowProps & { onOpen: () => void }) {
  const change = changeSinceAdded(item.addedPrice, quote?.price)
  return (
    <article className={`watch-card ${actions.pending ? "is-pending" : ""}`}>
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
        <div><dt>连板</dt><dd>{quote?.limitDays == null ? "--" : `${quote.limitDays}板`}</dd></div>
        <div><dt>换手</dt><dd>{quote?.turnover == null ? "--" : `${quote.turnover.toFixed(2)}%`}</dd></div>
        <div><dt>量比</dt><dd>{quote?.volumeRatio == null ? "--" : quote.volumeRatio.toFixed(2)}</dd></div>
        <div><dt>成交额</dt><dd>{quote?.amount == null ? "--" : (formatAmount(quote.amount) || "0.00万")}</dd></div>
        <div><dt>行业</dt><dd>{quote?.industry || item.industry || "--"}</dd></div>
      </dl>
      <RowActions {...actions} item={item} />
    </article>
  )
}

type RowProps = {
  item: WatchEntry
  quote?: WatchQuote
  pending: boolean
  removing: boolean
  onEdit: () => void
  onAskRemove: () => void
  onCancelRemove: () => void
  onConfirmRemove: () => void
}

function RowActions({ item, pending, removing, onEdit, onAskRemove, onCancelRemove, onConfirmRemove }: Omit<RowProps, "quote">) {
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
