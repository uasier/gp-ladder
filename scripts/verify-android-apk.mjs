#!/usr/bin/env node
/**
 * 校验发布 APK 使用固定证书，且 versionCode 随语义版本递增。
 * 证书不一致时 Android 会拒绝覆盖安装，只能卸载重装。
 *
 *   node scripts/verify-android-apk.mjs dist-android/gp-ladder_0.2.7_aarch64.apk
 */

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

export function androidVersionCode(version) {
  const parts = String(version).trim().replace(/^v/i, "").split(".")
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`非法版本号: ${version}`)
  }
  const [major, minor, patch] = parts.map(Number)
  const code = major * 1_000_000 + minor * 1_000 + patch
  if (!Number.isSafeInteger(code) || code < 1 || code > 2_100_000_000) {
    throw new Error(`versionCode 超出范围: ${code}`)
  }
  return code
}

export function parseSignerSha256(text) {
  const match = String(text).match(/SHA-256 digest:\s*([0-9a-fA-F]{64})/)
  if (!match) throw new Error("未找到 APK 证书 SHA-256")
  return match[1].toLowerCase()
}

export function parseVersionCode(badging) {
  const match = String(badging).match(/\bversionCode='(\d+)'/)
  if (!match) throw new Error("未找到 versionCode")
  return Number(match[1])
}

export function expectedReleaseCert(text = readFileSync(join(root, "src-tauri/gen/android/release-cert.sha256"), "utf8")) {
  const cert = String(text).trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(cert)) throw new Error("release-cert.sha256 格式不正确")
  return cert
}

export function findAndroidTool(name, roots = androidSdkRoots()) {
  const found = []
  for (const sdk of roots) {
    const tools = join(sdk, "build-tools")
    if (!existsSync(tools)) continue
    for (const version of readdirSync(tools)) {
      const candidate = join(tools, version, name)
      if (existsSync(candidate)) found.push(candidate)
    }
  }
  found.sort()
  return found.at(-1) || null
}

export function verifyAndroidApk({ version, cert, signerText, badging }) {
  const actualCert = parseSignerSha256(signerText)
  if (actualCert !== cert) {
    throw new Error(`APK 证书与固定发布证书不一致: ${actualCert}`)
  }
  const actualCode = parseVersionCode(badging)
  const expectedCode = androidVersionCode(version)
  if (actualCode !== expectedCode) {
    throw new Error(`versionCode ${actualCode} 与版本 ${version} 期望的 ${expectedCode} 不一致`)
  }
  return { cert: actualCert, versionCode: actualCode }
}

function androidSdkRoots() {
  return [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(process.env.HOME || "", "Library/Android/sdk")]
    .filter(Boolean)
}

function readPackageVersion() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version
}

function isDirectRun() {
  const entry = process.argv[1]
  return Boolean(entry) && fileURLToPath(import.meta.url) === entry
}

if (isDirectRun()) {
  const apk = process.argv[2]
  if (!apk) {
    console.error("用法: node scripts/verify-android-apk.mjs <apk>")
    process.exit(1)
  }
  const apksigner = findAndroidTool("apksigner")
  const aapt = findAndroidTool("aapt")
  if (!apksigner || !aapt) {
    throw new Error("未找到 apksigner 或 aapt，无法确认 APK 签名")
  }
  const result = verifyAndroidApk({
    version: readPackageVersion(),
    cert: expectedReleaseCert(),
    signerText: execFileSync(apksigner, ["verify", "--print-certs", apk], { encoding: "utf8" }),
    badging: execFileSync(aapt, ["dump", "badging", apk], { encoding: "utf8" }),
  })
  console.log(`Android signature OK: versionCode ${result.versionCode}, cert ${result.cert.slice(0, 12)}…`)
}
