import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { SHOWCASE_SHOTS, parseShowcaseIndex, showcaseOnFlags } from "./siteShowcase"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("parseShowcaseIndex", () => {
  it("keeps 0 as a real slide", () => {
    expect(parseShowcaseIndex("0")).toBe(0)
    expect(parseShowcaseIndex("3")).toBe(3)
    expect(parseShowcaseIndex("4")).toBeNull()
    expect(parseShowcaseIndex("1.5")).toBeNull()
    expect(parseShowcaseIndex(null)).toBeNull()
  })
})

describe("showcaseOnFlags", () => {
  it("turns on exactly one frame", () => {
    expect(showcaseOnFlags(2, 4)).toEqual([false, false, true, false])
  })
})

describe("product page markup", () => {
  it("keeps four frames in the DOM so switching does not rewrite img.src", () => {
    const html = readFileSync(join(root, "site/index.html"), "utf8")
    const js = readFileSync(join(root, "site/app.js"), "utf8")
    for (const shot of SHOWCASE_SHOTS) {
      expect(html).toContain(shot.src.replace("./", ""))
    }
    expect(html).toContain('id="showcase-tabs"')
    expect(html).toContain('data-frame="3"')
    expect(js).toContain('closest("[data-shot]")')
    expect(js).toContain("is-on")
  })
})
