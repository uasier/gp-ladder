import { describe, expect, it } from "vitest"
import type { StockRow } from "./types"
import { draftToInput, validateWatchDraft } from "./watchlist"
import { resolveStockPickWatch } from "./stockPickWatch"

const today = "2026-11-06"

function row(code: string, name: string, extra: StockRow = {}): StockRow {
  return { 股票代码: code, 股票简称: name, 所属行业: "测试行业", 现价: "10.25", ...extra }
}

const rows = [
  row("600519", "贵州茅台", { 所属行业: "白酒", 现价: "1688.50" }),
  row("000001", "平安银行", { 所属行业: "银行", 现价: "" , "收盘价(元)": "11.20" }),
  row("300750", "宁德时代"),
  row("688981", "中芯国际"),
  row("920001", "北交测试"),
  row("830001", "北交旧码", { 现价: "" }),
  row("111111", "无效代码"),
]

describe("resolveStockPickWatch", () => {
  it("uses the structured code and the candidate name, market and price", () => {
    const resolved = resolveStockPickWatch(
      { code: "600519", name: "模型写错的名字", reason: "量价配合，观察承接" },
      rows,
      "zt",
      today,
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.code).toBe("600519")
    expect(resolved.name).toBe("贵州茅台")
    expect(resolved.marketId).toBe("17")
    expect(resolved.marketLabel).toBe("沪市")
    expect(resolved.draft).toMatchObject({
      code: "600519",
      name: "贵州茅台",
      industry: "白酒",
      addedPrice: "1688.50",
      source: "zt",
      reason: "量价配合，观察承接",
      addedDate: today,
    })
    expect(validateWatchDraft(resolved.draft, today)).toBeNull()
    expect(draftToInput(resolved.draft).addedPrice).toBe(1688.5)
  })

  it("accepts a market-qualified code and maps Shenzhen, ChiNext, STAR and Beijing markets", () => {
    const cases = [
      ["SZ000001", "000001", "33", "深市", "11.20"],
      ["300750.sz", "300750", "33", "深市", "10.25"],
      ["sh688981", "688981", "17", "沪市", "10.25"],
      ["BJ920001", "920001", "151", "北交所", "10.25"],
      ["830001.BJ", "830001", "145", "北交所", ""],
    ] as const
    for (const [input, code, marketId, label, price] of cases) {
      const resolved = resolveStockPickWatch({ code: input, name: "" }, rows, "lxsz", today)
      expect(resolved.ok, input).toBe(true)
      if (!resolved.ok) continue
      expect(resolved.code).toBe(code)
      expect(resolved.marketId).toBe(marketId)
      expect(resolved.marketLabel).toBe(label)
      expect(resolved.draft.addedPrice).toBe(price)
      expect(resolved.draft.name).not.toBe("")
    }
  })

  it("rejects an explicit code outside the candidate list instead of scanning nearby text", () => {
    const resolved = resolveStockPickWatch(
      { code: "999999", name: "贵州茅台", reason: "正文里提到 600519 也不应被改选" },
      rows,
      "zt",
      today,
    )
    expect(resolved).toEqual({ ok: false, message: "不在本次选股候选中，未加入自选" })
  })

  it("rejects a market prefix that disagrees with the code", () => {
    const resolved = resolveStockPickWatch({ code: "sz600519", name: "贵州茅台" }, rows, "zt", today)
    expect(resolved).toEqual({ ok: false, message: "股票代码与市场标识不一致，未加入自选" })
  })

  it("rejects an explicit code whose name exactly matches a different candidate", () => {
    const resolved = resolveStockPickWatch({ code: "600519", name: "平安银行" }, rows, "jjzt", today)
    expect(resolved).toEqual({ ok: false, message: "股票代码与名称不一致，未加入自选" })
  })

  it("rejects unsupported codes that happen to be six digits", () => {
    const resolved = resolveStockPickWatch({ code: "111111", name: "无效代码" }, rows, "zt", today)
    expect(resolved).toEqual({ ok: false, message: "暂不支持该股票代码" })
  })

  it("parses one real candidate out of unstructured text and ignores unrelated numbers", () => {
    const resolved = resolveStockPickWatch(
      {
        code: "测试样例：现价 12.50，成交额 168850，评分 90，建议看 sh600519。123456 不是候选。",
        name: "贵州茅台",
        reason: "短线观察",
      },
      rows,
      "jjzt",
      today,
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.code).toBe("600519")
    expect(resolved.name).toBe("贵州茅台")
    expect(resolved.marketId).toBe("17")
    expect(resolved.draft.source).toBe("jjzt")
  })

  it("does not treat a longer number or a decimal fragment as a stock code", () => {
    const resolved = resolveStockPickWatch(
      { code: "编号 16005190，价格 10.600519，另一段 6005190", name: "没有这只" },
      rows,
      "zt",
      today,
    )
    expect(resolved).toEqual({ ok: false, message: "无法确认股票代码，未加入自选" })
  })

  it("refuses unstructured text that mentions more than one candidate", () => {
    const resolved = resolveStockPickWatch(
      { code: "600519 和 000001 都可以", name: "" },
      rows,
      "zt",
      today,
    )
    expect(resolved).toEqual({ ok: false, message: "结果里有多只股票，请逐只确认后再加入" })
  })

  it("can identify a unique candidate by its exact snapshot name", () => {
    const resolved = resolveStockPickWatch({ code: "见上文", name: "宁德时代" }, rows, "lxsz", today)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved).toMatchObject({ code: "300750", name: "宁德时代", marketId: "33", marketLabel: "深市" })
  })

  it("does not copy an overly long pick reason into the watch draft", () => {
    const resolved = resolveStockPickWatch(
      { code: "300750", name: "宁德时代", reason: "观察".repeat(120) },
      rows,
      "zt",
      today,
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.draft.reason).toBe("")
  })

  it("keeps the first candidate when the snapshot repeats a code", () => {
    const resolved = resolveStockPickWatch(
      { code: "000001", name: "平安银行" },
      [row("000001", "平安银行", { 所属行业: "银行", 现价: "9.90" }), row("000001", "重复行", { 现价: "1.00" })],
      "zt",
      today,
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.draft.industry).toBe("银行")
    expect(resolved.draft.addedPrice).toBe("9.90")
    expect(resolved.name).toBe("平安银行")
  })
})
