import { describe, expect, it } from "vitest"
import { detectTauri, parseApiError } from "./api"

describe("detectTauri", () => {
  it("is false without window internals", () => {
    expect(detectTauri({})).toBe(false)
    expect(detectTauri({ window: {} })).toBe(false)
  })

  it("is true when Tauri internals exist", () => {
    expect(detectTauri({ window: { __TAURI_INTERNALS__: {} } })).toBe(true)
    expect(detectTauri({ window: { isTauri: true } })).toBe(true)
  })
})

describe("parseApiError", () => {
  it("reads JSON error field", () => {
    expect(parseApiError(400, '{"error":"未找到 gp 仓库根目录"}')).toBe("未找到 gp 仓库根目录")
  })

  it("falls back to raw text", () => {
    expect(parseApiError(500, "boom")).toBe("boom")
  })

  it("falls back to HTTP status when empty", () => {
    expect(parseApiError(502, "  ")).toBe("HTTP 502")
  })
})
