import { describe, expect, it } from "vitest"
import { createCharacterCache, formatCharacterScore, presentStockCharacter, type StockCharacter } from "./stockCharacter"

function sample(overrides: Partial<StockCharacter> = {}): StockCharacter {
  return {
    status: "ok",
    code: "600519",
    name: "贵州茅台",
    asOf: "2026-11-16",
    windowDays: 60,
    minDays: 40,
    sampleDays: 58,
    droppedToday: true,
    suspendedDays: 1,
    longGaps: 0,
    total: 46,
    limitWeight: 30,
    streakWeight: 20,
    volatilityWeight: 30,
    activityWeight: 20,
    limitScore: 20,
    limitUpDays: 2,
    limitJudgedDays: 50,
    limitUnknownDays: 3,
    streakScore: 40,
    maxUpStreak: 3,
    upDays: 24,
    upPairs: 57,
    volatilityScore: 60,
    dailyStdevPct: 1.8,
    avgAmplitudePct: 3.2,
    activityScore: 48,
    avgTurnoverPct: 2.4,
    turnoverDays: 58,
    source: "东方财富日K /api/qt/stock/kline/get",
    message: "使用最近 58 个已收盘交易日（上限 60），截至 2026-11-16。",
    ruleNote: "这是本应用的规则评分，不是交易所、券商的官方股性指标，也没有用历史收益做过回测。",
    ...overrides,
  }
}

describe("stock character presentation", () => {
  it("keeps a real zero and does not print a missing score as zero", () => {
    expect(formatCharacterScore(0)).toBe("0")
    expect(formatCharacterScore(null)).toBe("不算")
    expect(formatCharacterScore(undefined)).toBe("不算")
    expect(formatCharacterScore(1.5)).toBe("不算")
    const ready = presentStockCharacter(sample({ total: 0, activityScore: null, status: "incomplete" }))
    expect(ready).toMatchObject({ kind: "ready", total: "0" })
    if (ready.kind === "ready") {
      expect(ready.rows.find((row) => row.label === "成交活跃")?.value.startsWith("不算")).toBe(true)
      expect(ready.rows.find((row) => row.label === "涨停")?.value.startsWith("0") ?? false).toBe(false)
      expect(ready.rows.find((row) => row.label === "涨停")?.value).toContain("收盘涨停 2 / 可判断 50 / 无法判断 3")
    }
  })

  it("withholds the total when the backend did not calculate one", () => {
    const view = presentStockCharacter(
      sample({
        status: "incomplete",
        total: null,
        sampleDays: 12,
        limitScore: null,
        streakScore: null,
        volatilityScore: null,
        activityScore: null,
        asOf: null,
        message: "已收盘交易日少于 40 天，样本不足，不计算总分。",
      }),
    )
    expect(view).toMatchObject({ kind: "ready", total: "不计算总分" })
    if (view.kind !== "ready") return
    expect(view.rows.find((row) => row.label === "有效样本")?.value).toBe("12 天，至少 40 天")
    expect(view.rows.find((row) => row.label === "数据截至")?.value).toBe("没有已收盘样本")
    expect(view.rows.every((row) => !row.value.startsWith("0"))).toBe(true)
    expect(view.message).toContain("少于 40")
    expect(view.ruleNote).toContain("不是交易所")
    expect(view.ruleNote).not.toContain("胜率")
  })

  it("shows the window, as-of date and raw statistics for a complete score", () => {
    const view = presentStockCharacter(sample())
    expect(view).toMatchObject({ kind: "ready", total: "46" })
    if (view.kind !== "ready") return
    expect(view.rows).toEqual(
      expect.arrayContaining([
        { label: "统计窗口", value: "最近 60 个交易日" },
        { label: "数据截至", value: "2026-11-16" },
        { label: "未收盘当日", value: "已排除，不计入样本" },
        { label: "停牌或零成交", value: "1 天，不参与打分" },
      ]),
    )
    expect(view.rows.find((row) => row.label === "波动")?.value).toContain("日收益标准差 1.80%")
    expect(view.rows.find((row) => row.label === "成交活跃")?.value).toContain("平均换手 2.40%")
    expect(view.source).toContain("东方财富日K")
  })

  it("does not turn a source failure into a sample score", () => {
    expect(presentStockCharacter({ kind: "error", message: "日 K 数据源暂时无法访问" })).toEqual({
      kind: "error",
      title: "股性指标",
      note: "日 K 数据源暂时无法访问",
    })
    expect(presentStockCharacter({ kind: "loading" }).kind).toBe("loading")
  })
})

describe("stock character cache", () => {
  it("reuses a result, including an incomplete one, and does not cache a failure", async () => {
    let calls = 0
    const cache = createCharacterCache(async (code) => {
      calls += 1
      if (calls === 1) throw new Error("日 K 数据源暂时无法访问")
      return sample({ code, status: "incomplete", total: null })
    })
    await expect(cache.load("600519")).rejects.toThrow("无法访问")
    const first = await cache.load("600519")
    const second = await cache.load("600519")
    expect(first.total).toBeNull()
    expect(second).toBe(first)
    expect(calls).toBe(2)
  })

  it("deduplicates concurrent requests for the same code", async () => {
    let calls = 0
    const cache = createCharacterCache(async (code) => {
      calls += 1
      await Promise.resolve()
      return sample({ code })
    })
    const [first, second] = await Promise.all([cache.load("688981"), cache.load("688981")])
    expect(first).toBe(second)
    expect(calls).toBe(1)
    cache.clear("688981")
    await cache.load("688981")
    expect(calls).toBe(2)
  })
})
