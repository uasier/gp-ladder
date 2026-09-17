export type InlineSpan = { t: "text" | "strong"; v: string }

export type AnalysisBlock =
  | { type: "lead"; text: InlineSpan[] }
  | { type: "focus"; items: InlineSpan[][] }
  | { type: "plan"; items: InlineSpan[][] }
  | { type: "h"; text: string }
  | { type: "p"; text: InlineSpan[] }
  | { type: "item"; index?: string; title?: string; text: InlineSpan[] }
  | { type: "risk"; items: InlineSpan[][] }

const HEADING_RE = /^(?:#{1,3}\s+|[一二三四]、\s*)(.+)$/
const LIST_RE = /^[-*•]\s+(.+)$/
const INDEX_RE = /^(\d{1,2})[.、．)]\s+(.+)$/
const TITLE_RE = /^(.{2,18}?)[：:](.+)$/
const RISK_RE = /短线风险提示|综合风险|风险提示|需要警惕/
const LEAD_RE = /短线结论|核心结论|一句话结论|总体判断/
const FOCUS_RE = /操作要点|重点关注|关键要点|先看这/
const PLAN_RE = /操作计划|交易计划/

export function parseInline(raw: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    if (m.index > last) spans.push({ t: "text", v: raw.slice(last, m.index) })
    spans.push({ t: "strong", v: m[1] })
    last = m.index + m[0].length
  }
  if (last < raw.length) spans.push({ t: "text", v: raw.slice(last) })
  return spans.filter((s) => s.v.length > 0)
}

function headingText(line: string): string | null {
  const m = line.trim().match(HEADING_RE)
  if (!m) return null
  return m[1].replace(/^#+\s*/, "").trim()
}

function stripWrap(text: string): string {
  return text
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/```\s*$/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
}

function lastFocus(blocks: AnalysisBlock[]): Extract<AnalysisBlock, { type: "focus" }> {
  const existing = [...blocks].reverse().find((b) => b.type === "focus") as
    | Extract<AnalysisBlock, { type: "focus" }>
    | undefined
  if (existing) return existing
  const created: Extract<AnalysisBlock, { type: "focus" }> = { type: "focus", items: [] }
  blocks.push(created)
  return created
}

function lastRisk(blocks: AnalysisBlock[]): Extract<AnalysisBlock, { type: "risk" }> {
  const last = blocks[blocks.length - 1]
  if (last?.type === "risk") return last
  const created: Extract<AnalysisBlock, { type: "risk" }> = { type: "risk", items: [] }
  blocks.push(created)
  return created
}

function lastPlan(blocks: AnalysisBlock[]): Extract<AnalysisBlock, { type: "plan" }> {
  const last = blocks[blocks.length - 1]
  if (last?.type === "plan") return last
  const created: Extract<AnalysisBlock, { type: "plan" }> = { type: "plan", items: [] }
  blocks.push(created)
  return created
}

export function parseAnalysis(raw: string): AnalysisBlock[] {
  const text = stripWrap(raw)
  if (!text) return []
  const blocks: AnalysisBlock[] = []
  let mode: "body" | "focus" | "risk" | "lead" | "plan" = "body"
  let pending = ""

  const flushPending = () => {
    const joined = pending.trim()
    pending = ""
    if (!joined) return
    if (mode === "lead" || (blocks.length === 0 && LEAD_RE.test(joined))) {
      const body = joined.replace(/^(短线结论|核心结论|一句话结论|总体判断)[：:\s]*/u, "")
      blocks.push({ type: "lead", text: parseInline(body || joined) })
      mode = "body"
      return
    }
    if (mode === "risk") {
      lastRisk(blocks).items.push(parseInline(joined))
      return
    }
    if (mode === "plan") {
      lastPlan(blocks).items.push(parseInline(joined))
      return
    }
    if (mode === "focus") {
      lastFocus(blocks).items.push(parseInline(joined))
      return
    }
    blocks.push({ type: "p", text: parseInline(joined) })
  }

  for (const original of text.split("\n")) {
    const line = original.trim()
    if (!line) {
      flushPending()
      continue
    }

    const heading = headingText(line)
    if (heading) {
      flushPending()
      if (LEAD_RE.test(heading)) {
        mode = "lead"
        continue
      }
      if (FOCUS_RE.test(heading)) {
        mode = "focus"
        lastFocus(blocks)
        continue
      }
      if (PLAN_RE.test(heading)) {
        mode = "plan"
        lastPlan(blocks)
        continue
      }
      if (RISK_RE.test(heading)) {
        mode = "risk"
        continue
      }
      mode = "body"
      blocks.push({ type: "h", text: heading })
      continue
    }

    const leadInline = line.match(/^(短线结论|核心结论|一句话结论|总体判断)[：:]\s*(.+)$/u)
    if (leadInline && blocks.length === 0) {
      flushPending()
      blocks.push({ type: "lead", text: parseInline(leadInline[2].trim()) })
      mode = "body"
      continue
    }

    const list = line.match(LIST_RE)
    const indexed = line.match(INDEX_RE)
    if (list || indexed) {
      flushPending()
      const content = (list ? list[1] : indexed![2]).trim()
      if (mode === "focus") {
        lastFocus(blocks).items.push(parseInline(content))
        continue
      }
      if (mode === "plan") {
        lastPlan(blocks).items.push(parseInline(content))
        continue
      }
      if (mode === "risk") {
        lastRisk(blocks).items.push(parseInline(content))
        continue
      }
      const titled = content.match(TITLE_RE)
      blocks.push({
        type: "item",
        index: indexed ? indexed[1] : undefined,
        title: titled ? titled[1].trim() : undefined,
        text: parseInline(titled ? titled[2].trim() : content),
      })
      continue
    }

    pending = pending ? `${pending} ${line}` : line
  }
  flushPending()
  return blocks
}

export function inlineText(spans: InlineSpan[]): string {
  return spans.map((s) => s.v).join("")
}
