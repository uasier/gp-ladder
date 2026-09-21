import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { WORKFLOW_FILE, ghWorkflowArgs, parseBuildArgs } from "./build-on-github.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>
}

describe("parseBuildArgs", () => {
  it("defaults to artifacts-only", () => {
    expect(parseBuildArgs([])).toEqual({ tag: "", ref: "", help: false })
  })

  it("normalizes tag and ref", () => {
    expect(parseBuildArgs(["--tag", "0.2.0", "--ref", "main"])).toEqual({
      tag: "v0.2.0",
      ref: "main",
      help: false,
    })
    expect(parseBuildArgs(["--tag", "v0.2.0"]).tag).toBe("v0.2.0")
  })

  it("rejects invalid tag", () => {
    expect(() => parseBuildArgs(["--tag", "main"])).toThrow(/非法 tag/)
  })
})

describe("ghWorkflowArgs", () => {
  it("runs build.yml without creating a release by default", () => {
    expect(WORKFLOW_FILE).toBe("build.yml")
    expect(ghWorkflowArgs({ ref: "main" })).toEqual([
      "workflow",
      "run",
      "build.yml",
      "--ref",
      "main",
    ])
  })

  it("passes release_tag only when publishing", () => {
    expect(ghWorkflowArgs({ tag: "v0.2.0", ref: "main" })).toEqual([
      "workflow",
      "run",
      "build.yml",
      "--ref",
      "main",
      "-f",
      "release_tag=v0.2.0",
    ])
  })
})

describe("package.json packaging scripts", () => {
  it("sends installers to GitHub instead of local tauri build", () => {
    for (const name of ["tauri:build", "tauri:build:mac", "tauri:build:win", "tauri:android:build"]) {
      expect(pkg.scripts[name]).toBe("node scripts/build-on-github.mjs")
    }
    expect(pkg.scripts.tauri).toBe("node scripts/tauri-cli.mjs")
    expect(pkg.scripts["build:github"]).toBe("node scripts/build-on-github.mjs")
  })
})

describe("macOS Gatekeeper packaging", () => {
  it("ad-hoc signs the app bundle so Gatekeeper does not treat it as damaged", () => {
    const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")) as {
      bundle: { macOS: { signingIdentity?: string } }
    }
    expect(conf.bundle.macOS.signingIdentity).toBe("-")
  })

  it("CI verifies the sealed ad-hoc signature after bundling", () => {
    const yml = readFileSync(join(root, ".github/workflows/build.yml"), "utf8")
    expect(yml).toContain("Verify macOS ad-hoc signature")
    expect(yml).toContain("codesign --verify --deep --strict")
    expect(yml).toContain("Sealed Resources version=2")
    expect(yml).toContain("Sealed Resources=none")
    expect(yml).toContain("release/bundle/macos/连涨天梯.app")
  })

  it("README and about pane document the damaged-file workaround", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8")
    expect(readme).toContain("文件已损坏")
    expect(readme).toContain("xattr -cr /Applications/连涨天梯.app")
    expect(readme).toContain("codesign --force --deep --sign - /Applications/连涨天梯.app")
    expect(readme).not.toMatch(/macOS：.*首次请右键 → 打开/)

    const about = readFileSync(join(root, "src/components/SettingsModal.tsx"), "utf8")
    expect(about).toContain("文件已损坏")
  })
})
