/** 窄屏阈值：与 CSS 移动端断点保持一致。 */
export const PHONE_UI_MAX_WIDTH = 720

export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(ua)
}

export function isNarrowViewport(width: number): boolean {
  return width <= PHONE_UI_MAX_WIDTH
}

export function isPhoneUi(
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
  width = typeof window === "undefined" ? 1200 : window.innerWidth,
): boolean {
  return isMobileUserAgent(ua) || isNarrowViewport(width)
}

export function isAndroidUserAgent(ua: string): boolean {
  return /Android/i.test(ua)
}

export function isMobileApp(
  tauri: boolean,
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  return tauri && isMobileUserAgent(ua)
}

export function applyMobileClass(
  root: { classList: { toggle: (token: string, force?: boolean) => boolean } },
  ua: string,
  width: number,
): boolean {
  const mobile = isPhoneUi(ua, width)
  root.classList.toggle("is-mobile", mobile)
  return mobile
}
