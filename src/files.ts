import { EXTRA_FIELDS, FIELDS } from "./fields"
import type { StockRow } from "./types"

export function rowsToJson(rows: StockRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`
}

export function rowsToCsv(rows: StockRow[]): string {
  const fieldnames = [...FIELDS]
  for (const extra of EXTRA_FIELDS) {
    if (rows.some((row) => extra in row) && !fieldnames.includes(extra)) {
      fieldnames.push(extra)
    }
  }
  const escape = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
    return value
  }
  const lines = [fieldnames.join(",")]
  for (const row of rows) {
    lines.push(fieldnames.map((key) => escape(row[key] ?? "")).join(","))
  }
  return `\uFEFF${lines.join("\n")}\n`
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function timestampName(ext: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `lxsz_rankings_${stamp}.${ext}`
}
