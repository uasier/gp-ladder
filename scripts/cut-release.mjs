#!/usr/bin/env node
/**
 * 本地打发布 tag：同步版本 → 提交 → 打 vX.Y.Z。
 * 不推送远程；推送 tag 后 GitHub Actions 会构建并上传 Release。
 *
 *   npm run release:tag -- 0.2.0
 */

import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const raw = process.argv[2] || ""
const ver = raw.trim().replace(/^v/i, "")
if (!/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error("用法: npm run release:tag -- 0.2.0")
  process.exit(1)
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit" })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

run("node", ["scripts/sync-version.mjs", "--set", ver])
run("git", [
  "add",
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
])
run("git", ["commit", "-m", `chore: 发布 v${ver}`])
run("git", ["tag", "-a", `v${ver}`, "-m", `连涨天梯 v${ver}`])
console.log(`已提交并打 tag v${ver}。推送：\n  git push origin HEAD && git push origin v${ver}`)
