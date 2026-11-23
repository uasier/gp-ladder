import {
  displayedIndustry,
  sourceLabel,
  watchMarketLabel,
  watchMetric,
  type WatchEntry,
  type WatchQuote,
  type WatchSortKey,
} from "./watchlist"

export const WATCH_PREFS_KEY = "gp_watch_table_prefs"
export const WATCH_PREFS_VERSION = 1

export type WatchViewMode = "cards" | "list"

export type WatchColumnId =
  | "code"
  | "name"
  | "market"
  | "industry"
  | "source"
  | "addedDate"
  | "addedPrice"
  | "price"
  | "todayPct"
  | "sinceAdded"
  | "riseDays"
  | "limitDays"
  | "turnover"
  | "volumeRatio"
  | "amount"
  | "reason"
  | "quoteAt"

export type WatchColumnKind = "text" | "date" | "price" | "pct" | "int" | "number" | "amount"

export type WatchColumn = {
  id: WatchColumnId
  label: string
  kind: WatchColumnKind
  required?: boolean
  sortKey?: WatchSortKey
  unit?: string
  range?: boolean
}

export const WATCH_COLUMNS: WatchColumn[] = [
  { id: "code", label: "股票代码", kind: "text", required: true, sortKey: "code" },
  { id: "name", label: "股票简称", kind: "text", required: true, sortKey: "name" },
  { id: "market", label: "市场", kind: "text", sortKey: "market" },
  { id: "industry", label: "行业", kind: "text", sortKey: "industry" },
  { id: "source", label: "来源", kind: "text", sortKey: "source" },
  { id: "addedDate", label: "自选日期", kind: "date", sortKey: "addedDate" },
  { id: "addedPrice", label: "自选价格", kind: "price", sortKey: "addedPrice", unit: "元", range: true },
  { id: "price", label: "现价", kind: "price", sortKey: "price", unit: "元", range: true },
  { id: "todayPct", label: "今日涨跌幅", kind: "pct", sortKey: "todayPct", unit: "%", range: true },
  { id: "sinceAdded", label: "自选以来收益", kind: "pct", sortKey: "change", unit: "%", range: true },
  { id: "riseDays", label: "连涨天数", kind: "int", sortKey: "riseDays", unit: "天", range: true },
  { id: "limitDays", label: "连板天数", kind: "int", sortKey: "limitDays", unit: "板" },
  { id: "turnover", label: "今日换手率", kind: "pct", sortKey: "turnover", unit: "%", range: true },
  { id: "volumeRatio", label: "量比", kind: "number", sortKey: "volumeRatio", range: true },
  { id: "amount", label: "成交额", kind: "amount", sortKey: "amount", unit: "元" },
  { id: "reason", label: "自选原因", kind: "text", sortKey: "reason" },
  { id: "quoteAt", label: "行情时间", kind: "text", sortKey: "quoteAt" },
]

const COLUMN_IDS = new Set<string>(WATCH_COLUMNS.map((column) => column.id))

export const DEFAULT_WATCH_ORDER: WatchColumnId[] = WATCH_COLUMNS.map((column) => column.id)

export const DEFAULT_WATCH_HIDDEN: WatchColumnId[] = ["source", "limitDays", "turnover", "volumeRatio", "amount", "quoteAt"]

export type WatchPrefs = {
  version: typeof WATCH_PREFS_VERSION
  view: WatchViewMode
  order: WatchColumnId[]
  hidden: WatchColumnId[]
}

export type WatchRangeKey = "addedPrice" | "price" | "todayPct" | "sinceAdded" | "riseDays" | "turnover" | "volumeRatio"

export type WatchRange = { min: string; max: string }

export type WatchQuery = {
  keyword: string
  market: string
  industry: string
  ranges: Partial<Record<WatchRangeKey, WatchRange>>
}

export const EMPTY_WATCH_QUERY: WatchQuery = {
  keyword: "",
  market: "",
  industry: "",
  ranges: {},
}

const RANGE_SORT: Record<WatchRangeKey, WatchSortKey> = {
  addedPrice: "addedPrice",
  price: "price",
  todayPct: "todayPct",
  sinceAdded: "change",
  riseDays: "riseDays",
  turnover: "turnover",
  volumeRatio: "volumeRatio",
}

export function columnById(id: WatchColumnId): WatchColumn {
  const column = WATCH_COLUMNS.find((item) => item.id === id)
  if (!column) throw new Error(`未知列 ${id}`)
  return column
}

export function defaultWatchPrefs(view: WatchViewMode = "list"): WatchPrefs {
  return {
    version: WATCH_PREFS_VERSION,
    view,
    order: [...DEFAULT_WATCH_ORDER],
    hidden: [...DEFAULT_WATCH_HIDDEN],
  }
}

export function visibleColumns(prefs: WatchPrefs): WatchColumnId[] {
  const hidden = new Set(prefs.hidden)
  return prefs.order.filter((id) => !hidden.has(id))
}

export function exportHeader(id: WatchColumnId): string {
  const column = columnById(id)
  return column.unit ? `${column.label}(${column.unit})` : column.label
}

export function loadWatchPrefs(raw: string | null, fallbackView: WatchViewMode = "list"): { prefs: WatchPrefs; repaired: boolean } {
  const fallback = defaultWatchPrefs(fallbackView)
  if (raw == null || !raw.trim()) return { prefs: fallback, repaired: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { prefs: fallback, repaired: true }
  }
  if (!parsed || typeof parsed !== "object") return { prefs: fallback, repaired: true }
  const record = parsed as Record<string, unknown>
  if (record.version !== WATCH_PREFS_VERSION) return { prefs: fallback, repaired: true }
  const view: WatchViewMode = record.view === "cards" || record.view === "list" ? record.view : fallback.view
  const order = sanitizeOrder(record.order)
  const hidden = sanitizeHidden(record.hidden, order)
  const repaired = view !== record.view || !sameIds(order, record.order) || !sameIds(hidden, record.hidden)
  return { prefs: { version: WATCH_PREFS_VERSION, view, order, hidden }, repaired }
}

export function serializeWatchPrefs(prefs: WatchPrefs): string {
  const normalized = loadWatchPrefs(JSON.stringify({ ...prefs, version: WATCH_PREFS_VERSION })).prefs
  return JSON.stringify(normalized)
}

function sanitizeOrder(value: unknown): WatchColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_WATCH_ORDER]
  const seen = new Set<WatchColumnId>()
  const order: WatchColumnId[] = []
  for (const item of value) {
    if (typeof item !== "string" || !COLUMN_IDS.has(item) || seen.has(item as WatchColumnId)) continue
    const id = item as WatchColumnId
    seen.add(id)
    order.push(id)
  }
  for (const id of DEFAULT_WATCH_ORDER) {
    if (!seen.has(id)) order.push(id)
  }
  return order
}

function sanitizeHidden(value: unknown, order: WatchColumnId[]): WatchColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_WATCH_HIDDEN]
  const allowed = new Set(order)
  const hidden: WatchColumnId[] = []
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item as WatchColumnId)) continue
    const id = item as WatchColumnId
    if (columnById(id).required || hidden.includes(id)) continue
    hidden.push(id)
  }
  return hidden
}

function sameIds(next: WatchColumnId[], value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== next.length) return false
  return next.every((id, index) => value[index] === id)
}

export function moveColumn(order: WatchColumnId[], id: WatchColumnId, dir: -1 | 1): WatchColumnId[] {
  const index = order.indexOf(id)
  const target = index + dir
  if (index < 0 || target < 0 || target >= order.length) return order
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export function toggleColumn(hidden: WatchColumnId[], id: WatchColumnId): WatchColumnId[] {
  if (columnById(id).required) return hidden.filter((item) => item !== id)
  return hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id]
}

export type WatchCell =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "number"; value: number; digits: number }
  | { kind: "date"; iso: string }

export function watchCell(id: WatchColumnId, entry: WatchEntry, quote?: WatchQuote | null): WatchCell {
  const column = columnById(id)
  if (column.kind === "date") {
    return entry.addedDate ? { kind: "date", iso: entry.addedDate } : { kind: "empty" }
  }
  if (column.kind === "text") {
    const text = textValue(id, entry, quote)
    return text ? { kind: "text", text } : { kind: "empty" }
  }
  const value = numericValue(id, entry, quote)
  if (value == null) return { kind: "empty" }
  const digits = column.kind === "int" ? 0 : column.kind === "number" ? 2 : 2
  return { kind: "number", value, digits }
}

function textValue(id: WatchColumnId, entry: WatchEntry, quote?: WatchQuote | null): string {
  if (id === "code") return entry.code
  if (id === "name") return entry.name
  if (id === "market") return watchMarketLabel(entry.code)
  if (id === "industry") return displayedIndustry(entry, quote)
  if (id === "source") return sourceLabel(entry.source)
  if (id === "reason") return entry.reason
  if (id === "quoteAt") return quote?.quoteAt.trim() || ""
  return ""
}

function numericValue(id: WatchColumnId, entry: WatchEntry, quote?: WatchQuote | null): number | null {
  if (id === "sinceAdded") return watchMetric(entry, quote ?? undefined, "change")
  if (id === "addedPrice" || id === "price" || id === "todayPct" || id === "riseDays" || id === "limitDays" || id === "turnover" || id === "volumeRatio" || id === "amount") {
    return watchMetric(entry, quote ?? undefined, id)
  }
  return null
}

export function formatWatchCell(cell: WatchCell): string {
  if (cell.kind === "empty") return "--"
  if (cell.kind === "text" || cell.kind === "date") return cell.kind === "date" ? cell.iso : cell.text
  if (cell.digits === 0) return String(Math.trunc(cell.value))
  return cell.value.toFixed(cell.digits)
}

export function formatWatchCellLabel(id: WatchColumnId, cell: WatchCell): string {
  const text = formatWatchCell(cell)
  if (cell.kind !== "number" || text === "--") return text
  const unit = columnById(id).unit
  if (!unit || unit === "元") return text
  return `${text}${unit === "%" ? "%" : unit}`
}

export type BoundResult = { ok: true; value: number | null } | { ok: false }

export function parseBound(raw: string): BoundResult {
  const text = raw.trim()
  if (!text) return { ok: true, value: null }
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return { ok: false }
  const value = Number(text)
  return Number.isFinite(value) ? { ok: true, value } : { ok: false }
}

export type FilteredWatch = {
  items: WatchEntry[]
  errors: string[]
}

export function applyWatchQuery(
  items: WatchEntry[],
  quotes: Record<string, WatchQuote | undefined>,
  query: WatchQuery,
): FilteredWatch {
  const errors: string[] = []
  const keyword = query.keyword.trim().toLowerCase()
  let rows = items.filter((item) => {
    if (!keyword) return true
    const quote = quotes[item.code]
    return item.code.toLowerCase().includes(keyword) ||
      item.name.toLowerCase().includes(keyword) ||
      displayedIndustry(item, quote).toLowerCase().includes(keyword) ||
      item.reason.toLowerCase().includes(keyword) ||
      watchMarketLabel(item.code).toLowerCase().includes(keyword)
  })
  if (query.market) {
    rows = rows.filter((item) => watchMarketLabel(item.code) === query.market)
  }
  if (query.industry) {
    rows = rows.filter((item) => displayedIndustry(item, quotes[item.code]) === query.industry)
  }
  for (const column of WATCH_COLUMNS) {
    if (!column.range) continue
    const key = column.id as WatchRangeKey
    const range = query.ranges[key]
    if (!range) continue
    const min = parseBound(range.min)
    const max = parseBound(range.max)
    if (!min.ok || !max.ok) {
      errors.push(`${column.label}区间不是有效数字`)
      continue
    }
    if (min.value == null && max.value == null) continue
    if (min.value != null && max.value != null && min.value > max.value) {
      errors.push(`${column.label}下限大于上限`)
      continue
    }
    const sortKey = RANGE_SORT[key]
    rows = rows.filter((item) => {
      const value = watchMetric(item, quotes[item.code], sortKey)
      if (value == null) return false
      if (min.value != null && value < min.value) return false
      if (max.value != null && value > max.value) return false
      return true
    })
  }
  return { items: rows, errors }
}

export function watchMarketOptions(items: WatchEntry[]): string[] {
  return unique(items.map((item) => watchMarketLabel(item.code)).filter(Boolean))
}

export function watchIndustryOptions(
  items: WatchEntry[],
  quotes: Record<string, WatchQuote | undefined>,
): string[] {
  return unique(items.map((item) => displayedIndustry(item, quotes[item.code])).filter(Boolean))
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "zh"))
}

export function watchExportFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `gp-ladder_watch_${stamp}.xlsx`
}
