import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  androidVersionCode,
  expectedReleaseCert,
  parseSignerSha256,
  parseVersionCode,
  verifyAndroidApk,
} from "./verify-android-apk.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("android release signing", () => {
  it("derives an increasing versionCode from semver", () => {
    expect(androidVersionCode("0.2.6")).toBe(2006)
    expect(androidVersionCode("v0.2.7")).toBe(2007)
    expect(androidVersionCode("1.0.0")).toBe(1_000_000)
    expect(androidVersionCode("0.2.7")).toBeGreaterThan(androidVersionCode("0.2.6"))
  })

  it("rejects a certificate that would force an uninstall", () => {
    const cert = "a".repeat(64)
    expect(() =>
      verifyAndroidApk({
        version: "0.2.7",
        cert,
        signerText: "Signer #1 certificate SHA-256 digest: " + "b".repeat(64),
        badging: "package: name='com.gp.ladder.app' versionCode='2007'",
      }),
    ).toThrow(/证书/)
  })

  it("accepts the pinned certificate and matching versionCode", () => {
    const cert = expectedReleaseCert()
    expect(cert).toMatch(/^[0-9a-f]{64}$/)
    expect(
      verifyAndroidApk({
        version: "0.2.7",
        cert,
        signerText: `Signer #1 certificate SHA-256 digest: ${cert}`,
        badging: "package: name='com.gp.ladder.app' versionCode='2007' versionName='0.2.7'",
      }),
    ).toEqual({ cert, versionCode: 2007 })
    expect(parseSignerSha256(`SHA-256 digest: ${cert.toUpperCase()}`)).toBe(cert)
    expect(parseVersionCode("versionCode='2007'")).toBe(2007)
  })

  it("keeps release builds on the stable keystore", () => {
    const gradle = readFileSync(join(root, "src-tauri/gen/android/app/build.gradle.kts"), "utf8")
    const workflow = readFileSync(join(root, ".github/workflows/build.yml"), "utf8")
    expect(gradle).toContain("gp-ladder-release.keystore")
    expect(gradle).toContain("ANDROID_KEYSTORE_PATH")
    expect(gradle).not.toContain("debug.keystore")
    expect(workflow).toContain("ANDROID_KEYSTORE_BASE64")
    expect(workflow).toContain("scripts/verify-android-apk.mjs")
    expect(workflow).not.toContain("keytool -genkeypair")
    expect(workflow).not.toContain("debug.keystore")
  })
})
