import { isTauri } from "./api"
import { buildTonghuashunAppUrl, buildTonghuashunPageUrl } from "./stock"

async function openUrl(url: string): Promise<void> {
  const { openUrl: open } = await import("@tauri-apps/plugin-opener")
  await open(url)
}

function openPage(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer")
  if (!opened) window.location.assign(url)
}

/** 手机端打开同花顺个股页：已安装则进 App 行情，否则打开手机网页。 */
export async function openTonghuashunStock(code: string): Promise<void> {
  const pageUrl = buildTonghuashunPageUrl(code)
  const appUrl = buildTonghuashunAppUrl(code)
  if (pageUrl === "#" && !appUrl) return

  if (isTauri()) {
    if (appUrl) {
      try {
        await openUrl(appUrl)
        return
      } catch {
        // 未安装同花顺，或系统拒绝唤起。
      }
    }
    if (pageUrl !== "#") await openUrl(pageUrl)
    return
  }

  if (pageUrl !== "#") openPage(pageUrl)
  // 安卓浏览器可静默尝试唤起 App；iOS 失败会弹系统提示，所以只打开网页。
  if (appUrl && /Android/i.test(navigator.userAgent)) {
    window.location.href = appUrl
  }
}
