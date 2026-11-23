import { describe, expect, it } from "vitest"
import type { WatchEntry, WatchQuote } from "./watchlist"
import {
  applyWatchQuery,
  defaultWatchPrefs,
  loadWatchPrefs,
  moveColumn,
  serializeWatchPrefs,
  toggleColumn,
  visibleColumns,
  watchCell,
  type WatchQuery,
} from "./watchView"

function entry(patch: Partial<WatchEntry> = {}): WatchEntry {
  return {
    code: "600519",
    name: "贵州茅台",
    industry: "白酒",
    addedDate: "2026-10-01",
    addedPrice: 1500,
    reason: "趋势跟随",
    source: "lxsz",
    createdAt: "2026-10-01T09:30:00.000+08:00",
    updatedAt: "2026-10-01T09:30:00.000+08:00",
    ...patch,
  }
}

const items = [
  entry({ code: "000001", name: "平安银行", industry: "银行", addedPrice: 10, reason: "低吸" }),
  entry({ code: "300750", name: "宁德时代", industry: "电池", addedPrice: 200, reason: "龙头" }),
  entry(),
]

const quotes: Record<string, WatchQuote> = {
  "000001": { code: "000001", name: "平安银行", price: 0, changePct: 0, quoteAt: "2026-10-20 14:00:00", riseDays: 0, turnover: 0, volumeRatio: 0, industry: "银行" },
  "600519": { code: "600519", name: "贵州茅台", price: 1650, changePct: 1.2, quoteAt: "2026-10-20 14:00:00", riseDays: 3, industry: "白酒" },
}

function query(patch: Partial<WatchQuery> = {}): WatchQuery {
  return { keyword: "", market: "", industry: "", ranges: {}, ...patch }
}

describe("watch filters", () => {
  it("keeps leading zeros and combines market, industry and a numeric range", () => {
    expect(applyWatchQuery(items, quotes, query({ keyword: "000001" })).items.map((item) => item.code)).toEqual(["000001"])
    expect(applyWatchQuery(items, quotes, query({ keyword: "1" })).items.map((item) => item.code)).toContain("000001")
    const matched = applyWatchQuery(items, quotes, query({
      keyword: "平安",
      market: "深市",
      industry: "银行",
      ranges: { price: { min: "0", max: "0" } },
    }))
    expect(matched.errors).toEqual([])
    expect(matched.items.map((item) => item.code)).toEqual(["000001"])
  })

  it("does not treat a missing quote or an invalid range as zero", () => {
    const missing = applyWatchQuery(items, quotes, query({ ranges: { price: { min: "0", max: "10" } } }))
    expect(missing.items.map((item) => item.code)).toEqual(["000001"])
    const invalid = applyWatchQuery(items, quotes, query({ ranges: { price: { min: "高", max: "" }, todayPct: { min: "5", max: "1" } } }))
    expect(invalid.errors).toEqual(["现价区间不是有效数字", "今日涨跌幅下限大于上限"])
    expect(invalid.items).toHaveLength(items.length)
    expect(watchCell("price", entry({ code: "300750" }), undefined).kind).toBe("empty")
    expect(watchCell("price", items[0], quotes["000001"])).toMatchObject({ kind: "number", value: 0 })
    expect(watchCell("riseDays", items[0], quotes["000001"])).toMatchObject({ kind: "number", value: 0 })
  })
})

describe("watch column prefs", () => {
  it("hides, reorders and restores without dropping required columns", () => {
    const prefs = defaultWatchPrefs("list")
    const hidden = toggleColumn(toggleColumn(prefs.hidden, "code"), "amount")
    expect(hidden).not.toContain("code")
    expect(hidden).not.toContain("amount")
    const order = moveColumn(prefs.order, "reason", -1)
    expect(order.indexOf("reason")).toBe(prefs.order.indexOf("reason") - 1)
    const visible = visibleColumns({ ...prefs, order, hidden })
    expect(visible[0]).toBe("code")
    expect(visible).toContain("name")
    expect(visible).toContain("amount")
  })

  it("falls back when the saved prefs are corrupt or from another version", () => {
    expect(loadWatchPrefs("{").repaired).toBe(true)
    expect(loadWatchPrefs(JSON.stringify({ version: 0, view: "list" }), "cards").prefs.view).toBe("cards")
    const stored = JSON.stringify({
      version: 1,
      view: "cards",
      order: ["reason", "nope", "code", "code", "name"],
      hidden: ["code", "name", "reason", "nope"],
    })
    const loaded = loadWatchPrefs(stored, "list")
    expect(loaded.prefs.view).toBe("cards")
    expect(loaded.prefs.order.slice(0, 3)).toEqual(["reason", "code", "name"])
    expect(loaded.prefs.hidden).toEqual(["reason"])
    expect(visibleColumns(loaded.prefs)).toContain("code")
    expect(JSON.parse(serializeWatchPrefs(loaded.prefs)).version).toBe(1)
  })
})
