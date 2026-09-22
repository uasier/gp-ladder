export type ShowcaseShot = {
  src: string
  alt: string
  cap: string
  title: string
}

export const SHOWCASE_SHOTS: ShowcaseShot[] = [
  {
    src: "./screenshots/lxsz.jpg",
    alt: "连涨天梯界面：同花顺连涨榜叠加东方财富行情，按连涨天数分档",
    cap: "同花顺连涨榜叠加东方财富行情，按天数、行业、精选筛选。",
    title: "连涨天梯",
  },
  {
    src: "./screenshots/zt.jpg",
    alt: "涨停天梯界面：东方财富涨停池按连板高度分档",
    cap: "东方财富涨停池，按连板高度分档。",
    title: "涨停天梯",
  },
  {
    src: "./screenshots/jjzt.jpg",
    alt: "昨日涨停界面：昨天涨停、今日竞价后红盘且涨幅 2% 至 8%",
    cap: "昨天涨停，今日竞价后红盘且涨幅 2%–8%。",
    title: "昨日涨停",
  },
  {
    src: "./screenshots/analysis.jpg",
    alt: "DeepSeek 短线分析：个股动能、量价与 0 到 100 短线评分",
    cap: "按 1–5 个交易日视角看盘，并给出 0–100 短线评分。",
    title: "短线分析",
  },
]

/** 0 也是有效下标，不能用 `Number(x) || 0`。 */
export function parseShowcaseIndex(value: string | null, length = SHOWCASE_SHOTS.length): number | null {
  if (value == null || value === "") return null
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0 || index >= length) return null
  return index
}

export function showcaseOnFlags(index: number, length = SHOWCASE_SHOTS.length): boolean[] {
  return Array.from({ length }, (_, i) => i === index)
}
