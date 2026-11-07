import { describe, expect, it } from "vitest"
import { createHolderCache, formatHolderHouseholds, presentHolder, type HolderCount } from "./holders"

function sample(overrides: Partial<HolderCount> = {}): HolderCount {
  return {
    status: "ok",
    code: "600000",
    name: "样例股份",
    holders: 12345,
    endDate: "2024-06-30",
    noticeDate: "2024-08-20",
    message: "最近一次披露，不是实时股东人数",
    ...overrides,
  }
}

describe("shareholder count presentation", () => {
  it("formats a positive household count and rejects zero or junk", () => {
    expect(formatHolderHouseholds(278364)).toBe("278,364 户")
    expect(formatHolderHouseholds(0)).toBeNull()
    expect(formatHolderHouseholds(-1)).toBeNull()
    expect(formatHolderHouseholds(1.5)).toBeNull()
    expect(formatHolderHouseholds(null)).toBeNull()
  })

  it("shows the period and notice dates instead of a live count", () => {
    const view = presentHolder(sample())
    expect(view).toMatchObject({
      kind: "ok",
      title: "股东人数",
      value: "12,345 户",
      endDate: "2024-06-30",
      noticeDate: "2024-08-20",
    })
    if (view.kind === "ok") expect(view.note).toContain("不是实时")
    expect(presentHolder(sample({ noticeDate: null }))).toMatchObject({ kind: "ok", noticeDate: "未提供" })
  })

  it("does not present a missing date or zero as a real disclosure", () => {
    expect(presentHolder(sample({ endDate: null })).kind).toBe("empty")
    expect(presentHolder(sample({ holders: 0, message: "暂无披露的股东人数" }))).toMatchObject({
      kind: "empty",
      value: "暂无披露",
    })
    expect(presentHolder({ kind: "error", message: "股东人数数据源暂时无法访问" })).toMatchObject({
      kind: "error",
      value: "暂不可用",
    })
  })
})

describe("shareholder count cache", () => {
  it("reuses a successful result and does not cache a source failure", async () => {
    let calls = 0
    const cache = createHolderCache(async (code) => {
      calls += 1
      if (calls === 1) throw new Error("股东人数数据源暂时无法访问")
      return sample({ code })
    })
    await expect(cache.load("600000")).rejects.toThrow("无法访问")
    expect(calls).toBe(1)
    await expect(cache.load("600000")).resolves.toMatchObject({ holders: 12345 })
    await expect(cache.load("600000")).resolves.toMatchObject({ holders: 12345 })
    expect(calls).toBe(2)
  })

  it("deduplicates concurrent requests and keeps an empty disclosure", async () => {
    let calls = 0
    const cache = createHolderCache(async (code) => {
      calls += 1
      await Promise.resolve()
      return sample({ status: "empty", code, holders: null, endDate: null, noticeDate: null, message: "暂无披露的股东人数" })
    })
    const [first, second] = await Promise.all([cache.load("000001"), cache.load("000001")])
    expect(first).toBe(second)
    expect(calls).toBe(1)
    await cache.load("300001")
    expect(calls).toBe(2)
  })

  it("fetches again after the cached code is cleared", async () => {
    let calls = 0
    const cache = createHolderCache(async () => {
      calls += 1
      return sample()
    })
    await cache.load("600000")
    cache.clear("600000")
    await cache.load("600000")
    expect(calls).toBe(2)
  })
})
