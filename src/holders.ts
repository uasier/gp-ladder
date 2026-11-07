import { getHolderCount } from "./api"
import { normalizeStockCode } from "./stock"

export type HolderCount = {
  status: "ok" | "empty"
  code: string
  name: string
  holders: number | null
  endDate: string | null
  noticeDate: string | null
  message: string
}

export type HolderPresentation =
  | { kind: "loading"; title: "股东人数"; value: string; note: string }
  | { kind: "ok"; title: "股东人数"; value: string; endDate: string; noticeDate: string; note: string }
  | { kind: "empty"; title: "股东人数"; value: string; note: string }
  | { kind: "error"; title: "股东人数"; value: string; note: string }

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

type CacheEntry = { at: number; value: HolderCount }

export function formatHolderHouseholds(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100_000_000) return null
  return `${new Intl.NumberFormat("zh-CN").format(value)} 户`
}

export function presentHolder(
  phase: { kind: "loading" } | { kind: "error"; message: string } | HolderCount,
): HolderPresentation {
  if ("kind" in phase && phase.kind === "loading") {
    return { kind: "loading", title: "股东人数", value: "正在读取最近披露…", note: "披露数据，不是实时股东人数" }
  }
  if ("kind" in phase && phase.kind === "error") {
    return {
      kind: "error",
      title: "股东人数",
      value: "暂不可用",
      note: phase.message.trim() || "股东人数数据源暂时无法访问",
    }
  }
  const count = phase as HolderCount
  const households = formatHolderHouseholds(count.holders)
  if (count.status !== "ok" || !households || !count.endDate) {
    return {
      kind: "empty",
      title: "股东人数",
      value: "暂无披露",
      note: count.message.trim() || "暂无披露的股东人数",
    }
  }
  return {
    kind: "ok",
    title: "股东人数",
    value: households,
    endDate: count.endDate,
    noticeDate: count.noticeDate || "未提供",
    note: "最近一次披露，不是实时股东人数。来源：东方财富股东户数",
  }
}

export function createHolderCache(
  fetcher: (code: string) => Promise<HolderCount>,
  ttlMs = CACHE_TTL_MS,
) {
  const cache = new Map<string, CacheEntry>()
  const inflight = new Map<string, Promise<HolderCount>>()

  return {
    load(code: string, now = Date.now()): Promise<HolderCount> {
      const normalized = normalizeStockCode(code)
      if (!normalized) return Promise.reject(new Error("暂不支持该股票代码"))
      const cached = cache.get(normalized)
      if (cached && now - cached.at < ttlMs) return Promise.resolve(cached.value)
      const pending = inflight.get(normalized)
      if (pending) return pending
      const request = fetcher(normalized)
        .then((value) => {
          cache.set(normalized, { at: now, value })
          return value
        })
        .finally(() => {
          inflight.delete(normalized)
        })
      inflight.set(normalized, request)
      return request
    },
    clear(code?: string) {
      if (!code) {
        cache.clear()
        return
      }
      cache.delete(normalizeStockCode(code))
    },
  }
}

async function fetchHolderCount(code: string): Promise<HolderCount> {
  return getHolderCount(code)
}

const holderCache = createHolderCache(fetchHolderCount)

export function loadHolderCount(code: string): Promise<HolderCount> {
  return holderCache.load(code)
}

export function clearHolderCount(code?: string) {
  holderCache.clear(code)
}
