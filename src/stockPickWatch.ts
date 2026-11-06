import type { BoardKind, StockRow } from "./types"
import { tonghuashunMarketId } from "./stock"
import {
  WATCH_REASON_MAX,
  draftFromStock,
  isWatchCode,
  type WatchDraft,
} from "./watchlist"

/** AI 选股卡片上用于加入自选的身份。代码和名称优先取结构化字段，名称以候选快照为准。 */
export type StockPickIdentity = {
  code?: string
  name?: string
  reason?: string
}

export type ResolvedStockPickWatch = {
  ok: true
  code: string
  name: string
  marketId: string
  marketLabel: string
  row: StockRow
  draft: WatchDraft
}

export type RejectedStockPickWatch = {
  ok: false
  message: string
}

const MARKET_LABEL: Record<string, string> = {
  "17": "沪市",
  "33": "深市",
  "151": "北交所",
  "145": "北交所",
}

export function marketLabel(marketId: string): string {
  return MARKET_LABEL[marketId] ?? ""
}

/**
 * 把一只 AI 选股结果解析成可写入自选池的草稿。
 * 结构化六位代码（可带 sh/sz/bj 市场前后缀）必须命中本次候选；否则只在代码字段本身的文本里
 * 查找候选代码，不把理由、价格或其他任意数字当成股票代码。
 */
export function resolveStockPickWatch(
  pick: StockPickIdentity,
  rows: StockRow[],
  scene: BoardKind,
  today?: string,
): ResolvedStockPickWatch | RejectedStockPickWatch {
  const candidates = indexCandidates(rows)
  const rawCode = trimText(pick.code ?? "")
  const rawName = trimText(pick.name ?? "")
  const explicit = parseExplicitCode(rawCode)

  if (explicit.kind === "mismatch") {
    return reject("股票代码与市场标识不一致，未加入自选")
  }

  let code = ""
  if (explicit.kind === "code") {
    if (!candidates.has(explicit.code)) {
      return reject("不在本次选股候选中，未加入自选")
    }
    code = explicit.code
  } else {
    const mentioned = explicit.kind === "empty"
      ? findKnownCodes(rawName, candidates)
      : findKnownCodes(`${rawCode}\n${rawName}`, candidates)
    const named = rowsByExactName(candidates, rawName)
    if (mentioned.length > 1 || (mentioned.length === 0 && named.length > 1)) {
      return reject("结果里有多只股票，请逐只确认后再加入")
    }
    if (mentioned.length === 1) {
      if (named.length === 1 && named[0] !== mentioned[0]) {
        return reject("股票代码与名称不一致，未加入自选")
      }
      code = mentioned[0]
    } else if (named.length === 1) {
      code = named[0]
    } else {
      return reject("无法确认股票代码，未加入自选")
    }
  }

  const row = candidates.get(code)
  if (!row) return reject("不在本次选股候选中，未加入自选")
  if (!isWatchCode(code)) return reject("暂不支持该股票代码")
  const marketId = tonghuashunMarketId(code)
  if (!marketId) return reject("暂不支持该股票代码")

  if (explicit.kind === "code") {
    const named = rowsByExactName(candidates, rawName)
    if (named.length > 0 && !named.includes(code)) {
      return reject("股票代码与名称不一致，未加入自选")
    }
  }

  const name = canonicalName(row, rawName)
  const resolvedRow: StockRow = { ...row, 股票代码: code, 股票简称: name }
  const draft = draftFromStock(resolvedRow, scene, today)
  const reason = watchReasonFromPick(pick.reason ?? "")
  if (reason) draft.reason = reason
  return {
    ok: true,
    code,
    name: draft.name,
    marketId,
    marketLabel: marketLabel(marketId),
    row: resolvedRow,
    draft,
  }
}

function reject(message: string): RejectedStockPickWatch {
  return { ok: false, message }
}

function indexCandidates(rows: StockRow[]): Map<string, StockRow> {
  const map = new Map<string, StockRow>()
  for (const row of rows) {
    const code = trimText(String(row["股票代码"] ?? ""))
    if (!/^\d{6}$/.test(code) || map.has(code)) continue
    map.set(code, { ...row, 股票代码: code })
  }
  return map
}

function rowsByExactName(candidates: Map<string, StockRow>, name: string): string[] {
  if (!name) return []
  const hits: string[] = []
  for (const [code, row] of candidates) {
    if (trimText(String(row["股票简称"] ?? "")) === name) hits.push(code)
  }
  return hits
}

type ExplicitCode =
  | { kind: "empty" }
  | { kind: "code"; code: string }
  | { kind: "mismatch" }
  | { kind: "text" }

function parseExplicitCode(raw: string): ExplicitCode {
  if (!raw) return { kind: "empty" }
  const compact = raw.replace(/[\s_\u3000]+/g, "")
  const match = /^(?:(sh|sz|bj))?(\d{6})(?:\.(sh|sz|bj))?$/i.exec(compact)
  if (!match) return { kind: "text" }
  const code = match[2]
  if (!marketTagMatches(code, match[1]) || !marketTagMatches(code, match[3])) {
    return { kind: "mismatch" }
  }
  return { kind: "code", code }
}

/** 只接受独立出现、且确实在候选池中的六位代码。前后不能再粘着数字或小数点。 */
function findKnownCodes(text: string, candidates: Map<string, StockRow>): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const source = text.toLowerCase()
  for (let index = 0; index < source.length; index += 1) {
    const tag = /^(sh|sz|bj)(?=[\s_]*\d)/.exec(source.slice(index))
    const tokenStart = tag ? index : index
    let digitStart = index
    if (tag) {
      digitStart = index + tag[0].length
      while (source[digitStart] === " " || source[digitStart] === "_") digitStart += 1
    }
    if (!/^\d{6}/.test(source.slice(digitStart, digitStart + 6))) continue
    const boundary = tokenStart > 0 ? source[tokenStart - 1] : ""
    if (boundary === "." || (boundary >= "0" && boundary <= "9")) continue
    const code = source.slice(digitStart, digitStart + 6)
    let end = digitStart + 6
    let suffix = ""
    const suffixMatch = /^\.(sh|sz|bj)(?![a-z0-9])/i.exec(source.slice(end))
    if (suffixMatch) {
      suffix = suffixMatch[1]
      end += suffixMatch[0].length
    }
    const after = source[end] ?? ""
    if (after === "." || (after >= "0" && after <= "9")) continue
    if (!candidates.has(code)) continue
    if (!marketTagMatches(code, tag?.[1]) || !marketTagMatches(code, suffix)) continue
    if (!seen.has(code)) {
      seen.add(code)
      found.push(code)
    }
    index = end - 1
  }
  return found
}

function marketTagMatches(code: string, tag: string | undefined): boolean {
  if (!tag) return true
  const market = tonghuashunMarketId(code)
  const normalized = tag.toLowerCase()
  if (normalized === "sh") return market === "17"
  if (normalized === "sz") return market === "33"
  if (normalized === "bj") return market === "151" || market === "145"
  return false
}

function canonicalName(row: StockRow, fallback: string): string {
  const fromRow = trimText(String(row["股票简称"] ?? ""))
  if (isAcceptableName(fromRow)) return fromRow
  if (isAcceptableName(fallback)) return fallback
  return fromRow
}

function isAcceptableName(name: string): boolean {
  if (!name || [...name].length > 32) return false
  return !/[\u0000-\u001f\u007f]/.test(name)
}

export function watchReasonFromPick(reason: string): string {
  const text = trimText(reason)
  if (!text || [...text].length > WATCH_REASON_MAX) return ""
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return ""
  return text
}

function trimText(value: string): string {
  return value.replace(/^[\s\u3000]+|[\s\u3000]+$/g, "")
}
