import { homedir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  PROJECT_CLEAN_RELATIVE_PATHS,
  assertSafeToRemove,
  extraRustTargets,
  formatBytes,
  parseCleanArgs,
  toolchainCleanPaths,
} from "./clean-local-build.mjs"

describe("parseCleanArgs", () => {
  it("defaults to project-only cleanup", () => {
    expect(parseCleanArgs([])).toEqual({ toolchains: false, dryRun: false, help: false })
  })

  it("accepts toolchains and dry-run", () => {
    expect(parseCleanArgs(["--toolchains", "--dry-run"])).toEqual({
      toolchains: true,
      dryRun: true,
      help: false,
    })
  })

  it("rejects unknown flags", () => {
    expect(() => parseCleanArgs(["--force"])).toThrow(/未知参数/)
  })
})

describe("PROJECT_CLEAN_RELATIVE_PATHS", () => {
  it("covers rust target and android build dirs, never absolute", () => {
    expect(PROJECT_CLEAN_RELATIVE_PATHS).toContain("src-tauri/target")
    expect(PROJECT_CLEAN_RELATIVE_PATHS).toContain("src-tauri/gen/android/app/build")
    expect(PROJECT_CLEAN_RELATIVE_PATHS).toContain("src-tauri/gen/android/buildSrc/.gradle")
    expect(PROJECT_CLEAN_RELATIVE_PATHS).toContain("dist-android")
    expect(PROJECT_CLEAN_RELATIVE_PATHS).toContain("release")
    for (const rel of PROJECT_CLEAN_RELATIVE_PATHS) {
      expect(rel.startsWith("/")).toBe(false)
      expect(rel.includes("..")).toBe(false)
    }
  })
})

describe("assertSafeToRemove", () => {
  const home = "/Users/demo"
  const repo = "/Users/demo/project"

  it("allows repo target and android sdk cache", () => {
    expect(assertSafeToRemove(join(repo, "src-tauri/target"), home, repo)).toBe(
      join(repo, "src-tauri/target"),
    )
    expect(assertSafeToRemove(join(home, "Library/Android"), home, repo)).toBe(
      join(home, "Library/Android"),
    )
    expect(assertSafeToRemove(join(home, ".gradle"), home, repo)).toBe(join(home, ".gradle"))
  })

  it("refuses home, repo root and filesystem root", () => {
    expect(() => assertSafeToRemove("/", home, repo)).toThrow(/危险路径/)
    expect(() => assertSafeToRemove(home, home, repo)).toThrow(/危险路径/)
    expect(() => assertSafeToRemove(repo, home, repo)).toThrow(/危险路径/)
    expect(() => assertSafeToRemove(join(home, "Documents"), home, repo)).toThrow(
      /不在允许的清理范围内/,
    )
  })
})

describe("extraRustTargets", () => {
  it("keeps host target", () => {
    expect(
      extraRustTargets("aarch64-apple-darwin", [
        "aarch64-apple-darwin",
        "aarch64-linux-android",
        "x86_64-pc-windows-msvc",
      ]),
    ).toEqual(["aarch64-linux-android", "x86_64-pc-windows-msvc"])
  })
})

describe("formatBytes", () => {
  it("formats gb", () => {
    expect(formatBytes(7.3 * 1024 ** 3)).toMatch(/7\.30 GB/)
  })
})

describe("toolchainCleanPaths", () => {
  it("points at Android SDK and Gradle cache under home", () => {
    const home = homedir()
    const paths = toolchainCleanPaths(home)
    expect(paths.some((p) => p.endsWith(join("Library", "Android")))).toBe(true)
    expect(paths.some((p) => p.endsWith(".gradle"))).toBe(true)
  })
})
