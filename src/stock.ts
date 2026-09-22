import type { FilterState, HighlightRule, SortKey, StockRow } from "./types"

export function normalizeNumber(value: unknown): number {
  if (value == null || value === "") return 0
  const num = Number(String(value).replace("%", "").replace(/,/g, "").trim())
  return Number.isNaN(num) ? 0 : num
}

export function toNullableNumber(value: unknown): number | null {
  const text = String(value ?? "").trim()
  if (!text) return null
  const num = Number(text)
  return Number.isNaN(num) ? null : num
}

export function getPctRange(rangeValue: string) {
  const mapping: Record<string, { min: number | null; max: number | null }> = {
    "0-5": { min: 0, max: 5 },
    "5-10": { min: 5, max: 10 },
    "10-15": { min: 10, max: 15 },
    "15+": { min: 15, max: null },
  }
  return mapping[rangeValue] || { min: null, max: null }
}

export function getTurnoverRange(rangeValue: string) {
  const mapping: Record<string, { min: number | null; max: number | null }> = {
    "0-5": { min: 0, max: 5 },
    "5-10": { min: 5, max: 10 },
    "10-20": { min: 10, max: 20 },
    "20+": { min: 20, max: null },
  }
  return mapping[rangeValue] || { min: null, max: null }
}

export function getRetailPresetRange(rangeValue: string) {
  const mapping: Record<
    string,
    { min: number | null; max: number | null; minExclusive?: boolean; maxExclusive?: boolean }
  > = {
    out: { min: null, max: 0, maxExclusive: true },
    in: { min: 0, max: null, minExclusive: true },
    "-5-0": { min: -5, max: 0 },
    "0-5": { min: 0, max: 5 },
    "5-10": { min: 5, max: 10 },
    "10+": { min: 10, max: null },
  }
  return mapping[rangeValue] || { min: null, max: null }
}

export function getPriceRange(rangeValue: string) {
  const mapping: Record<string, { min: number | null; max: number | null }> = {
    "0-10": { min: 0, max: 10 },
    "10-20": { min: 10, max: 20 },
    "20-50": { min: 20, max: 50 },
    "50-100": { min: 50, max: 100 },
    "100+": { min: 100, max: null },
  }
  return mapping[rangeValue] || { min: null, max: null }
}

export function getAvgTurnover(item: StockRow): number {
  const days = Math.max(1, Number(item["连涨天数"]) || 0)
  return normalizeNumber(item["累计换手率"]) / days
}

export function getAvgPct(item: StockRow): number {
  const annotated = toNullableNumber(String(item["平均涨幅/天"] ?? "").replace("%", ""))
  if (annotated != null) return annotated
  const days = Math.max(1, Number(item["连涨天数"]) || 0)
  return normalizeNumber(item["连续涨跌幅"]) / days
}

export function getRetailIndex(item: StockRow): number | null {
  const text = String(item["散户指数"] ?? "").trim()
  if (!text) return null
  return normalizeNumber(text)
}

export function getTodayPct(item: StockRow): number | null {
  const text = String(item["今日涨跌幅"] ?? "").trim()
  if (!text) return null
  return normalizeNumber(text)
}

export function getBodyPct(item: StockRow): number | null {
  const text = String(item["实体涨幅"] ?? "").trim()
  if (!text) return null
  return normalizeNumber(text)
}

export function getTodayTurnover(item: StockRow): number | null {
  const text = String(item["今日换手率"] ?? "").trim()
  if (!text) return null
  return normalizeNumber(text)
}

export function getPrice(item: StockRow): number | null {
  const live = String(item["现价"] ?? "").trim()
  if (live) return normalizeNumber(live)
  const close = String(item["收盘价(元)"] ?? "").trim()
  if (close) return normalizeNumber(close)
  return null
}

export const NEAR_DAY_HIGH_RATIO = 0.005

export function getHighPrice(item: StockRow): number | null {
  const live = String(item["今高"] ?? "").trim()
  if (live) return normalizeNumber(live)
  const crawl = String(item["最高价(元)"] ?? "").trim()
  if (crawl) return normalizeNumber(crawl)
  return null
}

/** 现价视为当日最高：与今高相差不超过 0.5%。缺行情时不算。 */
export function isNearDayHigh(item: StockRow, ratio = NEAR_DAY_HIGH_RATIO): boolean {
  const price = getPrice(item)
  const high = getHighPrice(item)
  if (price === null || high === null || high <= 0) return false
  return Math.abs(high - price) / high <= ratio + 1e-12
}

export function shouldHighlight(item: StockRow, rule: HighlightRule): boolean {
  const retail = getRetailIndex(item)
  const todayTurnover = getTodayTurnover(item)
  const avgPct = getAvgPct(item)
  if (retail === null || retail >= rule.retailMax) return false
  if (todayTurnover === null || todayTurnover >= rule.todayTurnoverMax) return false
  if (avgPct <= rule.avgPctMin) return false
  return true
}

export function isStStock(name: string | undefined): boolean {
  return !!(name && name.toUpperCase().includes("ST"))
}

export function pctClass(value: number | null | undefined): "up" | "down" | "flat" {
  const v = value ?? 0
  return v > 0 ? "up" : v < 0 ? "down" : "flat"
}

export function buildDetailUrl(code: string | undefined): string {
  if (!code) return "#"
  const trimmed = code.trim()
  return `https://quote.eastmoney.com/${trimmed.startsWith("6") ? "sh" : "sz"}${trimmed}.html`
}

export function groupByDays(list: StockRow[]): { day: number; items: StockRow[] }[] {
  const grouped = new Map<number, StockRow[]>()
  for (const item of list) {
    const day = Number(item["连涨天数"]) || 0
    const bucket = grouped.get(day) ?? []
    bucket.push(item)
    grouped.set(day, bucket)
  }
  return [...grouped.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, items]) => ({ day, items }))
}

export function uniqueDays(rows: StockRow[]): number[] {
  return [...new Set(rows.map((item) => Number(item["连涨天数"]) || 0))].sort((a, b) => b - a)
}

export function countByDay(rows: StockRow[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const item of rows) {
    const day = Number(item["连涨天数"]) || 0
    counts[day] = (counts[day] ?? 0) + 1
  }
  return counts
}

export function daysFromCounts(counts: Record<number, number>, keep?: number | null): number[] {
  const days = new Set(Object.keys(counts).map(Number))
  if (keep != null) days.add(keep)
  return [...days].sort((a, b) => b - a)
}

export function topIndustries(
  rows: StockRow[],
  limit = 12,
  keep?: string | null,
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of rows) {
    const name = item["所属行业"] || "未知"
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
  if (keep && keep !== "all" && !ranked.some((item) => item.name === keep)) {
    ranked.push({ name: keep, count: counts.get(keep) ?? 0 })
  }
  return ranked
}

/** 统计芯片数量时去掉自身条件，避免点开后变成 0。 */
export function filtersWithoutFacet(
  filters: FilterState,
  facet: "exactDay" | "industry",
): FilterState {
  if (facet === "exactDay") return { ...filters, exactDay: null }
  return { ...filters, industry: "all" }
}

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    !filters.excludeSt ||
    !filters.onlyHighlight ||
    filters.todayPctMin !== null ||
    filters.retailRange !== "all" ||
    filters.industry !== "all" ||
    filters.keyword.trim() !== "" ||
    filters.exactDay !== null ||
    filters.minDays > 0 ||
    filters.pctRange !== "all" ||
    filters.turnoverRange !== "all" ||
    filters.priceRange !== "all" ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.pctTotalMin !== null ||
    filters.pctTotalMax !== null ||
    filters.turnTotalMin !== null ||
    filters.turnTotalMax !== null ||
    filters.retailMin !== null ||
    filters.retailMax !== null ||
    filters.nearDayHigh
  )
}

const sorters: Record<SortKey, (a: StockRow, b: StockRow) => number> = {
  days: (a, b) => (Number(b["连涨天数"]) || 0) - (Number(a["连涨天数"]) || 0),
  pct: (a, b) => normalizeNumber(b["连续涨跌幅"]) - normalizeNumber(a["连续涨跌幅"]),
  todayPct: (a, b) =>
    (getTodayPct(b) ?? Number.NEGATIVE_INFINITY) - (getTodayPct(a) ?? Number.NEGATIVE_INFINITY),
  avgPct: (a, b) => getAvgPct(b) - getAvgPct(a),
  avgTurnover: (a, b) => getAvgTurnover(b) - getAvgTurnover(a),
  retail: (a, b) =>
    (getRetailIndex(b) ?? Number.NEGATIVE_INFINITY) - (getRetailIndex(a) ?? Number.NEGATIVE_INFINITY),
  price: (a, b) => (getPrice(b) ?? Number.NEGATIVE_INFINITY) - (getPrice(a) ?? Number.NEGATIVE_INFINITY),
  close: (a, b) => normalizeNumber(b["收盘价(元)"]) - normalizeNumber(a["收盘价(元)"]),
}

export function filterAndSort(
  data: StockRow[],
  filters: FilterState,
  rule: HighlightRule,
): StockRow[] {
  const keyword = filters.keyword.trim().toUpperCase()
  const { min: pctMin, max: pctMax } = getPctRange(filters.pctRange)
  const { min: turnoverMin, max: turnoverMax } = getTurnoverRange(filters.turnoverRange)
  const { min: presetPriceMin, max: presetPriceMax } = getPriceRange(filters.priceRange)
  const filtered = data.filter((item) => {
    const day = Number(item["连涨天数"]) || 0
    const pct = normalizeNumber(item["连续涨跌幅"])
    const turnover = normalizeNumber(item["累计换手率"])
    const avgPct = getAvgPct(item)
    const avgTurnover = getAvgTurnover(item)
    if (filters.exactDay !== null && day !== filters.exactDay) return false
    if (day < filters.minDays) return false
    if (filters.industry !== "all" && item["所属行业"] !== filters.industry) return false
    if (filters.pctTotalMin !== null && pct < filters.pctTotalMin) return false
    if (filters.pctTotalMax !== null && pct > filters.pctTotalMax) return false
    const todayPct = getTodayPct(item)
    if (filters.todayPctMin !== null || filters.todayPctMax !== null) {
      if (todayPct === null) return false
      if (filters.todayPctMin !== null && todayPct < filters.todayPctMin) return false
      if (filters.todayPctMax !== null && todayPct > filters.todayPctMax) return false
    }
    const price = getPrice(item)
    if (filters.nearDayHigh && !isNearDayHigh(item)) return false
    if (filters.priceRange && filters.priceRange !== "all") {
      if (price === null) return false
      if (presetPriceMin !== null && price < presetPriceMin) return false
      if (presetPriceMax !== null && price >= presetPriceMax) return false
    }
    if (filters.priceMin !== null || filters.priceMax !== null) {
      if (price === null) return false
      if (filters.priceMin !== null && price < filters.priceMin) return false
      if (filters.priceMax !== null && price > filters.priceMax) return false
    }
    if (filters.turnTotalMin !== null && turnover < filters.turnTotalMin) return false
    if (filters.turnTotalMax !== null && turnover > filters.turnTotalMax) return false
    const retail = getRetailIndex(item)
    if (filters.retailRange && filters.retailRange !== "all") {
      const preset = getRetailPresetRange(filters.retailRange)
      if (retail === null) return false
      if (preset.min !== null && (preset.minExclusive ? retail <= preset.min : retail < preset.min)) {
        return false
      }
      if (preset.max !== null && (preset.maxExclusive ? retail >= preset.max : retail > preset.max)) {
        return false
      }
    }
    if (filters.retailMin !== null || filters.retailMax !== null) {
      if (retail === null) return false
      if (filters.retailMin !== null && retail < filters.retailMin) return false
      if (filters.retailMax !== null && retail > filters.retailMax) return false
    }
    if (filters.pctRange !== "all") {
      if (pctMin !== null && avgPct < pctMin) return false
      if (pctMax !== null && avgPct >= pctMax) return false
    }
    if (filters.turnoverRange !== "all") {
      if (turnoverMin !== null && avgTurnover < turnoverMin) return false
      if (turnoverMax !== null && avgTurnover >= turnoverMax) return false
    }
    if (filters.excludeSt && isStStock(item["股票简称"])) return false
    if (filters.onlyHighlight && !shouldHighlight(item, rule)) return false
    if (keyword) {
      const name = String(item["股票简称"] || "").toUpperCase()
      const code = String(item["股票代码"] || "").toUpperCase()
      return name.includes(keyword) || code.includes(keyword)
    }
    return true
  })
  return filtered.sort(sorters[filters.sort])
}
