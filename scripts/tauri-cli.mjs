#!/usr/bin/env node
/**
 * `npm run tauri` 入口：本机拦截安装包编译，避免再生成数 GB 的 target/。
 *
 * - GitHub Actions / CI：原样转给 @tauri-apps/cli（Build 工作流依赖此路径）
 * - 本机 `tauri build` / `tauri android build`：拒绝本地出包，提示改用 `npm run build:github`
 * - 其余子命令（dev、android init/dev、info）仍走本机 CLI
 * - 确需本机出包：GP_LOCAL_BUILD=1 npm run tauri -- build ...
 */

import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."))
const require = createRequire(import.meta.url)

export function isCiEnv(env = process.env) {
  return env.GITHUB_ACTIONS === "true" || env.CI === "true"
}

export function allowLocalPackage(env = process.env) {
  return env.GP_LOCAL_BUILD === "1"
}

/** 是否为本机会生成 src-tauri/target 安装包的命令 */
export function isPackageBuildArgv(argv) {
  const a = (argv || []).filter((x) => x != null && String(x).trim() !== "")
  if (a[0] === "build") return true
  if (a[0] === "android" && a[1] === "build") return true
  return false
}

export function shouldBlockLocalPackage(argv, env = process.env) {
  if (isCiEnv(env) || allowLocalPackage(env)) return false
  return isPackageBuildArgv(argv)
}

export function tauriCliEntry() {
  const pkgDir = dirname(require.resolve("@tauri-apps/cli/package.json"))
  return join(pkgDir, "tauri.js")
}

export function localBuildHint(argv = ["build"]) {
  const shown = argv.length ? argv.join(" ") : "build"
  return `本机不编译安装包（会生成数 GB 的 src-tauri/target/）。

请改用 GitHub Actions：
  npm run build:github
  npm run build:github -- --tag v0.2.0

确需本机出包（硬盘占用大）：
  GP_LOCAL_BUILD=1 npm run tauri -- ${shown}`
}

export function main(argv = process.argv.slice(2), env = process.env) {
  if (shouldBlockLocalPackage(argv, env)) {
    console.error(localBuildHint(argv))
    return 1
  }
  const entry = tauriCliEntry()
  const r = spawnSync(process.execPath, [entry, ...argv], {
    cwd: root,
    stdio: "inherit",
    env,
  })
  if (r.error && r.error.code === "ENOENT") {
    console.error("未找到 @tauri-apps/cli，请先 npm install")
    return 1
  }
  return r.status ?? 1
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
