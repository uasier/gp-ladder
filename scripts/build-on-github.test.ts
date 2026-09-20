import { describe, expect, it } from "vitest"
import { WORKFLOW_FILE, ghWorkflowArgs, parseBuildArgs } from "./build-on-github.mjs"

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
