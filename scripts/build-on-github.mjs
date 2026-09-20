#!/usr/bin/env node
/**
 * 在 GitHub Actions 上触发全平台编译，产物留在 Actions Artifacts / Release，不占本机磁盘。
 *
 *   npm run build:github
 *   npm run build:github -- --tag v0.2.0
 *   npm run build:github -- --ref main
 */

import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const WORKFLOW_FILE = "build.yml"

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."))

export function parseBuildArgs(argv) {
  const out = { tag: "", ref: "", help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === "--help" || a === "-h") out.help = true
    else if (a === "--tag") out.tag = String(argv[++i] || "").trim()
    else if (a === "--ref") out.ref = String(argv[++i] || "").trim()
    else if (a.startsWith("-")) throw new Error(`未知参数: ${a}`)
    else throw new Error(`未知参数: ${a}`)
  }
  if (out.tag) {
    const ver = out.tag.replace(/^v/i, "")
    if (!/^\d+\.\d+\.\d+$/.test(ver)) {
      throw new Error(`非法 tag: ${out.tag}（需要 vX.Y.Z）`)
    }
    out.tag = `v${ver}`
  }
  return out
}

export function ghWorkflowArgs({ tag = "", ref = "" } = {}) {
  const args = ["workflow", "run", WORKFLOW_FILE]
  if (ref) args.push("--ref", ref)
  if (tag) args.push("-f", `release_tag=${tag}`)
  return args
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...opts })
}

function currentBranch() {
  const r = run("git", ["rev-parse", "--abbrev-ref", "HEAD"])
  return r.status === 0 ? String(r.stdout).trim() : "main"
}

function printHelp() {
  console.log(`用法: npm run build:github -- [--tag v0.2.0] [--ref main]

  触发 GitHub Actions「Build」工作流，在云端编译 macOS / Windows / Android。
  不填 --tag 时只上传 Actions 产物（保留 14 天），不会改 GitHub Release。`)
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseBuildArgs(argv)
  if (opts.help) {
    printHelp()
    return 0
  }
  const ref = opts.ref || currentBranch()
  const args = ghWorkflowArgs({ tag: opts.tag, ref })
  const gh = run("gh", args, { stdio: "inherit" })
  if (gh.error && gh.error.code === "ENOENT") {
    console.error("未找到 gh。请安装 GitHub CLI，或在网页打开：")
    console.error("  https://github.com/uasier/gp-ladder/actions/workflows/build.yml")
    return 1
  }
  if (gh.status !== 0) return gh.status ?? 1
  console.log("已在 GitHub 上排队编译。查看进度：")
  console.log("  gh run list --workflow=build.yml --limit 5")
  console.log("  https://github.com/uasier/gp-ladder/actions/workflows/build.yml")
  if (opts.tag) {
    console.log(`完成后安装包会挂到 Release ${opts.tag}。`)
  } else {
    console.log("完成后在该次 Run 的 Artifacts 下载安装包（不占本机编译缓存）。")
  }
  return 0
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(resolve(entry)).href
}

if (isMain()) {
  try {
    process.exit(main())
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
