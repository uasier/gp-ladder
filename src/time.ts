// Rust 快照使用本地时间 YYYY-MM-DD HH:mm:ss；转成标准格式以兼容 WebKit。
export function parseTimestamp(value: string | null | undefined): number | null {
  const text = value?.trim()
  if (!text) return null
  const timestamp = Date.parse(text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T"))
  return Number.isFinite(timestamp) ? timestamp : null
}

export function formatTimeAgo(value: string | null | undefined, now = Date.now()): string {
  const timestamp = parseTimestamp(value)
  if (timestamp === null) return value?.trim() || "尚未刷新"

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return "刚刚"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}
