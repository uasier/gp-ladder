import { isTauri, saveWatchExport } from "./api"
import { isMobileApp } from "./platform"
import type { WatchEntry, WatchQuote } from "./watchlist"
import {
  exportHeader,
  watchCell,
  watchExportFilename,
  type WatchColumnId,
} from "./watchView"
import { buildXlsx, excelSerial, type XlsxCell } from "./xlsx"

export type XlsxDelivery = "saved" | "cancelled"

export type XlsxIo = {
  tauri: boolean
  mobile: boolean
  pickPath: (filename: string) => Promise<string | null>
  writeFile: (path: string, bytes: Uint8Array) => Promise<string>
  download: (filename: string, bytes: Uint8Array) => void
  openPath?: (path: string) => Promise<void>
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export function watchRowsToSheet(
  columns: WatchColumnId[],
  rows: WatchEntry[],
  quotes: Record<string, WatchQuote | undefined>,
) {
  return {
    name: "自选",
    headers: columns.map(exportHeader),
    rows: rows.map((entry) => columns.map((id) => toXlsxCell(id, entry, quotes[entry.code]))),
  }
}

function toXlsxCell(id: WatchColumnId, entry: WatchEntry, quote?: WatchQuote): XlsxCell {
  const cell = watchCell(id, entry, quote)
  if (cell.kind === "empty") return { kind: "blank" }
  if (cell.kind === "text") return { kind: "text", text: cell.text }
  if (cell.kind === "date") {
    return excelSerial(cell.iso) == null ? { kind: "text", text: cell.iso } : { kind: "date", iso: cell.iso }
  }
  const digits = cell.digits === 0 ? 0 : 4
  return {
    kind: "number",
    value: Number(cell.value.toFixed(digits)),
    style: cell.digits === 0 ? "integer" : "decimal",
  }
}

export function buildWatchXlsx(
  columns: WatchColumnId[],
  rows: WatchEntry[],
  quotes: Record<string, WatchQuote | undefined>,
  now = new Date(),
): Uint8Array {
  if (rows.length === 0) throw new Error("没有可导出的自选")
  if (columns.length === 0) throw new Error("请至少保留代码和简称")
  return buildXlsx(watchRowsToSheet(columns, rows, quotes), now)
}

export function ensureXlsxPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) throw new Error("导出路径为空")
  const name = trimmed.split(/[/\\]/).pop() || ""
  if (!name || name === "." || name === "..") throw new Error("导出文件名不合法")
  if (name.toLowerCase().endsWith(".xlsx")) return trimmed
  const dot = name.lastIndexOf(".")
  if (dot > 0) throw new Error("请使用 .xlsx 扩展名")
  return `${trimmed}.xlsx`
}

export async function deliverXlsx(filename: string, bytes: Uint8Array, io: XlsxIo): Promise<XlsxDelivery> {
  if (!io.tauri) {
    io.download(filename, bytes)
    return "saved"
  }
  if (io.mobile) {
    const saved = await io.writeFile(filename, bytes)
    try {
      await io.openPath?.(saved)
    } catch {
      /* 文件已写入应用导出目录；系统没有可打开它的应用时仍算保存成功。 */
    }
    return "saved"
  }
  const selected = await io.pickPath(filename)
  if (selected == null || !selected.trim()) return "cancelled"
  await io.writeFile(ensureXlsxPath(selected), bytes)
  return "saved"
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime = XLSX_MIME) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function createWatchXlsxIo(): Promise<XlsxIo> {
  const tauri = isTauri()
  const mobile = isMobileApp(tauri)
  return {
    tauri,
    mobile,
    pickPath: async (filename) => {
      const { save } = await import("@tauri-apps/plugin-dialog")
      const selected = await save({
        defaultPath: filename,
        filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
      })
      return typeof selected === "string" ? selected : null
    },
    writeFile: (path, bytes) => saveWatchExport(path, bytesToHex(bytes)),
    download: (filename, bytes) => downloadBytes(filename, bytes),
    openPath: async (path) => {
      const { openPath } = await import("@tauri-apps/plugin-opener")
      await openPath(path)
    },
  }
}

export async function exportWatchXlsx(input: {
  columns: WatchColumnId[]
  rows: WatchEntry[]
  quotes: Record<string, WatchQuote | undefined>
  now?: Date
  io?: XlsxIo
}): Promise<{ status: XlsxDelivery; filename: string }> {
  const now = input.now ?? new Date()
  const filename = watchExportFilename(now)
  const bytes = buildWatchXlsx(input.columns, input.rows, input.quotes, now)
  const io = input.io ?? await createWatchXlsxIo()
  const status = await deliverXlsx(filename, bytes, io)
  return { status, filename }
}
