import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  DESCRIPTION,
  FAQ_ITEMS,
  GITHUB_DESCRIPTION,
  GITHUB_TOPICS,
  KEYWORDS,
  OG_IMAGE_URL,
  RELEASES_URL,
  SITE_NAME,
  SITE_URL,
  TITLE,
  applyDocumentSeo,
  documentDescription,
  documentTitle,
  faqJsonLd,
  robotsTxt,
  sitemapXml,
  softwareJsonLd,
} from "./seo"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

describe("documentTitle", () => {
  it("names each board for the browser tab", () => {
    expect(documentTitle("lxsz")).toContain("连涨天梯")
    expect(documentTitle("zt")).toContain("涨停天梯")
    expect(documentTitle("jjzt")).toContain("昨日涨停")
  })
})

describe("applyDocumentSeo", () => {
  it("writes title and description onto a document stub", () => {
    const attrs: Record<string, string> = {}
    const doc = {
      title: "",
      querySelector: (selector: string) => {
        if (selector !== 'meta[name="description"]') return null
        return {
          setAttribute: (name: string, value: string) => {
            attrs[name] = value
          },
        }
      },
    }
    applyDocumentSeo("zt", doc)
    expect(doc.title).toBe(documentTitle("zt"))
    expect(attrs.content).toBe(documentDescription("zt"))
  })
})

describe("structured data", () => {
  it("describes the app as free finance software", () => {
    const data = softwareJsonLd()
    expect(data["@type"]).toBe("SoftwareApplication")
    expect(data.name).toBe(SITE_NAME)
    expect(data.url).toBe(`${SITE_URL}/`)
    expect(data.downloadUrl).toBe(RELEASES_URL)
    expect(data.offers.price).toBe("0")
    expect(data.description).toBe(DESCRIPTION)
  })

  it("keeps FAQ answers aligned with the landing copy", () => {
    const data = faqJsonLd()
    expect(data.mainEntity).toHaveLength(FAQ_ITEMS.length)
    expect(FAQ_ITEMS.some((item) => item.question.includes("买入卖出"))).toBe(true)
    expect(data.mainEntity.map((item) => item.name)).toEqual(FAQ_ITEMS.map((item) => item.question))
  })
})

describe("crawl files", () => {
  it("keeps robots and sitemap in sync with SITE_URL", () => {
    expect(read("public/robots.txt")).toBe(robotsTxt())
    expect(read("public/sitemap.xml").trim()).toBe(sitemapXml().trim())
    expect(read("public/sitemap.xml")).toContain(`${SITE_URL}/`)
  })

  it("ships a 1200x630 Open Graph image", () => {
    const png = readFileSync(join(root, "public/og.png"))
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(png.byteLength).toBeGreaterThan(20_000)
  })

  it("ships a GitHub social preview image", () => {
    const png = readFileSync(join(root, "docs/github-social.png"))
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(png.byteLength).toBeGreaterThan(20_000)
  })

  it("ships a web manifest with the product name", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
      name: string
      lang: string
      theme_color: string
    }
    expect(manifest.name).toBe(SITE_NAME)
    expect(manifest.lang).toBe("zh-CN")
    expect(manifest.theme_color).toBe("#0b0f17")
  })
})

describe("index.html", () => {
  const html = read("index.html")

  it("has crawlable identity tags", () => {
    expect(html).toContain(`<html lang="zh-CN"`)
    expect(html).toContain(`<title>${TITLE}</title>`)
    expect(html).toContain(`content="${DESCRIPTION}"`)
    expect(html).toContain(`content="${KEYWORDS}"`)
    expect(html).toContain(`href="${SITE_URL}/"`)
    expect(html).toContain(`content="${OG_IMAGE_URL}"`)
    expect(html).toContain('property="og:type"')
    expect(html).toContain('name="twitter:card"')
    expect(html).toContain("application/ld+json")
    expect(html).toContain("SoftwareApplication")
  })

  it("keeps a noscript outline for crawlers without JS", () => {
    expect(html).toContain("<noscript>")
    expect(html).toContain("<h1>连涨天梯</h1>")
    expect(html).toContain(RELEASES_URL)
  })
})

describe("product landing", () => {
  const html = read("site/index.html")

  it("is a static page with the three boards and FAQ", () => {
    expect(html).toContain(`<title>${TITLE}</title>`)
    expect(html).toContain(`<h1>连涨天梯</h1>`)
    expect(html).toContain("三个榜单")
    expect(html).toContain("更新历史")
    expect(html).toContain("api.github.com/repos/uasier/gp-ladder/releases")
    expect(html).toContain("涨停天梯")
    expect(html).toContain("昨日涨停")
    expect(html).toContain("screenshots/lxsz.jpg")
    expect(html).toContain("alt=")
    expect(html).toContain("FAQPage")
    for (const item of FAQ_ITEMS) {
      expect(html).toContain(item.question)
      expect(html).toContain(item.answer)
    }
  })

  it("deploys via GitHub Pages from site/", () => {
    const yml = read(".github/workflows/pages.yml")
    expect(yml).toContain("actions/deploy-pages@v4")
    expect(yml).toContain("cp -R site/. _site/")
    expect(yml).toContain("docs/screenshots")
  })
})

describe("exported HTML", () => {
  it("does not ask search engines to index local snapshots", () => {
    const html = read("src-tauri/templates/ladder.html")
    expect(html).toContain('name="robots" content="noindex,nofollow"')
  })
})

describe("GitHub About", () => {
  it("keeps the repository description short and keyword-first", () => {
    expect(GITHUB_DESCRIPTION.length).toBeGreaterThan(40)
    expect(GITHUB_DESCRIPTION.length).toBeLessThanOrEqual(350)
    expect(GITHUB_DESCRIPTION.startsWith("连涨天梯 (gp-ladder)")).toBe(true)
    expect(GITHUB_DESCRIPTION).toContain("同花顺连涨榜")
    expect(GITHUB_DESCRIPTION).toContain("涨停天梯")
    expect(GITHUB_DESCRIPTION).toContain("昨日涨停")
  })

  it("fills GitHub topics for A-share and stack discovery", () => {
    expect(GITHUB_TOPICS).toHaveLength(20)
    expect(new Set(GITHUB_TOPICS).size).toBe(20)
    for (const topic of ["a-share", "tauri", "rust", "android", "stock-market"]) {
      expect(GITHUB_TOPICS).toContain(topic)
    }
  })
})

describe("README", () => {
  it("leads with searchable names and the product URL", () => {
    const readme = read("README.md")
    expect(readme.startsWith("# 连涨天梯（gp-ladder）")).toBe(true)
    expect(readme).toContain("连涨榜 / 涨停天梯 / 昨日涨停")
    expect(readme).toContain("Tonghuashun")
    expect(readme).toContain("East Money")
    expect(readme).toContain(SITE_URL)
    expect(readme).toContain(RELEASES_URL)
  })
})
