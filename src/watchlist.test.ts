import { describe, expect, it } from "vitest"
import type { StockRow } from "./types"
import {
  applyReasonPreset,
  blankDraft,
  changeSinceAdded,
  draftFromStock,
  draftToInput,
  entryToDraft,
  filterWatchEntries,
  formatSignedPct,
  isValidDate,
  isWatchCode,
  parsePriceInput,
  parseWatchSort,
  sortWatchEntries,
  sourceLabel,
  validateWatchDraft,
  type WatchEntry,
  type WatchQuote,
} from "./watchlist"

const today = "2026-10-20"

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

function draft(patch: Partial<ReturnType<typeof blankDraft>> = {}) {
  return { ...blankDraft(today), code: "600519", name: "贵州茅台", addedPrice: "1688.50", reason: "趋势跟随", addedDate: "2026-10-18", ...patch }
}

describe("watchlist validation", () => {
  it("accepts a complete draft and keeps the recorded price", () => {
    expect(validateWatchDraft(draft(), today)).toBeNull()
    expect(draftToInput(draft())).toMatchObject({
      code: "600519",
      addedDate: "2026-10-18",
      addedPrice: 1688.5,
      reason: "趋势跟随",
    })
  })

  it("rejects unsupported codes, future dates, missing reason and bad prices", () => {
    expect(validateWatchDraft(draft({ code: "12" }), today)).toBe("股票代码需为 6 位数字")
    expect(validateWatchDraft(draft({ code: "111111" }), today)).toBe("暂不支持该股票代码")
    expect(validateWatchDraft(draft({ addedDate: "2026-02-31" }), today)).toBe("自选日期无效")
    expect(validateWatchDraft(draft({ addedDate: "2026-10-21" }), today)).toBe("自选日期不能晚于今天")
    expect(validateWatchDraft(draft({ addedPrice: "" }), today)).toBe("请填写自选价格")
    expect(validateWatchDraft(draft({ addedPrice: "0" }), today)).toMatch(/自选价格/)
    expect(validateWatchDraft(draft({ reason: "  " }), today)).toBe("请填写自选原因")
    expect(isWatchCode("920001")).toBe(true)
    expect(isWatchCode("688001")).toBe(true)
    expect(isValidDate("2024-02-29")).toBe(true)
    expect(parsePriceInput("10.25")).toBe(10.25)
    expect(parsePriceInput("10.123456")).toBeNull()
  })

  it("builds a draft from the current board row without inventing a price", () => {
    const row: StockRow = { 股票代码: "000001", 股票简称: "平安银行", 所属行业: "银行", 现价: "10.20" }
    expect(draftFromStock(row, "zt", today)).toMatchObject({
      code: "000001",
      name: "平安银行",
      industry: "银行",
      addedDate: today,
      addedPrice: "10.20",
      source: "zt",
      reason: "",
    })
    expect(draftFromStock({ 股票代码: "300001", 股票简称: "特锐德" }, "jjzt", today).addedPrice).toBe("")
  })

  it("appends a reason preset once and preserves an existing entry when editing", () => {
    expect(applyReasonPreset("", "连板观察")).toBe("连板观察")
    expect(applyReasonPreset("趋势跟随", "连板观察")).toBe("趋势跟随、连板观察")
    expect(applyReasonPreset("趋势跟随、连板观察", "连板观察")).toBe("趋势跟随、连板观察")
    expect(entryToDraft(entry()).source).toBe("lxsz")
    expect(sourceLabel("manual")).toBe("手动添加")
  })
})

describe("watchlist sorting", () => {
  const items = [
    entry({ code: "000001", name: "平安银行", addedDate: "2026-10-02", addedPrice: 10, reason: "低吸", createdAt: "2026-10-02T10:00:00.000+08:00" }),
    entry(),
    entry({ code: "300750", name: "宁德时代", addedDate: "2026-10-03", addedPrice: 200, reason: "龙头", createdAt: "2026-10-03T10:00:00.000+08:00" }),
  ]
  const quotes: Record<string, WatchQuote> = {
    "600519": { code: "600519", name: "贵州茅台", price: 1650, changePct: 1.2, quoteAt: "2026-10-20 14:00:00" },
    "000001": { code: "000001", name: "平安银行", price: 9, changePct: -0.5, quoteAt: "2026-10-20 14:00:00" },
  }

  it("sorts by added date and keeps missing live quotes last", () => {
    expect(sortWatchEntries(items, quotes, "addedDate", "desc").map((item) => item.code)).toEqual([
      "300750",
      "000001",
      "600519",
    ])
    expect(sortWatchEntries(items, quotes, "change", "desc").map((item) => item.code)[2]).toBe("300750")
    expect(changeSinceAdded(1500, 1650)).toBeCloseTo(10)
    expect(changeSinceAdded(10, null)).toBeNull()
    expect(formatSignedPct(-1.2)).toBe("-1.20%")
  })

  it("filters by reason and parses the sort control", () => {
    expect(filterWatchEntries(items, "龙头").map((item) => item.code)).toEqual(["300750"])
    expect(filterWatchEntries(items, "000001")).toHaveLength(1)
    expect(parseWatchSort("todayPct:asc")).toEqual({ key: "todayPct", dir: "asc" })
    expect(parseWatchSort("nope")).toEqual({ key: "addedDate", dir: "desc" })
  })
})
