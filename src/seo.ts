import type { BoardKind } from "./types"

/** 对外产品页（GitHub Pages），搜索引擎与社交分享以此为准。 */
export const SITE_URL = "https://uasier.github.io/gp-ladder"

export const REPO_URL = "https://github.com/uasier/gp-ladder"

export const RELEASES_URL = `${REPO_URL}/releases`

/**
 * GitHub About 简介：出现在仓库页、GitHub 搜索，以及 Google 对 github.com 的摘要。
 * 上限 350 字符；中文名打头，附带 gp-ladder，避免和同名 LadderGP 科研仓库撞车。
 */
export const GITHUB_DESCRIPTION =
  "连涨天梯 (gp-ladder)：同花顺连涨榜、东方财富涨停天梯与昨日涨停。Open-source A-share app for macOS / Windows / Android."

/** GitHub Topics，最多 20 个；英文精确匹配 github.com/topics/* 聚合页。 */
export const GITHUB_TOPICS = [
  "a-share",
  "a-shares",
  "china-stock",
  "china-stocks",
  "china-stock-market",
  "stock-market",
  "stock-analysis",
  "finance",
  "trading",
  "tauri",
  "tauri-v2",
  "rust",
  "react",
  "typescript",
  "vite",
  "android",
  "macos",
  "windows",
  "desktop-app",
  "deepseek",
] as const

export const SITE_NAME = "连涨天梯"

/** 首页 title：约 25–30 个汉字，覆盖三个榜单名称。 */
export const TITLE = "连涨天梯 - A股连涨榜、涨停天梯与昨日涨停工作台"

/** 首页 description：约 80–120 字，给百度/Google 摘要用。 */
export const DESCRIPTION =
  "连涨天梯是开源的 A 股桌面与 Android 工作台：抓取同花顺连涨榜、东方财富涨停天梯和昨日涨停，叠加现价、涨跌幅、换手、成交额与散户资金，支持筛选、精选、导出和 DeepSeek 短线分析。"

export const KEYWORDS = [
  "连涨天梯",
  "涨停天梯",
  "昨日涨停",
  "连涨榜",
  "涨停池",
  "连板",
  "同花顺",
  "东方财富",
  "A股",
  "短线",
  "竞价",
  "gp-ladder",
].join(",")

export const OG_IMAGE_ALT = "连涨天梯：A股连涨榜、涨停天梯与昨日涨停工作台"

export const OG_IMAGE_URL = `${SITE_URL}/og.png`

const BOARD_TITLE: Record<BoardKind, string> = {
  lxsz: "连涨天梯 · 同花顺连涨榜",
  zt: "涨停天梯 · 东方财富涨停池",
  jjzt: "昨日涨停 · 竞价红盘 2%–8%",
}

const BOARD_DESCRIPTION: Record<BoardKind, string> = {
  lxsz: "查看同花顺连续上涨榜，叠加东方财富现价、涨跌幅、换手、成交额与散户资金，按天数和行业筛选。",
  zt: "查看东方财富涨停池连板梯队，按连板高度分档，叠加当日行情与筛选。",
  jjzt: "查看昨天涨停、今日竞价后红盘且涨幅 2%–8% 的标的，跟踪回封与竞价强度。",
}

type MetaNode = { setAttribute: (name: string, value: string) => void }

export type DocumentLike = {
  title: string
  querySelector: (selector: string) => MetaNode | null
}

export function documentTitle(board: BoardKind): string {
  return BOARD_TITLE[board]
}

export function documentDescription(board: BoardKind): string {
  return BOARD_DESCRIPTION[board]
}

/** 切换榜单时同步浏览器标题与 description，便于分享与历史记录。 */
export function applyDocumentSeo(board: BoardKind, doc?: DocumentLike | null): void {
  const target = doc ?? (typeof document === "undefined" ? null : document)
  if (!target) return
  target.title = documentTitle(board)
  target.querySelector('meta[name="description"]')?.setAttribute(
    "content",
    documentDescription(board),
  )
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: ["gp-ladder", "涨停天梯", "昨日涨停"],
    applicationCategory: "FinanceApplication",
    operatingSystem: "macOS, Windows, Android",
    inLanguage: "zh-CN",
    description: DESCRIPTION,
    url: `${SITE_URL}/`,
    downloadUrl: RELEASES_URL,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
    },
    author: {
      "@type": "Person",
      name: "uasier",
      url: "https://github.com/uasier",
    },
    screenshot: [
      `${REPO_URL}/raw/main/docs/screenshots/lxsz.jpg`,
      `${REPO_URL}/raw/main/docs/screenshots/zt.jpg`,
      `${REPO_URL}/raw/main/docs/screenshots/jjzt.jpg`,
      `${REPO_URL}/raw/main/docs/screenshots/analysis.jpg`,
    ],
  }
}

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "连涨天梯是什么软件？",
    answer:
      "连涨天梯是开源的 A 股行情浏览工作台，可在 macOS、Windows 和 Android 上使用。它从同花顺抓取连续上涨榜，从东方财富读取涨停池、昨日涨停和当日行情，在本地筛选、精选并导出，不构成投资建议。",
  },
  {
    question: "连涨榜、涨停天梯和昨日涨停分别看什么？",
    answer:
      "连涨榜来自同花顺连续上涨排名；涨停天梯来自东方财富涨停池，按连板高度分档；昨日涨停看昨天涨停、今日竞价后仍红盘且涨幅在 2% 到 8% 的标的。",
  },
  {
    question: "数据从哪里来？需要一直联网吗？",
    answer:
      "连涨榜来自同花顺，涨停与行情来自东方财富。打开软件只读本地快照；点击「刷新实时数据」才会联网。页面结构若变更，解析可能失败。",
  },
  {
    question: "如何下载连涨天梯？",
    answer:
      "到 GitHub Releases 下载 macOS dmg、Windows 安装包或 Android APK。应用内设置 → 关于也可检查更新并下载当前系统对应的安装包。",
  },
  {
    question: "连涨天梯会给出买入卖出建议吗？",
    answer:
      "不会。榜单、筛选、精选标记、评分和模型生成的文字只供学习交流，不能替代独立研究或持牌投资顾问意见。",
  },
]

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
}

export function sitemapXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
}
