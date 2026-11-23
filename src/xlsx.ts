export type XlsxCell =
  | { kind: "blank" }
  | { kind: "text"; text: string }
  | { kind: "number"; value: number; style: "decimal" | "integer" }
  | { kind: "date"; iso: string }

export type XlsxSheet = {
  name: string
  headers: string[]
  rows: XlsxCell[][]
  widths?: number[]
}

const XML = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const REL = "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"

export function buildXlsx(sheet: XlsxSheet, now = new Date()): Uint8Array {
  return zipStore([
    { name: "[Content_Types].xml", data: textContentTypes() },
    { name: "_rels/.rels", data: textRels() },
    { name: "xl/workbook.xml", data: textWorkbook(sheet.name) },
    { name: "xl/_rels/workbook.xml.rels", data: textWorkbookRels() },
    { name: "xl/styles.xml", data: textStyles() },
    { name: "xl/worksheets/sheet1.xml", data: textSheet(sheet) },
  ], now)
}

export function excelSerial(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const epoch = Date.UTC(1899, 11, 30)
  return Math.round((date.getTime() - epoch) / 86400000)
}

export function formatExcelNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("无效数字")
  if (Object.is(value, -0) || value === 0) return "0"
  const raw = String(value)
  if (!/[eE]/.test(raw)) return raw
  return value.toFixed(10).replace(/\.?0+$/, "")
}

function textSheet(sheet: XlsxSheet): Uint8Array {
  const columns = sheet.headers.length
  const last = columnName(columns)
  const endRow = sheet.rows.length + 1
  const widths = sheet.headers.map((header, index) => sheet.widths?.[index] ?? columnWidth(header))
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")
  const header = sheet.headers.map((header, index) => inline(columnName(index + 1), 1, header)).join("")
  const body = sheet.rows.map((row, rowIndex) => {
    const cells = row.slice(0, columns).map((cell, index) => renderCell(columnName(index + 1), rowIndex + 2, cell)).filter(Boolean).join("")
    return `<row r="${rowIndex + 2}">${cells}</row>`
  }).join("")
  const filter = columns > 0 ? `<autoFilter ref="A1:${last}${endRow}"/>` : ""
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="${XML}">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    filter +
    `</worksheet>`
  return utf8(xml)
}

function renderCell(column: string, row: number, cell: XlsxCell): string {
  const ref = `${column}${row}`
  if (cell.kind === "blank") return ""
  if (cell.kind === "text") return inline(column, row, cell.text)
  if (cell.kind === "date") {
    const serial = excelSerial(cell.iso)
    if (serial == null) return inline(column, row, cell.iso)
    return `<c r="${ref}" s="1"><v>${serial}</v></c>`
  }
  const style = cell.style === "integer" ? 3 : 2
  return `<c r="${ref}" s="${style}"><v>${formatExcelNumber(cell.value)}</v></c>`
}

function inline(column: string, row: number, value: string): string {
  return `<c r="${column}${row}" t="inlineStr"><is><t${preserve(value)}>${xmlText(value)}</t></is></c>`
}

function preserve(value: string): string {
  return /^\s|\s$|\n|\t/.test(value) ? ` xml:space="preserve"` : ""
}

function xmlText(value: string): string {
  return [...value].filter((char) => {
    const code = char.charCodeAt(0)
    return code === 9 || code === 10 || code === 13 || code >= 32
  }).join("").replace(/[&<>]/g, (char) => char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;")
}

function columnName(index: number): string {
  let value = index
  let name = ""
  while (value > 0) {
    const mod = (value - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function columnWidth(label: string): number {
  let width = 0
  for (const char of label) width += char.charCodeAt(0) > 255 ? 2.2 : 1.1
  return Math.min(36, Math.max(12, Math.ceil(width + 2)))
}

function textStyles(): Uint8Array {
  return utf8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="${XML}">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts>` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="4">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `</styleSheet>`,
  )
}

function textContentTypes(): Uint8Array {
  return utf8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="${CONTENT_TYPES}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`,
  )
}

function textRels(): Uint8Array {
  return utf8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  )
}

function textWorkbook(name: string): Uint8Array {
  return utf8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="${XML}" xmlns:r="${OFFICE_REL}">` +
    `<sheets><sheet name="${xmlText(name) || "Sheet1"}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`,
  )
}

function textWorkbookRels(): Uint8Array {
  return utf8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${REL}">` +
    `<Relationship Id="rId1" Type="${OFFICE_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${OFFICE_REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`,
  )
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

type ZipItem = { name: string; data: Uint8Array }

export function zipStore(items: ZipItem[], now = new Date()): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  const stamp = dosStamp(now)
  for (const item of items) {
    const name = utf8(item.name)
    const crc = crc32(item.data)
    const local = new Uint8Array(30 + name.length + item.data.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x0800, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, stamp.time, true)
    view.setUint16(12, stamp.date, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, item.data.length, true)
    view.setUint32(22, item.data.length, true)
    view.setUint16(26, name.length, true)
    view.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(item.data, 30 + name.length)
    locals.push(local)
    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, stamp.time, true)
    centralView.setUint16(14, stamp.date, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, item.data.length, true)
    centralView.setUint32(24, item.data.length, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, items.length, true)
  endView.setUint16(10, items.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  endView.setUint16(20, 0, true)
  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

function dosStamp(now: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, now.getFullYear()))
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const date = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  return { time, date }
}

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  CRC_TABLE[index] = crc
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
