import { describe, expect, it } from "vitest"
import { copyFeedback, formatDiagReport, formatDiagUnavailable, type DiagView } from "./netdiag"

const view: DiagView = {
  version: "0.2.10",
  os: "android",
  arch: "aarch64",
  runtime: "tauri",
  limits: "不能据此判断运营商、VPN 或正在使用的 DNS 服务器。",
  events: [
    {
      at: "2026-11-16T14:00:00+08:00",
      operation: "自选行情",
      summary: "行情请求多次尝试后仍未完成。可查看诊断。",
      elapsedMs: 12000,
      attempts: [
        {
          host: "push2delay.eastmoney.com",
          path: "/api/qt/ulist.np/get",
          proxy: "环境代理",
          stage: "发送",
          kind: "未知",
          status: null,
          elapsedMs: 6000,
          chain: [
            "error sending request for url (https://user:pw@push2delay.eastmoney.com/api/qt/ulist.np/get?secids=1.600519&token=abc)",
          ],
        },
        {
          host: "push2.eastmoney.com",
          path: "/api/qt/ulist.np/get",
          proxy: "直连",
          stage: "响应",
          kind: "HTTP",
          status: 502,
          elapsedMs: 6000,
          chain: ["HTTP 502"],
        },
      ],
    },
  ],
}

describe("formatDiagReport", () => {
  it("keeps both attempts, version and runtime, and scrubs secrets", () => {
    const text = formatDiagReport(view)
    expect(text).toContain("应用版本: 0.2.10")
    expect(text).toContain("系统: android")
    expect(text).toContain("架构: aarch64")
    expect(text).toContain("运行方式: tauri")
    expect(text).toContain("2026-11-16T14:00:00+08:00")
    expect(text).toContain("push2delay.eastmoney.com/api/qt/ulist.np/get")
    expect(text).toContain("push2.eastmoney.com/api/qt/ulist.np/get")
    expect(text).toContain("环境代理")
    expect(text).toContain("直连")
    expect(text).toContain("未知")
    expect(text).toContain("HTTP 502")
    expect(text).toContain("刷新行情")
    expect(text).not.toContain("user:pw")
    expect(text).not.toContain("secids")
    expect(text).not.toContain("600519")
    expect(text).not.toContain("token=abc")
    expect(text).not.toContain("Authorization")
  })

  it("says there is no record instead of inventing a cause", () => {
    const text = formatDiagReport({ ...view, events: [] })
    expect(text).toContain("暂无网络失败记录")
    expect(text).not.toContain("域名解析失败")
    expect(text).not.toContain("TLS 校验未通过")
    expect(text).not.toContain("push2.eastmoney.com")
  })

  it("does not invent a report when diagnostics are missing", () => {
    const text = formatDiagReport(null)
    expect(text).toContain("暂无网络失败记录")
    expect(text).not.toContain("0.2.10")
  })

  it("reports a read failure without calling it the quote cause", () => {
    const text = formatDiagUnavailable("命令不存在")
    expect(text).toContain("诊断记录暂时读不出来")
    expect(text).toContain("命令不存在")
    expect(text).toContain("没有编造记录")
  })
})

describe("copyFeedback", () => {
  it("distinguishes success and failure", () => {
    expect(copyFeedback(true)).toContain("已复制")
    expect(copyFeedback(false)).toContain("复制失败")
    expect(copyFeedback(false)).toContain("手动复制")
  })
})
