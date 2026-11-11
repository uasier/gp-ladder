import type { BoardKind, StockRow } from "./types"
import { getPrice, normalizeStockCode, tonghuashunMarketId } from "./stock"

export type WatchSource = BoardKind | "manual"

export type WatchEntry = {
  code: string
  name: string
  industry: string
  addedDate: string
  addedPrice: number
  reason: string
  source: string
  createdAt: string
  updatedAt: string
}

export type WatchlistView = {
  items: WatchEntry[]
  count: number
}

export type WatchQuote = {
  code: string
  name: string
  price: number | null
  changePct: number | null
  quoteAt: string
  industry?: string
  open?: number | null
  high?: number | null
  low?: number | null
  prevClose?: number | null
  turnover?: number | null
  volumeRatio?: number | null
  amount?: number | null
  pe?: number | null
  retailPct?: number | null
  retailAmount?: number | null
  riseDays?: number | null
  risePct?: number | null
  riseTurnover?: number | null
  limitDays?: number | null
  limitPct?: number | null
  limitTurnover?: number | null
  limitStat?: string
}

export type WatchInput = {
  code: string
  name: string
  industry: string
  addedDate: string
  addedPrice: number
  reason: string
  source: WatchSource
}

export type WatchDraft = {
  code: string
  name: string
  industry: string
  addedDate: string
  addedPrice: string
  reason: string
  source: WatchSource
}

export type WatchSortKey =
  | "addedDate"
  | "addedPrice"
  | "name"
  | "code"
  | "change"
  | "todayPct"
  | "reason"

export type WatchSortDir = "asc" | "desc"

export const WATCH_REASON_PRESETS = [
  "连板观察",
  "趋势跟随",
  "低位转强",
  "事件催化",
  "回封确认",
  "板块龙头",
] as const

export const WATCH_PRICE_MIN = 0.01
export const WATCH_PRICE_MAX = 100000
export const WATCH_REASON_MAX = 200
export const WATCH_NAME_MAX = 32
export const WATCH_DATE_MIN = "1990-01-01"

const SOURCE_LABEL: Record<string, string> = {
  lxsz: "连涨天梯",
  zt: "涨停连板",
  jjzt: "昨日涨停",
  manual: "手动添加",
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function isWatchCode(code: string): boolean {
  return /^\d{6}$/.test(code) && tonghuashunMarketId(code) != null
}

export function parsePriceInput(value: string): number | null {
  const text = value.trim()
  if (!/^\d+(\.\d{1,4})?$/.test(text)) return null
  const price = Number(text)
  if (!Number.isFinite(price) || price < WATCH_PRICE_MIN || price > WATCH_PRICE_MAX) return null
  return Math.round(price * 10000) / 10000
}

export function formatWatchPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--"
  return value.toFixed(2)
}

export function formatSignedPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] || "其他"
}

export function blankDraft(today = localDateString()): WatchDraft {
  return {
    code: "",
    name: "",
    industry: "",
    addedDate: today,
    addedPrice: "",
    reason: "",
    source: "manual",
  }
}

export function draftFromStock(item: StockRow, source: BoardKind, today = localDateString()): WatchDraft {
  const price = getPrice(item)
  return {
    code: normalizeStockCode(item["股票代码"]),
    name: String(item["股票简称"] || "").trim(),
    industry: String(item["所属行业"] || "").trim(),
    addedDate: today,
    addedPrice: price != null && price >= WATCH_PRICE_MIN ? price.toFixed(2) : "",
    reason: "",
    source,
  }
}

export function entryToDraft(entry: WatchEntry): WatchDraft {
  const source = entry.source === "lxsz" || entry.source === "zt" || entry.source === "jjzt"
    ? entry.source
    : "manual"
  return {
    code: entry.code,
    name: entry.name,
    industry: entry.industry,
    addedDate: entry.addedDate,
    addedPrice: formatWatchPrice(entry.addedPrice),
    reason: entry.reason,
    source,
  }
}

export function applyReasonPreset(reason: string, preset: string): string {
  const text = reason.trim()
  if (!text) return preset
  const parts = text.split(/[、,，]/).map((part) => part.trim())
  if (parts.includes(preset)) return reason
  const next = `${text}、${preset}`
  return [...next].length <= WATCH_REASON_MAX ? next : reason
}

export function validateWatchDraft(draft: WatchDraft, today = localDateString()): string | null {
  const code = draft.code.trim()
  if (!/^\d{6}$/.test(code)) return "股票代码需为 6 位数字"
  if (!isWatchCode(code)) return "暂不支持该股票代码"
  const name = draft.name.trim()
  if (!name) return "请填写股票简称"
  if ([...name].length > WATCH_NAME_MAX) return `股票简称不能超过 ${WATCH_NAME_MAX} 字`
  if (/[\u0000-\u001f\u007f]/.test(name)) return "股票简称包含无效字符"
  if (!isValidDate(draft.addedDate)) return "自选日期无效"
  if (draft.addedDate < WATCH_DATE_MIN) return "自选日期过早"
  if (draft.addedDate > today) return "自选日期不能晚于今天"
  if (!draft.addedPrice.trim()) return "请填写自选价格"
  if (parsePriceInput(draft.addedPrice) == null) return "自选价格需为 0.01 到 100000 之间的数字"
  const reason = draft.reason.trim()
  if (!reason) return "请填写自选原因"
  if ([...reason].length > WATCH_REASON_MAX) return `自选原因不能超过 ${WATCH_REASON_MAX} 字`
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason)) return "自选原因包含无效字符"
  return null
}

export function draftToInput(draft: WatchDraft): WatchInput {
  const price = parsePriceInput(draft.addedPrice)
  if (price == null) throw new Error("自选价格无效")
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    industry: draft.industry.trim(),
    addedDate: draft.addedDate,
    addedPrice: price,
    reason: draft.reason.trim(),
    source: draft.source,
  }
}

export function changeSinceAdded(addedPrice: number | null | undefined, current: number | null | undefined): number | null {
  if (addedPrice == null || current == null) return null
  if (!Number.isFinite(addedPrice) || !Number.isFinite(current) || addedPrice <= 0) return null
  return ((current - addedPrice) / addedPrice) * 100
}

export function filterWatchEntries(items: WatchEntry[], keyword: string): WatchEntry[] {
  const query = keyword.trim().toLowerCase()
  if (!query) return items
  return items.filter((item) =>
    item.code.toLowerCase().includes(query) ||
    item.name.toLowerCase().includes(query) ||
    item.industry.toLowerCase().includes(query) ||
    item.reason.toLowerCase().includes(query),
  )
}

export function sortWatchEntries(
  items: WatchEntry[],
  quotes: Record<string, WatchQuote | undefined>,
  key: WatchSortKey,
  dir: WatchSortDir,
): WatchEntry[] {
  const factor = dir === "asc" ? 1 : -1
  return [...items].sort((left, right) => {
    const compared = compareWatch(left, right, quotes, key)
    if (compared.nulls !== 0) return compared.nulls
    if (compared.value !== 0) return compared.value * factor
    const created = right.createdAt.localeCompare(left.createdAt)
    if (created !== 0) return created
    return left.code.localeCompare(right.code)
  })
}

function compareWatch(
  left: WatchEntry,
  right: WatchEntry,
  quotes: Record<string, WatchQuote | undefined>,
  key: WatchSortKey,
): { value: number; nulls: number } {
  if (key === "change" || key === "todayPct") {
    const a = key === "change"
      ? changeSinceAdded(left.addedPrice, quotes[left.code]?.price)
      : quotes[left.code]?.changePct ?? null
    const b = key === "todayPct"
      ? quotes[right.code]?.changePct ?? null
      : changeSinceAdded(right.addedPrice, quotes[right.code]?.price)
    if (a == null && b == null) return { value: 0, nulls: 0 }
    if (a == null) return { value: 0, nulls: 1 }
    if (b == null) return { value: 0, nulls: -1 }
    return { value: a - b, nulls: 0 }
  }
  if (key === "addedPrice") return { value: left.addedPrice - right.addedPrice, nulls: 0 }
  if (key === "name") return { value: left.name.localeCompare(right.name, "zh"), nulls: 0 }
  if (key === "code") return { value: left.code.localeCompare(right.code), nulls: 0 }
  if (key === "reason") return { value: left.reason.localeCompare(right.reason, "zh"), nulls: 0 }
  const date = left.addedDate.localeCompare(right.addedDate)
  return { value: date || left.createdAt.localeCompare(right.createdAt), nulls: 0 }
}

export function newestQuoteAt(quotes: Iterable<WatchQuote>): string | null {
  let best: string | null = null
  for (const quote of quotes) {
    const value = quote.quoteAt.trim()
    if (!value) continue
    if (best == null || value > best) best = value
  }
  return best
}

export function formatAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  return `${(value / 1e4).toFixed(2)}万`
}

function metricText(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return ""
  return value.toFixed(digits)
}

function percentText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  return `${value.toFixed(2)}%`
}

function bodyPct(quote?: WatchQuote | null): number | null {
  if (quote?.price == null || quote.open == null) return null
  const denom = quote.prevClose && quote.prevClose !== 0 ? quote.prevClose : quote.open
  if (!denom) return null
  return ((quote.price - quote.open) / denom) * 100
}

function openPct(quote?: WatchQuote | null): number | null {
  if (quote?.open == null || quote.prevClose == null || quote.prevClose === 0) return null
  return ((quote.open - quote.prevClose) / quote.prevClose) * 100
}

export function watchEntryToRow(entry: WatchEntry, quote?: WatchQuote | null): StockRow {
  const price = quote?.price ?? entry.addedPrice
  const limitDays = quote?.limitDays ?? 0
  const useLimit = limitDays > 0
  return {
    股票代码: entry.code,
    股票简称: quote?.name || entry.name,
    所属行业: quote?.industry || entry.industry,
    现价: Number.isFinite(price) ? price.toFixed(2) : "",
    今日涨跌幅: percentText(quote?.changePct),
    行情时间: quote?.quoteAt || "",
    今开: metricText(quote?.open),
    今高: metricText(quote?.high),
    今低: metricText(quote?.low),
    今日换手率: percentText(quote?.turnover),
    量比: metricText(quote?.volumeRatio),
    成交额: formatAmount(quote?.amount),
    市盈率: metricText(quote?.pe),
    散户指数: percentText(quote?.retailPct),
    散户净额: formatAmount(quote?.retailAmount),
    实体涨幅: percentText(bodyPct(quote)),
    今开涨幅: percentText(openPct(quote)),
    连涨天数: quote?.riseDays == null ? "" : String(quote.riseDays),
    连板天数: useLimit ? String(limitDays) : "",
    连续涨跌幅: percentText(useLimit ? quote?.limitPct : quote?.risePct),
    累计换手率: percentText(useLimit ? quote?.limitTurnover : quote?.riseTurnover),
    涨停统计: quote?.limitStat || "",
  }
}

export function watchSortValue(key: WatchSortKey, dir: WatchSortDir): string {
  return `${key}:${dir}`
}

export function parseWatchSort(value: string): { key: WatchSortKey; dir: WatchSortDir } {
  const [key, dir] = value.split(":")
  const sortKey: WatchSortKey =
    key === "addedPrice" || key === "name" || key === "code" || key === "change" || key === "todayPct" || key === "reason"
      ? key
      : "addedDate"
  return { key: sortKey, dir: dir === "asc" ? "asc" : "desc" }
}
