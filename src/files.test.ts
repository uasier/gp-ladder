import { describe, expect, it } from "vitest"
import { rowsToCsv, rowsToJson } from "./files"

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
})

describe("rowsToJson", () => {
  it("pretty prints array", () => {
    const text = rowsToJson([{ 股票代码: "000001" }])
    expect(JSON.parse(text)[0]["股票代码"]).toBe("000001")
  })
})
