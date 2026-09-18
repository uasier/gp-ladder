import type { UpdateCheck } from "../types"

type Props = {
  info: UpdateCheck | null
  installing: boolean
  onView: () => void
  onInstall: () => void
  onLater: () => void
}

export function UpdateBanner({ info, installing, onView, onInstall, onLater }: Props) {
  if (!info?.available) return null
  return (
    <div className="refresh-banner is-visible update-banner" role="status">
      <span>
        发现新版本 {info.latestVersion}
        <span className="muted">（当前 {info.currentVersion}）</span>
      </span>
      <span className="update-banner-actions">
        <button type="button" className="btn" onClick={onView}>
          查看说明
        </button>
        <button type="button" className="btn primary" disabled={installing} onClick={onInstall}>
          {installing ? "正在下载…" : info.assetUrl ? "下载安装包" : "打开发布页"}
        </button>
        <button type="button" className="btn" onClick={onLater}>
          稍后
        </button>
      </span>
    </div>
  )
}
