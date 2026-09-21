import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { formatReleaseDate, shouldOpenRelease } from "./releaseHistory"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("formatReleaseDate", () => {
  it("keeps the calendar day from GitHub timestamps", () => {
    expect(formatReleaseDate("2026-09-20T14:32:46Z")).toBe("2026-09-20")
    expect(formatReleaseDate(" 2026-09-18T06:40:15Z ")).toBe("2026-09-18")
  })

  it("returns empty when the stamp is missing", () => {
    expect(formatReleaseDate("")).toBe("")
    expect(formatReleaseDate("not-a-date")).toBe("")
  })
})

describe("shouldOpenRelease", () => {
  it("opens the latest or currently installed entry", () => {
    expect(shouldOpenRelease({ current: true, latest: true }, 0)).toBe(true)
    expect(shouldOpenRelease({ current: false, latest: true }, 0)).toBe(true)
    expect(shouldOpenRelease({ current: true, latest: false }, 1)).toBe(true)
    expect(shouldOpenRelease({ current: false, latest: false }, 0)).toBe(true)
    expect(shouldOpenRelease({ current: false, latest: false }, 2)).toBe(false)
  })
})

describe("about pane", () => {
  it("loads GitHub release history into 设置 → 关于", () => {
    const src = readFileSync(join(root, "src/components/SettingsModal.tsx"), "utf8")
    expect(src).toContain("更新历史")
    expect(src).toContain("listReleaseHistory")
    const api = readFileSync(join(root, "src/api.ts"), "utf8")
    expect(api).toContain("/api/update/history")
    expect(api).toContain("list_releases")
  })
})
