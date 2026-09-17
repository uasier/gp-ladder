import { describe, expect, it } from "vitest"
import { inlineText, parseAnalysis, parseInline } from "./analysisView"

describe("parseInline", () => {
  it("splits bold markers", () => {
    const spans = parseInline("营收 **12.3亿**，净利率下滑")
    expect(spans).toEqual([
      { t: "text", v: "营收 " },
      { t: "strong", v: "12.3亿" },
      { t: "text", v: "，净利率下滑" },
    ])
  })
})

describe("parseAnalysis", () => {
  it("reads lead, focus, sections, items and risk", () => {
    const blocks = parseAnalysis(`## 短线结论
连涨过快，更像追高，小心回吐。

## 操作要点
- 不追今天的加速板
- 回踩 5 日线再看
- 板块走弱立刻走

## 一、盘面与动能
1. 连涨节奏：已连涨 **5** 天，今日加速
2. 量能换手：换手 **18%**，有天量迹象

## 操作计划
- 买点：回踩 **12.30**
- 止损：**11.80**

## 短线风险提示
- 高位放量
- 散户接盘
`)
    expect(blocks[0]).toMatchObject({ type: "lead" })
    expect(inlineText(blocks[0].type === "lead" ? blocks[0].text : [])).toContain("追高")
    const focus = blocks.find((b) => b.type === "focus")
    expect(focus?.type === "focus" ? focus.items.length : 0).toBe(3)
    expect(blocks.some((b) => b.type === "h" && b.text.includes("盘面"))).toBe(true)
    const items = blocks.filter((b) => b.type === "item")
    expect(items).toHaveLength(2)
    expect(items[0].type === "item" ? items[0].title : "").toBe("连涨节奏")
    const plan = blocks.find((b) => b.type === "plan")
    expect(plan?.type === "plan" ? plan.items.length : 0).toBe(2)
    const risk = blocks.find((b) => b.type === "risk")
    expect(risk?.type === "risk" ? risk.items.length : 0).toBe(2)
  })

  it("treats Chinese numbered headings as sections", () => {
    const blocks = parseAnalysis("一、市场博弈与筹码\n- 未见大股东减持公告（巨潮）")
    expect(blocks[0]).toEqual({ type: "h", text: "市场博弈与筹码" })
    expect(blocks[1].type).toBe("item")
  })
})
