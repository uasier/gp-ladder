#!/usr/bin/env node
/**
 * 用本机 Chrome 截分享图。汉字必须精确，因此不用生成模型出图。
 *   node scripts/render-og.mjs           → public/og.png（1200×630）
 *   node scripts/render-og.mjs --github  → docs/github-social.png（1280×640）
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const target = process.argv.includes("--github") ? "github" : "og"
const html = join(
  root,
  target === "github" ? "scripts/github-social.html" : "scripts/og-card.html",
)
const out = join(root, target === "github" ? "docs/github-social.png" : "public/og.png")
const size = target === "github" ? "1280,640" : "1200,630"

if (!existsSync(chrome)) {
  console.error("未找到 Google Chrome，无法渲染 OG 图")
  process.exit(1)
}

const result = spawnSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    `--window-size=${size}`,
    `--screenshot=${out}`,
    pathToFileURL(html).href,
  ],
  { stdio: "inherit" },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const info = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", out], {
  encoding: "utf8",
})
console.log(info.stdout.trim())
console.log(`已写入 ${out}`)
