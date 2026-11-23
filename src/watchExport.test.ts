import { describe, expect, it } from "vitest"
import type { WatchEntry, WatchQuote } from "./watchlist"
import { buildWatchXlsx, deliverXlsx, ensureXlsxPath, type XlsxIo } from "./watchExport"

const entry: WatchEntry = {
  code: "000001",
  name: "平安银行",
  industry: "银行",
  addedDate: "2026-10-01",
  addedPrice: 10,
  reason: "-注意",
  source: "manual",
  createdAt: "2026-10-01T09:30:00.000+08:00",
  updatedAt: "2026-10-01T09:30:00.000+08:00",
}

function io(patch: Partial<XlsxIo> = {}): XlsxIo & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    tauri: false,
    mobile: false,
    pickPath: async () => {
      calls.push("pick")
      return "/tmp/out.xlsx"
    },
    writeFile: async (path) => {
      calls.push(`write:${path}`)
      return `/data/exports/${path.split(/[/\\]/).pop()}`
    },
    download: () => calls.push("download"),
    openPath: async (path) => {
      calls.push(`open:${path}`)
    },
    ...patch,
  }
}

describe("watch export delivery", () => {
  it("builds a real workbook for the chosen rows and columns", () => {
    const quotes: Record<string, WatchQuote> = {}
    const bytes = buildWatchXlsx(["code", "name", "price", "reason"], [entry], quotes)
    const xml = new TextDecoder().decode(bytes)
    expect(xml).toContain("股票代码")
    expect(xml).toContain("000001")
    expect(xml).toContain("-注意")
    expect(xml).not.toMatch(/<f[\s>]/)
    const gain = buildWatchXlsx(["sinceAdded"], [{ ...entry, addedPrice: 1500 }], {
      "000001": { code: "000001", name: "平安银行", price: 1660, changePct: 1, quoteAt: "2026-10-20 15:00:00" },
    })
    expect(new TextDecoder().decode(gain)).toContain("<v>10.6667</v>")
    expect(() => buildWatchXlsx(["code"], [], {})).toThrow(/没有可导出/)
  })

  it("downloads on the web, cancels without writing, and saves on desktop or Android", async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const web = io()
    await expect(deliverXlsx("gp-ladder_watch_20261123.xlsx", bytes, web)).resolves.toBe("saved")
    expect(web.calls).toEqual(["download"])

    const desktop = io({
      tauri: true,
      pickPath: async () => null,
    })
    await expect(deliverXlsx("gp-ladder_watch_20261123.xlsx", bytes, desktop)).resolves.toBe("cancelled")
    expect(desktop.calls).toEqual([])

    const saved = io({ tauri: true })
    await expect(deliverXlsx("gp-ladder_watch_20261123.xlsx", bytes, saved)).resolves.toBe("saved")
    expect(saved.calls).toEqual(["pick", "write:/tmp/out.xlsx"])

    const failed = io({
      tauri: true,
      writeFile: async () => {
        throw new Error("磁盘已满")
      },
    })
    await expect(deliverXlsx("gp-ladder_watch_20261123.xlsx", bytes, failed)).rejects.toThrow("磁盘已满")

    const android = io({ tauri: true, mobile: true, openPath: async () => { throw new Error("没有应用") } })
    await expect(deliverXlsx("gp-ladder_watch_20261123.xlsx", bytes, android)).resolves.toBe("saved")
    expect(android.calls[0]).toBe("write:gp-ladder_watch_20261123.xlsx")
    expect(android.calls.some((call) => call.startsWith("pick"))).toBe(false)
  })

  it("rejects a non-xlsx extension chosen in the save dialog", () => {
    expect(ensureXlsxPath("/tmp/自选")).toBe("/tmp/自选.xlsx")
    expect(ensureXlsxPath("C:\\导出\\自选.XLSX")).toBe("C:\\导出\\自选.XLSX")
    expect(() => ensureXlsxPath("/tmp/自选.csv")).toThrow(/xlsx/)
  })
})
