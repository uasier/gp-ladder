export type DiagAttempt = {
  host: string
  path: string
  proxy: string
  stage: string
  kind: string
  status: number | null
  elapsedMs: number
  chain: string[]
}

export type DiagEvent = {
  at: string
  operation: string
  summary: string
  elapsedMs: number
  attempts: DiagAttempt[]
}

export type DiagView = {
  version: string
  os: string
  arch: string
  runtime: string
  events: DiagEvent[]
  limits: string
}

export const DIAG_HELP = [
  "先点「刷新行情」复现失败，再点「复制诊断」，把全文发给维护者。",
  "可以切换 Wi-Fi 或移动网络后再刷新，自己对比两份报告。应用看不到运营商、VPN 或正在使用的 DNS 服务器。",
  "请不要关闭 TLS 证书校验，也不要改成明文 HTTP。",
  "诊断只留在本机内存。点复制之前不会上传、发消息或提交 issue。",
].join("\n")

const EMPTY_RECORD = "暂无网络失败记录。请先点「刷新行情」复现一次后再复制。没有记录时不会编造原因。"

export function scrub(text: string): string {
  return text
    .replace(/file:\/\/\S+/gi, "[路径已省略]")
    .replace(/(?:\/home\/|\/Users\/|\/root\/|C:\\Users\\|C:\/Users\/)\S+/g, "[路径已省略]")
    .replace(/https?:\/\/[^\s)'"<>]+/gi, (url) => safeUrl(url))
    .replace(/\b(authorization|cookie|api[_-]?key|apikey|token|password|passwd|secret)\b\s*[:=]\s*\S+/gi, "$1=[已省略]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [已省略]")
    .replace(/\b(?:(?:10|127)(?:\.\d{1,3}){3}|(?:192\.168|169\.254)(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})\b/g, "[本机地址已省略]")
}

function safeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return "[url]"
  }
}

export function formatDiagReport(view: DiagView | null): string {
  if (!view) {
    return ["连涨天梯网络诊断", EMPTY_RECORD, "", DIAG_HELP].join("\n")
  }
  const lines = [
    "连涨天梯网络诊断",
    `应用版本: ${view.version || "未知"}`,
    `系统: ${view.os || "未知"}`,
    `架构: ${view.arch || "未知"}`,
    `运行方式: ${view.runtime || "未知"}`,
    "",
    scrub(view.limits || ""),
    "",
  ]
  if (view.events.length === 0) {
    lines.push(EMPTY_RECORD)
  } else {
    lines.push(`最近失败 ${view.events.length} 条（只留本机最近若干条）:`)
    view.events.forEach((event, index) => {
      lines.push("")
      lines.push(`${index + 1}. ${event.at} ${scrub(event.operation)} 合计 ${event.elapsedMs}ms`)
      lines.push(`   ${scrub(event.summary)}`)
      event.attempts.forEach((attempt, attemptIndex) => {
        const status = attempt.status == null ? "" : ` HTTP ${attempt.status}`
        lines.push(
          `   ${attemptIndex + 1}) ${scrub(attempt.host)}${scrub(attempt.path)} ${scrub(attempt.proxy)} ${scrub(attempt.stage)}/${scrub(attempt.kind)}${status} ${attempt.elapsedMs}ms`,
        )
        for (const line of attempt.chain) {
          lines.push(`      ${scrub(line)}`)
        }
      })
    })
  }
  lines.push("")
  lines.push(DIAG_HELP)
  return lines.join("\n")
}

export function formatDiagUnavailable(message: string): string {
  return [
    "连涨天梯网络诊断",
    `诊断记录暂时读不出来：${scrub(message)}`,
    "这不是行情失败的原因，也没有编造记录。",
    "",
    DIAG_HELP,
  ].join("\n")
}

export function copyFeedback(ok: boolean): string {
  return ok ? "已复制诊断，可粘贴发给维护者。" : "复制失败，请长按下方文本手动复制。"
}
