import { getStockCharacter } from "./api"
import { normalizeStockCode } from "./stock"

export type StockCharacter = {
  status: "ok" | "incomplete"
  code: string
  name: string
  asOf: string | null
  windowDays: number
  minDays: number
  sampleDays: number
  droppedToday: boolean
  suspendedDays: number
  longGaps: number
  total: number | null
  limitWeight: number
  streakWeight: number
  volatilityWeight: number
  activityWeight: number
  limitScore: number | null
  limitUpDays: number
  limitJudgedDays: number
  limitUnknownDays: number
  streakScore: number | null
  maxUpStreak: number
  upDays: number
  upPairs: number
  volatilityScore: number | null
  dailyStdevPct: number | null
  avgAmplitudePct: number | null
  activityScore: number | null
  avgTurnoverPct: number | null
  turnoverDays: number
  source: string
  message: string
  ruleNote: string
}

export type CharacterRow = { label: string; value: string }

export type CharacterPresentation =
  | { kind: "loading"; title: "股性指标"; note: string }
  | { kind: "error"; title: "股性指标"; note: string }
  | {
      kind: "ready"
      title: "股性指标"
      total: string
      rows: CharacterRow[]
      message: string
      ruleNote: string
      source: string
    }

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

type CacheEntry = { at: number; value: StockCharacter }

export function formatCharacterScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) return "不算"
  return String(value)
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `${value.toFixed(2)}%`
}

export function presentStockCharacter(
  phase: { kind: "loading" } | { kind: "error"; message: string } | StockCharacter,
): CharacterPresentation {
  if ("kind" in phase && phase.kind === "loading") {
    return { kind: "loading", title: "股性指标", note: "正在读取这只股票的日 K，不使用全市场快照。" }
  }
  if ("kind" in phase && phase.kind === "error") {
    return {
      kind: "error",
      title: "股性指标",
      note: phase.message.trim() || "日 K 数据源暂时无法访问",
    }
  }
  const view = phase as StockCharacter
  const total = formatCharacterScore(view.total)
  const rows: CharacterRow[] = [
    { label: "统计窗口", value: `最近 ${view.windowDays || 60} 个交易日` },
    { label: "有效样本", value: `${view.sampleDays} 天，至少 ${view.minDays || 40} 天` },
    { label: "数据截至", value: view.asOf || "没有已收盘样本" },
    {
      label: "涨停",
      value: `${formatCharacterScore(view.limitScore)}（收盘涨停 ${view.limitUpDays} / 可判断 ${view.limitJudgedDays} / 无法判断 ${view.limitUnknownDays}）`,
    },
    {
      label: "连涨",
      value: `${formatCharacterScore(view.streakScore)}（最长 ${view.maxUpStreak} 天，上涨 ${view.upDays}/${view.upPairs || 0}）`,
    },
    {
      label: "波动",
      value: `${formatCharacterScore(view.volatilityScore)}（日收益标准差 ${formatPct(view.dailyStdevPct)}，平均振幅 ${formatPct(view.avgAmplitudePct)}）`,
    },
    {
      label: "成交活跃",
      value: `${formatCharacterScore(view.activityScore)}（平均换手 ${formatPct(view.avgTurnoverPct)}，${view.turnoverDays} 天）`,
    },
  ]
  if (view.droppedToday) rows.push({ label: "未收盘当日", value: "已排除，不计入样本" })
  if (view.suspendedDays > 0) rows.push({ label: "停牌或零成交", value: `${view.suspendedDays} 天，不参与打分` })
  if (view.longGaps > 0) rows.push({ label: "长间隔", value: `${view.longGaps} 处超过 10 个自然日，未补造交易日` })
  return {
    kind: "ready",
    title: "股性指标",
    total: total === "不算" ? "不计算总分" : total,
    rows,
    message: view.message.trim() || "样本或维度不足，所以不计算总分。",
    ruleNote: view.ruleNote,
    source: view.source || "东方财富日K",
  }
}

export function createCharacterCache(fetcher: (code: string) => Promise<StockCharacter>, ttlMs = CACHE_TTL_MS) {
  const cache = new Map<string, CacheEntry>()
  const inflight = new Map<string, Promise<StockCharacter>>()

  return {
    load(code: string, now = Date.now()): Promise<StockCharacter> {
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

async function fetchStockCharacter(code: string): Promise<StockCharacter> {
  return getStockCharacter(code)
}

const characterCache = createCharacterCache(fetchStockCharacter)

export function loadStockCharacter(code: string): Promise<StockCharacter> {
  return characterCache.load(code)
}

export function clearStockCharacter(code?: string) {
  characterCache.clear(code)
}
