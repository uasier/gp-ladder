#!/usr/bin/env node
/**
 * 同步 package.json / package-lock.json / tauri.conf.json / Cargo.toml / Cargo.lock 版本。
 *
 *   node scripts/sync-version.mjs --check
 *   node scripts/sync-version.mjs --check --tag v0.1.0
 *   node scripts/sync-version.mjs --set 0.2.0
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function read(rel) {
  return readFileSync(join(root, rel), "utf8")
}

function write(rel, text) {
  writeFileSync(join(root, rel), text)
}

function parseArgs(argv) {
  const out = { check: false, set: null, tag: null }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === "--check") out.check = true
    else if (a === "--set") out.set = argv[++i]
    else if (a === "--tag") out.tag = argv[++i]
    else if (!a.startsWith("-") && !out.set) out.set = a
  }
  return out
}

function normalize(raw) {
  return String(raw || "")
    .trim()
    .replace(/^v/i, "")
}

function valid(ver) {
  return /^\d+\.\d+\.\d+$/.test(ver)
}

function cargoPackageVersion(toml) {
  const block = toml.match(/\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)
  if (!block) throw new Error("Cargo.toml 未找到 [package].version")
  return block[1]
}

function readVersions() {
  const pkg = JSON.parse(read("package.json"))
  const lock = JSON.parse(read("package-lock.json"))
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json"))
  const cargoToml = read("src-tauri/Cargo.toml")
  const cargoLock = read("src-tauri/Cargo.lock")
  const cargoLockMatch = cargoLock.match(
    /\[\[package\]\]\nname = "gp-ladder"\nversion = "([^"]+)"/,
  )
  return {
    packageJson: pkg.version,
    packageLock: lock.version,
    packageLockRoot: lock.packages?.[""]?.version,
    tauri: tauri.version,
    cargoToml: cargoPackageVersion(cargoToml),
    cargoLock: cargoLockMatch?.[1] ?? null,
  }
}

function assertSame(versions, expected) {
  const entries = [
    ["package.json", versions.packageJson],
    ["package-lock.json", versions.packageLock],
    ['package-lock packages[""]', versions.packageLockRoot],
    ["src-tauri/tauri.conf.json", versions.tauri],
    ["src-tauri/Cargo.toml", versions.cargoToml],
    ["src-tauri/Cargo.lock", versions.cargoLock],
  ]
  const mismatches = entries.filter(([, v]) => v !== expected)
  if (mismatches.length) {
    const detail = mismatches.map(([name, v]) => `  ${name}: ${v}`).join("\n")
    throw new Error(`版本不一致，期望 ${expected}：\n${detail}`)
  }
}

function setVersion(ver) {
  const pkgPath = "package.json"
  const pkg = JSON.parse(read(pkgPath))
  pkg.version = ver
  write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

  const lock = JSON.parse(read("package-lock.json"))
  lock.version = ver
  if (lock.packages?.[""]) lock.packages[""].version = ver
  write("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`)

  const tauri = JSON.parse(read("src-tauri/tauri.conf.json"))
  tauri.version = ver
  write("src-tauri/tauri.conf.json", `${JSON.stringify(tauri, null, 2)}\n`)

  const cargoToml = read("src-tauri/Cargo.toml").replace(
    /(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,
    `$1${ver}$2`,
  )
  write("src-tauri/Cargo.toml", cargoToml)

  const cargoLock = read("src-tauri/Cargo.lock").replace(
    /(\[\[package\]\]\nname = "gp-ladder"\nversion = ")[^"]+(")/,
    `$1${ver}$2`,
  )
  write("src-tauri/Cargo.lock", cargoLock)
}

const args = parseArgs(process.argv)
try {
  if (args.set) {
    const ver = normalize(args.set)
    if (!valid(ver)) throw new Error(`非法版本号: ${args.set}（需要 x.y.z）`)
    setVersion(ver)
    const next = readVersions()
    assertSame(next, ver)
    console.log(`已将版本同步为 ${ver}`)
  } else {
    const versions = readVersions()
    const expected = args.tag ? normalize(args.tag) : versions.packageJson
    if (args.tag && !valid(expected)) {
      throw new Error(`非法 tag: ${args.tag}（需要 vX.Y.Z 或 X.Y.Z）`)
    }
    assertSame(versions, expected)
    console.log(`版本一致: ${expected}`)
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
