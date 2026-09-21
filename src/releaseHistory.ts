import type { ReleaseInfo } from "./types"

/** GitHub 的 published_at 只取日历日，便于列表展示。 */
export function formatReleaseDate(iso: string): string {
  const match = iso.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? ""
}

/** 当前版本或最新版默认展开，方便对照更新说明。 */
export function shouldOpenRelease(item: Pick<ReleaseInfo, "current" | "latest">, index: number): boolean {
  return item.latest || item.current || index === 0
}
