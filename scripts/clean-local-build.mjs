#!/usr/bin/env node
/**
 * 删除本机编译产物，把打包工作留给 GitHub Actions。
 *
 *   npm run clean
 *   npm run clean:toolchains
 *   node scripts/clean-local-build.mjs --dry-run --toolchains
 */

import { existsSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."))

/** 仓库内可安全删除的相对路径（相对仓库根） */
export const PROJECT_CLEAN_RELATIVE_PATHS = [
  "src-tauri/target",
  "dist",
  "dist-android",
  "release",
  "src-tauri/gen/android/.gradle",
  "src-tauri/gen/android/build",
  "src-tauri/gen/android/app/build",
  "src-tauri/gen/android/buildSrc/build",
  "src-tauri/gen/android/buildSrc/.gradle",
  "src-tauri/gen/android/app/src/main/assets",
  "src-tauri/gen/android/app/src/main/jniLibs",
]

/** 仅本机 Android / Gradle 缓存，不删 JDK、不卸载 rustup */
export function toolchainCleanPaths(home = homedir()) {
  return [join(home, "Library", "Android"), join(home, ".gradle")]
}

export function parseCleanArgs(argv) {
  const out = { toolchains: false, dryRun: false, help: false }
  for (const a of argv) {
    if (a === "--toolchains") out.toolchains = true
    else if (a === "--dry-run") out.dryRun = true
    else if (a === "--help" || a === "-h") out.help = true
    else if (a.startsWith("-")) {
      throw new Error(`未知参数: ${a}`)
    }
  }
  return out
}

export function extraRustTargets(host, installed) {
  const h = String(host || "").trim()
  return (installed || []).map((t) => String(t).trim()).filter((t) => t && t !== h)
}

export function assertSafeToRemove(absPath, home, repoRoot) {
  const resolved = resolve(absPath)
  const homeRes = resolve(home)
  const rootRes = resolve(repoRoot)
  if (resolved === "/" || resolved === homeRes || resolved === rootRes) {
    throw new Error(`拒绝删除危险路径: ${resolved}`)
  }
  const underRoot = resolved.startsWith(rootRes + sep)
  const underAndroid = resolved.startsWith(join(homeRes, "Library", "Android"))
  const underGradle = resolved.startsWith(join(homeRes, ".gradle"))
  if (!underRoot && !underAndroid && !underGradle) {
    throw new Error(`路径不在允许的清理范围内: ${resolved}`)
  }
  return resolved
}

function duBytes(absPath) {
  if (!existsSync(absPath)) return 0
  const r = spawnSync("du", ["-sk", absPath], { encoding: "utf8" })
  if (r.status !== 0) return 0
  const n = parseInt(String(r.stdout).trim().split(/\s+/)[0], 10)
  return Number.isFinite(n) ? n * 1024 : 0
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function rustcHost() {
  const r = spawnSync("rustc", ["-vV"], { encoding: "utf8" })
  if (r.status !== 0) return ""
  const m = String(r.stdout).match(/^host:\s*(\S+)/m)
  return m ? m[1] : ""
}

function rustupInstalledTargets() {
  const r = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" })
  if (r.status !== 0) return []
  return String(r.stdout)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function collectTargets(opts, home, repoRoot) {
  const paths = PROJECT_CLEAN_RELATIVE_PATHS.map((rel) => join(repoRoot, rel))
  if (opts.toolchains) paths.push(...toolchainCleanPaths(home))
  return paths.map((p) => assertSafeToRemove(p, home, repoRoot))
}

export function planClean(opts, home = homedir(), repoRoot = root) {
  const paths = collectTargets(opts, home, repoRoot)
  const items = paths.map((p) => ({ path: p, bytes: duBytes(p), exists: existsSync(p) }))
  let extraTargets = []
  let host = ""
  if (opts.toolchains) {
    host = rustcHost()
    extraTargets = extraRustTargets(host, rustupInstalledTargets())
  }
  return { items, extraTargets, host }
}

function printHelp() {
  console.log(`用法: node scripts/clean-local-build.mjs [--toolchains] [--dry-run]

  默认删除仓库内 target / dist / dist-android / release / Android 构建目录。
  --toolchains  再删除本机 Android SDK、Gradle 缓存，并卸掉非本机 Rust target。
  --dry-run     只统计，不删除。`)
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseCleanArgs(argv)
  if (opts.help) {
    printHelp()
    return 0
  }
  const plan = planClean(opts)
  let total = 0
  for (const item of plan.items) {
    total += item.bytes
    const mark = item.exists ? formatBytes(item.bytes) : "（不存在）"
    console.log(`${opts.dryRun ? "将删除" : "删除"} ${item.path}  ${mark}`)
    if (!opts.dryRun && item.exists) {
      rmSync(item.path, { recursive: true, force: true })
    }
  }
  if (opts.toolchains && plan.extraTargets.length) {
    console.log(
      `${opts.dryRun ? "将卸掉" : "卸掉"} 多余 Rust target（保留 ${plan.host || "本机"}）: ${plan.extraTargets.join(", ")}`,
    )
    if (!opts.dryRun) {
      const r = spawnSync("rustup", ["target", "remove", ...plan.extraTargets], {
        stdio: "inherit",
      })
      if (r.status !== 0) {
        console.error("rustup target remove 失败，可稍后手动执行。")
      }
    }
  }
  console.log(`${opts.dryRun ? "可释放" : "已释放"}约 ${formatBytes(total)}`)
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
