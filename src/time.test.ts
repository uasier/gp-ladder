import { describe, expect, it } from "vitest"
import { formatTimeAgo, parseTimestamp } from "./time"

const value = "2026-10-19 15:00:00"
const timestamp = new Date(2026, 9, 19, 15, 0, 0).getTime()

describe("formatTimeAgo", () => {
  it.each([
    [0, "刚刚"],
    [59, "刚刚"],
    [60, "1 分钟前"],
    [120, "2 分钟前"],
    [3599, "59 分钟前"],
    [3600, "1 小时前"],
    [86399, "23 小时前"],
    [86400, "1 天前"],
    [3 * 86400, "3 天前"],
  ])("formats %s elapsed seconds", (seconds, expected) => {
    expect(formatTimeAgo(value, timestamp + seconds * 1000)).toBe(expected)
  })

  it("does not show negative durations when the clock is behind", () => {
    expect(formatTimeAgo(value, timestamp - 60_000)).toBe("刚刚")
  })

  it("preserves missing and unrecognized timestamps without NaN", () => {
    expect(formatTimeAgo(null, timestamp)).toBe("尚未刷新")
    expect(formatTimeAgo(" ", timestamp)).toBe("尚未刷新")
    expect(formatTimeAgo("尚未刷新", timestamp)).toBe("尚未刷新")
    expect(formatTimeAgo("--", timestamp)).toBe("--")
  })
})

describe("parseTimestamp", () => {
  it("parses native snapshot timestamps in the local timezone", () => {
    expect(parseTimestamp(value)).toBe(timestamp)
    expect(parseTimestamp(" 2026-10-19 15:00:00 ")).toBe(timestamp)
    expect(parseTimestamp("2026-10-19T15:00:00")).toBe(timestamp)
  })

  it("honors explicit timezone offsets", () => {
    const utcNow = Date.UTC(2026, 9, 19, 7, 2, 0)
    expect(formatTimeAgo("2026-10-19T15:00:00+08:00", utcNow)).toBe("2 分钟前")
    expect(formatTimeAgo("2026-10-19T07:00:00Z", utcNow)).toBe("2 分钟前")
  })

  it("rejects missing and invalid values", () => {
    for (const value of [undefined, null, "", "--", "not-a-date"]) {
      expect(parseTimestamp(value)).toBeNull()
    }
  })
})
