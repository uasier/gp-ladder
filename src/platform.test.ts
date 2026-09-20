import { describe, expect, it } from "vitest"
import {
  applyMobileClass,
  isAndroidUserAgent,
  isMobileApp,
  isMobileUserAgent,
  isNarrowViewport,
  isPhoneUi,
} from "./platform"

describe("platform", () => {
  it("detects mobile user agents", () => {
    expect(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(true)
    expect(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(true)
    expect(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true)
    expect(isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false)
    expect(isAndroidUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(false)
  })

  it("treats narrow viewport as phone UI", () => {
    expect(isNarrowViewport(390)).toBe(true)
    expect(isNarrowViewport(721)).toBe(false)
    expect(isPhoneUi("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 390)).toBe(true)
    expect(isPhoneUi("Mozilla/5.0 (Linux; Android 14)", 900)).toBe(true)
    expect(isPhoneUi("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 1280)).toBe(false)
  })

  it("only treats Tauri + mobile UA as in-app mobile", () => {
    expect(isMobileApp(true, "Mozilla/5.0 (Linux; Android 14)")).toBe(true)
    expect(isMobileApp(false, "Mozilla/5.0 (Linux; Android 14)")).toBe(false)
    expect(isMobileApp(true, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false)
  })

  it("toggles is-mobile class", () => {
    const classes = new Set<string>()
    const root = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) classes.add(name)
          else classes.delete(name)
          return force ?? false
        },
      },
    }
    expect(applyMobileClass(root, "Android", 400)).toBe(true)
    expect(classes.has("is-mobile")).toBe(true)
    expect(applyMobileClass(root, "Macintosh", 1280)).toBe(false)
    expect(classes.has("is-mobile")).toBe(false)
  })
})
