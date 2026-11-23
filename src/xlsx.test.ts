import { describe, expect, it } from "vitest"
import { buildXlsx, excelSerial, formatExcelNumber } from "./xlsx"

function sheetXml(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes)
  const start = text.indexOf("<worksheet")
  const end = text.indexOf("</worksheet>")
  return text.slice(start, end + "</worksheet>".length)
}

describe("xlsx workbook", () => {
  it("stores codes as text, keeps zero, leaves gaps blank and does not emit formulas", () => {
    const bytes = buildXlsx({
      name: "自选",
      headers: ["股票代码", "现价(元)", "自选日期", "自选原因"],
      rows: [
        [
          { kind: "text", text: "000001" },
          { kind: "number", value: 0, style: "decimal" },
          { kind: "date", iso: "2026-10-01" },
          { kind: "text", text: "=1+1" },
        ],
        [
          { kind: "text", text: "300750" },
          { kind: "blank" },
          { kind: "date", iso: "2026-02-31" },
          { kind: "text", text: "+CMD('-1')\n@SUM(A1)" },
        ],
      ],
    })
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const xml = sheetXml(bytes)
    expect(xml).toContain("股票代码")
    expect(xml).toContain('<c r="A2" t="inlineStr"><is><t>000001</t></is></c>')
    expect(xml).toContain('<c r="B2" s="2"><v>0</v></c>')
    expect(xml).not.toContain('r="B3"')
    expect(xml).toContain(`<c r="C2" s="1"><v>${excelSerial("2026-10-01")}</v></c>`)
    expect(xml).toContain('<c r="C3" t="inlineStr"><is><t>2026-02-31</t></is></c>')
    expect(xml).toContain("<t>=1+1</t>")
    expect(xml).toContain("+CMD('-1')")
    expect(xml).toContain("@SUM(A1)")
    expect(xml).not.toContain("<f")
    expect(xml).not.toContain("hyperlink")
    expect(xml).toContain('state="frozen"')
    expect(xml).toContain('autoFilter ref="A1:D3"')
    const packageText = new TextDecoder().decode(bytes)
    expect(packageText).not.toContain("vbaProject")
    expect(excelSerial("2026-02-31")).toBeNull()
    expect(excelSerial("2026-10-01")).toBeGreaterThan(40000)
    expect(formatExcelNumber(0)).toBe("0")
    expect(formatExcelNumber(10.5)).toBe("10.5")
  })
})
