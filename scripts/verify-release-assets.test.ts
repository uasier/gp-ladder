import { describe, expect, it } from "vitest"
// @ts-expect-error Release tooling uses native JavaScript.
import { verifyReleaseAssets } from "./verify-release-assets.mjs"

const tag = "v0.2.4"
function release() {
  return {
    tag_name: tag,
    assets: ["aarch64.dmg", "x64.dmg", "x64-setup.exe", "aarch64.apk", "aarch64.app.tar.gz", "x64.app.tar.gz"].map((suffix) => ({
      name: `gp-ladder_0.2.4_${suffix}`,
      state: "uploaded",
      size: 1024,
      digest: `sha256:${"a".repeat(64)}`,
    })),
  }
}

describe("release publication gate", () => {
  it("accepts a complete set of four platform installers and two updater archives", () => {
    expect(verifyReleaseAssets(release(), tag)).toHaveLength(6)
  })

  it("blocks publication while any required asset is missing", () => {
    for (let missing = 0; missing < 6; missing++) {
      const partial = release()
      partial.assets.splice(missing, 1)
      expect(() => verifyReleaseAssets(partial, tag)).toThrow("Missing or duplicate")
    }
  })

  it("does not substitute packages from another release", () => {
    const wrongVersion = release()
    wrongVersion.assets[0].name = "gp-ladder_0.2.3_aarch64.dmg"
    expect(() => verifyReleaseAssets(wrongVersion, tag)).toThrow("Missing or duplicate")
    expect(() => verifyReleaseAssets(release(), "v0.2.3")).toThrow("tag does not match")
  })

  it("rejects unfinished or empty uploads and missing digests", () => {
    for (const patch of [{ state: "starter" }, { size: 0 }, { digest: "" }, { digest: "sha256:invalid" }]) {
      const incomplete = release()
      Object.assign(incomplete.assets[0], patch)
      expect(() => verifyReleaseAssets(incomplete, tag)).toThrow()
    }
  })

  it("rejects duplicate assets", () => {
    const duplicate = release()
    duplicate.assets.push({ ...duplicate.assets[0] })
    expect(() => verifyReleaseAssets(duplicate, tag)).toThrow("Missing or duplicate")
  })
})
