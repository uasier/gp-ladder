import { describe, expect, it } from "vitest"
import { compareSemver, isNewerVersion, normalizeVersion } from "./version"

describe("normalizeVersion", () => {
  it("strips v prefix and pre-release suffix", () => {
    expect(normalizeVersion("v0.1.0")).toBe("0.1.0")
    expect(normalizeVersion("1.2.3-beta.1")).toBe("1.2.3")
  })
})

describe("compareSemver", () => {
  it("orders major.minor.patch", () => {
    expect(compareSemver("0.2.0", "0.1.0")).toBe(1)
    expect(compareSemver("0.1.0", "0.1.0")).toBe(0)
    expect(compareSemver("0.1.0", "v0.1.1")).toBe(-1)
  })
})

describe("isNewerVersion", () => {
  it("treats v-prefix as equal", () => {
    expect(isNewerVersion("v0.2.0", "0.1.9")).toBe(true)
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false)
  })
})
