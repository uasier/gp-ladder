import { afterEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { pickStocks } from "./api"
import type { StockPickRequest } from "./types"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const request: StockPickRequest = {
  scene: "zt",
  rows: [{ 股票代码: "000001", 股票简称: "测试候选", 量比: "1.25" }],
  quoteAt: "2026-10-19 14:30:00",
  updatedAt: "2026-10-19 14:31:00",
}

describe("AI stock-pick transport", () => {
  it("sends the captured filtered rows and quote context to the web endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ picks: [], candidateCount: 1 })))
    vi.stubGlobal("window", {})
    vi.stubGlobal("fetch", fetchMock)
    await pickStocks(request)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/stocks/pick")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual(request)
  })

  it("uses the same request through Tauri on desktop and Android", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} })
    vi.mocked(invoke).mockResolvedValue({ picks: [], candidateCount: 1 })
    await pickStocks(request)
    expect(invoke).toHaveBeenCalledWith("pick_stocks", { request })
  })

  it("preserves actionable validation errors from the backend", async () => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "DeepSeek 推荐了筛选列表外的股票，结果已拒绝，请重试" }), { status: 400 })))
    await expect(pickStocks(request)).rejects.toThrow("筛选列表外")
  })
})
