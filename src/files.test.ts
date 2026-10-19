import { describe, expect, it } from "vitest"
import { rowsToCsv, rowsToJson, timestampName } from "./files"

describe("rowsToCsv", () => {
  it("includes extra columns when present", () => {
    const csv = rowsToCsv([
      {
        序号: "1",
        股票代码: "000001",
        股票简称: "平安银行",
        "收盘价(元)": "10.00",
        散户指数: "-6.20%",
      },
    ])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain("股票代码")
    expect(csv).toContain("散户指数")
    expect(csv).toContain("000001")
    expect(csv).toContain("-6.20%")
  })

  it("exports volume ratio as a number column and leaves old snapshots blank", () => {
    const rows = [
      { 股票代码: "000001", 量比: "1.25" },
      { 股票代码: "000002", 量比: "0.00" },
      { 股票代码: "000003" },
    ]
    const [header, ...data] = rowsToCsv(rows).trim().split("\n")
    const column = header.split(",").indexOf("量比")
    expect(column).toBeGreaterThan(-1)
    expect(data.map((line) => line.split(",")[column])).toEqual(["1.25", "0.00", ""])
    expect(JSON.parse(rowsToJson(rows))).toEqual(rows)
  })
})

describe("timestampName", () => {
  it("uses ranking prefix and extension", () => {
    expect(timestampName("html")).toMatch(/^lxsz_rankings_\d{8}_\d{6}\.html$/)
    expect(timestampName("apk")).toMatch(/\.apk$/)
  })
})

describe("rowsToJson", () => {
  it("pretty prints array", () => {
    const text = rowsToJson([{ 股票代码: "000001" }])
    expect(JSON.parse(text)[0]["股票代码"]).toBe("000001")
  })
})
