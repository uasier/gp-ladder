import { describe, expect, it } from "vitest"
import {
  allowLocalPackage,
  isCiEnv,
  isPackageBuildArgv,
  localBuildHint,
  shouldBlockLocalPackage,
} from "./tauri-cli.mjs"

describe("isPackageBuildArgv", () => {
  it("treats desktop and android package builds as packaging", () => {
    expect(isPackageBuildArgv(["build"])).toBe(true)
    expect(isPackageBuildArgv(["build", "--bundles", "app,dmg"])).toBe(true)
    expect(isPackageBuildArgv(["android", "build", "--apk"])).toBe(true)
  })

  it("leaves dev / init / info on the local CLI", () => {
    expect(isPackageBuildArgv(["dev"])).toBe(false)
    expect(isPackageBuildArgv(["android", "dev"])).toBe(false)
    expect(isPackageBuildArgv(["android", "init", "--ci"])).toBe(false)
    expect(isPackageBuildArgv(["info"])).toBe(false)
    expect(isPackageBuildArgv([])).toBe(false)
  })
})

describe("shouldBlockLocalPackage", () => {
  it("blocks local packaging by default", () => {
    expect(shouldBlockLocalPackage(["build"], {})).toBe(true)
    expect(shouldBlockLocalPackage(["android", "build"], {})).toBe(true)
  })

  it("allows packaging in CI and with GP_LOCAL_BUILD", () => {
    expect(shouldBlockLocalPackage(["build"], { GITHUB_ACTIONS: "true" })).toBe(false)
    expect(shouldBlockLocalPackage(["build"], { CI: "true" })).toBe(false)
    expect(shouldBlockLocalPackage(["build"], { GP_LOCAL_BUILD: "1" })).toBe(false)
  })

  it("never blocks non-package commands", () => {
    expect(shouldBlockLocalPackage(["dev"], {})).toBe(false)
  })
})

describe("env helpers", () => {
  it("reads CI and escape-hatch flags", () => {
    expect(isCiEnv({})).toBe(false)
    expect(isCiEnv({ GITHUB_ACTIONS: "true" })).toBe(true)
    expect(allowLocalPackage({})).toBe(false)
    expect(allowLocalPackage({ GP_LOCAL_BUILD: "1" })).toBe(true)
  })
})

describe("localBuildHint", () => {
  it("points at GitHub build and the escape hatch", () => {
    const text = localBuildHint(["build", "--bundles", "dmg"])
    expect(text).toMatch(/build:github/)
    expect(text).toMatch(/GP_LOCAL_BUILD=1/)
    expect(text).toMatch(/src-tauri\/target/)
  })
})
