/** 去掉可选 v 前缀，只保留主版本号。 */
export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? ""
}

function parts(raw: string): [number, number, number] {
  const bits = normalizeVersion(raw).split(".")
  return [Number(bits[0]) || 0, Number(bits[1]) || 0, Number(bits[2]) || 0]
}

/** a > b 返回 1，相等 0，a < b 返回 -1。 */
export function compareSemver(a: string, b: string): number {
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0
}
