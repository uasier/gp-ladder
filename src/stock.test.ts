import { describe, expect, it } from "vitest"
import { DEFAULT_FILTERS, DEFAULT_HIGHLIGHT, type StockRow } from "./types"
import {
  buildDetailUrl,
  countByDay,
  daysFromCounts,
  filterAndSort,
  filtersWithoutFacet,
  getAvgPct,
  getBodyPct,
  getPrice,
  getRetailIndex,
  hasActiveFilters,
  shouldHighlight,
  topIndustries,
} from "./stock"

const qualified: StockRow = {
  股票代码: "000001",
  股票简称: "平安银行",
  连涨天数: "3",
  连续涨跌幅: "9.00%",
  累计换手率: "15.00%",
  今日换手率: "4.50%",
  散户指数: "-6.20%",
  所属行业: "银行",
  现价: "10.20",
  今日涨跌幅: "1.20%",
  "平均涨幅/天": "3.00%",
}

describe("shouldHighlight", () => {
  it("matches default 精选规则", () => {
    expect(shouldHighlight(qualified, DEFAULT_HIGHLIGHT)).toBe(true)
    expect(shouldHighlight({ ...qualified, 散户指数: "-5.00%" }, DEFAULT_HIGHLIGHT)).toBe(false)
    expect(shouldHighlight({ ...qualified, 今日换手率: "10.00%" }, DEFAULT_HIGHLIGHT)).toBe(false)
    expect(
      shouldHighlight({ ...qualified, 连涨天数: "5", 连续涨跌幅: "5.00%", "平均涨幅/天": "1.00%" }, DEFAULT_HIGHLIGHT),
    ).toBe(false)
  })
})

describe("filterAndSort", () => {
  it("defaults to 非 ST + 仅精选", () => {
    const rows = [
      qualified,
      { ...qualified, 股票代码: "000002", 股票简称: "ST示例", 散户指数: "-8.00%" },
      { ...qualified, 股票代码: "000003", 散户指数: "2.00%" },
    ]
    const filtered = filterAndSort(rows, DEFAULT_FILTERS, DEFAULT_HIGHLIGHT)
    expect(filtered.map((r) => r["股票代码"])).toEqual(["000001"])
  })

  it("filters by keyword and industry", () => {
    const rows = [
      qualified,
      { ...qualified, 股票代码: "600519", 股票简称: "贵州茅台", 所属行业: "白酒" },
    ]
    const filtered = filterAndSort(
      rows,
      { ...DEFAULT_FILTERS, onlyHighlight: false, keyword: "600519" },
      DEFAULT_HIGHLIGHT,
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0]["股票简称"]).toBe("贵州茅台")
  })

  it("retail out preset keeps negative index", () => {
    const rows = [
      { ...qualified, 股票代码: "1", 散户指数: "-1.00%", 今日换手率: "1%" },
      { ...qualified, 股票代码: "2", 散户指数: "1.00%", 今日换手率: "1%" },
    ]
    const filtered = filterAndSort(
      rows,
      { ...DEFAULT_FILTERS, onlyHighlight: false, retailRange: "out" },
      DEFAULT_HIGHLIGHT,
    )
    expect(filtered.map((r) => r["股票代码"])).toEqual(["1"])
  })
})

describe("helpers", () => {
  it("builds eastmoney url by exchange prefix", () => {
    expect(buildDetailUrl("000001")).toContain("/sz000001.html")
    expect(buildDetailUrl("600519")).toContain("/sh600519.html")
  })

  it("parses retail / avg / price", () => {
    expect(getBodyPct({ 实体涨幅: "2.10%" })).toBeCloseTo(2.1)
    expect(getRetailIndex(qualified)).toBeCloseTo(-6.2)
    expect(getAvgPct(qualified)).toBeCloseTo(3)
    expect(getPrice(qualified)).toBeCloseTo(10.2)
  })

  it("does not zero other day chips when one day is selected", () => {
    const rows = [
      { ...qualified, 股票代码: "1", 连涨天数: "3" },
      { ...qualified, 股票代码: "2", 连涨天数: "4" },
    ]
    const filters = { ...DEFAULT_FILTERS, onlyHighlight: false, exactDay: 3 }
    expect(filterAndSort(rows, filters, DEFAULT_HIGHLIGHT)).toHaveLength(1)
    const facet = filterAndSort(rows, filtersWithoutFacet(filters, "exactDay"), DEFAULT_HIGHLIGHT)
    const counts = countByDay(facet)
    expect(counts[3]).toBe(1)
    expect(counts[4]).toBe(1)
    expect(daysFromCounts(counts, filters.exactDay)).toEqual([4, 3])
  })

  it("industry chip counts follow 仅精选 so empty industries are not advertised", () => {
    const rows = [
      qualified,
      { ...qualified, 股票代码: "2", 所属行业: "白酒", 散户指数: "2.00%", 今日换手率: "1%" },
    ]
    const facet = filterAndSort(
      rows,
      filtersWithoutFacet(DEFAULT_FILTERS, "industry"),
      DEFAULT_HIGHLIGHT,
    )
    const chips = topIndustries(facet, 12, "all")
    expect(chips.find((item) => item.name === "银行")?.count).toBe(1)
    expect(chips.find((item) => item.name === "白酒")).toBeUndefined()
    const listed = filterAndSort(rows, { ...DEFAULT_FILTERS, industry: "银行" }, DEFAULT_HIGHLIGHT)
    expect(listed).toHaveLength(1)
  })

  it("detects active filters", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, keyword: "平安" })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, onlyHighlight: false })).toBe(true)
  })
})
