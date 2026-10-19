import { describe, expect, it } from "vitest"
import { DEFAULT_FILTERS, DEFAULT_HIGHLIGHT, type StockRow } from "./types"
import {
  buildDetailUrl,
  buildTonghuashunAppUrl,
  buildTonghuashunPageUrl,
  countByDay,
  daysFromCounts,
  filterAndSort,
  filtersWithoutFacet,
  formatVolumeRatio,
  getAvgPct,
  getBodyPct,
  getPrice,
  getRetailIndex,
  getVolumeRatio,
  hasActiveFilters,
  isNearDayHigh,
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

describe("volume ratio", () => {
  it.each([
    ["1.25", 1.25], [" 2.00 ", 2], ["0.00", 0],
    [undefined, null], ["", null], [" ", null], ["-", null], ["--", null],
    ["NaN", null], ["Infinity", null], ["-1.00", null], ["1.25%", null],
  ])("parses %s without treating missing values as zero", (raw, expected) => {
    expect(getVolumeRatio(raw === undefined ? {} : { 量比: raw })).toBe(expected)
  })

  it("formats ratios as multiples and missing data as a dash", () => {
    expect(formatVolumeRatio({ 量比: "1.2" })).toBe("1.20 倍")
    expect(formatVolumeRatio({ 量比: "0" })).toBe("0.00 倍")
    expect(formatVolumeRatio({})).toBe("--")
    expect(formatVolumeRatio({ 量比: "-" })).toBe("--")
  })

  const rows: StockRow[] = [
    { ...qualified, 股票代码: "zero", 量比: "0.00" },
    { ...qualified, 股票代码: "low", 量比: "0.80" },
    { ...qualified, 股票代码: "min", 量比: "1.00" },
    { ...qualified, 股票代码: "mid", 量比: "1.25" },
    { ...qualified, 股票代码: "max", 量比: "2.00" },
    { ...qualified, 股票代码: "high", 量比: "2.01" },
    { ...qualified, 股票代码: "missing" },
    { ...qualified, 股票代码: "blank", 量比: "" },
    { ...qualified, 股票代码: "placeholder", 量比: "-" },
    { ...qualified, 股票代码: "invalid", 量比: "NaN" },
  ]

  it.each([
    [1, 2, ["min", "mid", "max"]],
    [1.25, null, ["mid", "max", "high"]],
    [null, 1, ["zero", "low", "min"]],
    [0, 0, ["zero"]],
    [1.25, 1.25, ["mid"]],
    [2, 1, []],
  ] as [number | null, number | null, string[]][])(
    "filters inclusive range %s to %s",
    (volumeRatioMin, volumeRatioMax, expected) => {
      const filtered = filterAndSort(
        rows, { ...DEFAULT_FILTERS, volumeRatioMin, volumeRatioMax }, DEFAULT_HIGHLIGHT,
      )
      expect(filtered.map((row) => row["股票代码"])).toEqual(expected)
    },
  )

  it("keeps old snapshots and clears the range with the default filters", () => {
    expect(filterAndSort(rows, DEFAULT_FILTERS, DEFAULT_HIGHLIGHT)).toHaveLength(rows.length)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, volumeRatioMin: 0 })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, volumeRatioMax: 2 })).toBe(true)
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
  })

  it("combines with other filters and remains active in facet counts", () => {
    const filtered = filterAndSort(
      rows,
      { ...DEFAULT_FILTERS, volumeRatioMin: 1, volumeRatioMax: 2, keyword: "mid" },
      DEFAULT_HIGHLIGHT,
    )
    expect(filtered.map((row) => row["股票代码"])).toEqual(["mid"])
    const filters = { ...DEFAULT_FILTERS, volumeRatioMin: 1, volumeRatioMax: 2, exactDay: 4 }
    expect(filterAndSort(rows, filters, DEFAULT_HIGHLIGHT)).toHaveLength(0)
    const facet = filterAndSort(rows, filtersWithoutFacet(filters, "exactDay"), DEFAULT_HIGHLIGHT)
    expect(countByDay(facet)).toEqual({ 3: 3 })
    expect(topIndustries(facet)).toEqual([{ name: "银行", count: 3 }])
  })
})

describe("helpers", () => {
  it("builds eastmoney url by exchange prefix", () => {
    expect(buildDetailUrl("000001")).toContain("/sz000001.html")
    expect(buildDetailUrl("600519")).toContain("/sh600519.html")
  })

  it("builds tonghuashun stock page and app urls", () => {
    expect(buildTonghuashunPageUrl("600519")).toBe("https://m.10jqka.com.cn/stockpage/hs_600519/")
    expect(buildTonghuashunPageUrl("000001")).toBe("https://m.10jqka.com.cn/stockpage/hs_000001/")
    expect(buildTonghuashunPageUrl("300750")).toBe("https://m.10jqka.com.cn/stockpage/hs_300750/")
    expect(buildTonghuashunPageUrl("920027")).toBe("https://m.10jqka.com.cn/stockpage/151_920027/")
    expect(buildTonghuashunPageUrl("830799")).toBe("https://m.10jqka.com.cn/stockpage/145_830799/")
    expect(buildTonghuashunPageUrl("abc")).toBe("#")

    expect(buildTonghuashunAppUrl("600519")).toBe(
      "amihexin://command=gotopage&clientUrl=client.html?action=ymtz^webid=2205^stockcode=600519^marketid=17",
    )
    expect(buildTonghuashunAppUrl("000001")).toContain("marketid=33")
    expect(buildTonghuashunAppUrl("920027")).toContain("marketid=151")
    expect(buildTonghuashunAppUrl("")).toBe("")
  })

  it("parses retail / avg / price", () => {
    expect(getBodyPct({ 实体涨幅: "2.10%" })).toBeCloseTo(2.1)
    expect(getRetailIndex(qualified)).toBeCloseTo(-6.2)
    expect(getAvgPct(qualified)).toBeCloseTo(3)
    expect(getPrice(qualified)).toBeCloseTo(10.2)
  })

  it("detects active filters", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, keyword: "平安" })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, onlyHighlight: false })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, nearDayHigh: true })).toBe(true)
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

  it("treats price within 0.5% of the day high as 现价近最高", () => {
    expect(isNearDayHigh({ ...qualified, 现价: "10.00", 今高: "10.00" })).toBe(true)
    expect(isNearDayHigh({ ...qualified, 现价: "9.95", 今高: "10.00" })).toBe(true)
    expect(isNearDayHigh({ ...qualified, 现价: "10.05", 今高: "10.00" })).toBe(true)
    expect(isNearDayHigh({ ...qualified, 现价: "9.94", 今高: "10.00" })).toBe(false)
    expect(isNearDayHigh({ ...qualified, 现价: "10.00", 今高: "" })).toBe(false)
  })

  it("filters 现价近最高", () => {
    const rows = [
      { ...qualified, 股票代码: "1", 现价: "10.00", 今高: "10.00" },
      { ...qualified, 股票代码: "2", 现价: "9.80", 今高: "10.00" },
    ]
    const filtered = filterAndSort(
      rows,
      { ...DEFAULT_FILTERS, onlyHighlight: false, nearDayHigh: true },
      DEFAULT_HIGHLIGHT,
    )
    expect(filtered.map((r) => r["股票代码"])).toEqual(["1"])
  })
})

