import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** Gate publication on complete installers and updater archives from this tag. */
export function verifyReleaseAssets(release, tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || release?.tag_name !== tag) {
    throw new Error(`Release tag does not match ${tag}`)
  }
  const version = tag.slice(1)
  const names = [
    `gp-ladder_${version}_aarch64.dmg`,
    `gp-ladder_${version}_x64.dmg`,
    `gp-ladder_${version}_x64-setup.exe`,
    `gp-ladder_${version}_aarch64.apk`,
    `gp-ladder_${version}_aarch64.app.tar.gz`,
    `gp-ladder_${version}_x64.app.tar.gz`,
  ]
  const assets = Array.isArray(release.assets) ? release.assets : []
  return names.map((name) => {
    const matches = assets.filter((asset) => asset.name === name)
    if (matches.length !== 1) throw new Error(`Missing or duplicate release asset: ${name}`)
    const asset = matches[0]
    if (asset.state !== "uploaded" || !Number.isSafeInteger(asset.size) || asset.size <= 0) {
      throw new Error(`Incomplete release asset: ${name}`)
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")) {
      throw new Error(`Missing SHA-256 digest: ${name}`)
    }
    return asset
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const release = JSON.parse(readFileSync(process.argv[2], "utf8"))
    const assets = verifyReleaseAssets(release, process.argv[3])
    console.log(`Verified ${assets.length} complete release assets for ${release.tag_name}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
