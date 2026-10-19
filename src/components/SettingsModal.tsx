import { useEffect, useState } from "react"
import { listReleaseHistory } from "../api"
import { DEFAULT_ANALYSIS_PROMPT, DEFAULT_SCORE_PROMPT } from "../prompt"
import { formatReleaseDate, shouldOpenRelease } from "../releaseHistory"
import type { ReleaseInfo, SettingsView, UpdateCheck } from "../types"

type Tab = "crawl" | "deepseek" | "about"

type Props = {
  open: boolean
  settings: SettingsView | null
  saving: boolean
  initialTab?: Tab
  update: UpdateCheck | null
  updateChecking: boolean
  updateInstalling: boolean
  updateError: string | null
  onClose: () => void
  onSave: (patch: {
    maxPages: number
    deepseekApiKey: string
    deepseekBaseUrl: string
    deepseekModel: string
    analysisPrompt: string
    scorePrompt: string
  }) => Promise<void>
  onCheckUpdate: () => void
  onOpenRelease: (url?: string) => void
  onInstallUpdate: () => void
}

export function SettingsModal({
  open,
  settings,
  saving,
  initialTab = "crawl",
  update,
  updateChecking,
  updateInstalling,
  updateError,
  onClose,
  onSave,
  onCheckUpdate,
  onOpenRelease,
  onInstallUpdate,
}: Props) {
  const [tab, setTab] = useState<Tab>("crawl")
  const [maxPages, setMaxPages] = useState(0)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com")
  const [model, setModel] = useState("deepseek-chat")
  const [analysisPrompt, setAnalysisPrompt] = useState(DEFAULT_ANALYSIS_PROMPT)
  const [scorePrompt, setScorePrompt] = useState(DEFAULT_SCORE_PROMPT)
  const [history, setHistory] = useState<ReleaseInfo[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !settings) return
    setMaxPages(settings.maxPages || 0)
    setApiKey(settings.deepseekApiKey || "")
    setBaseUrl(settings.deepseekBaseUrl || "https://api.deepseek.com")
    setModel(settings.deepseekModel || "deepseek-chat")
    setAnalysisPrompt(settings.analysisPrompt || DEFAULT_ANALYSIS_PROMPT)
    setScorePrompt(settings.scorePrompt || DEFAULT_SCORE_PROMPT)
    setTab(initialTab)
  }, [open, settings, initialTab])

  useEffect(() => {
    if (!open || tab !== "about") return
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    listReleaseHistory()
      .then((rows) => {
        if (cancelled) return
        setHistory(rows)
        setHistoryLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setHistoryError(String(e))
        setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, tab, update?.latestVersion])

  if (!open) return null

  const current = update?.currentVersion || settings?.version || "0.1.0"
  const latest = update?.latestVersion || current

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>设置</h2>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="settings-tabs">
          <button
            type="button"
            className={tab === "crawl" ? "active" : ""}
            onClick={() => setTab("crawl")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            抓取
          </button>
          <button
            type="button"
            className={tab === "deepseek" ? "active" : ""}
            onClick={() => setTab("deepseek")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            DeepSeek
            {settings?.hasDeepseekKey ? " · 已配置" : ""}
          </button>
          <button
            type="button"
            className={tab === "about" ? "active" : ""}
            onClick={() => setTab("about")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            关于
            {update?.available ? " · 有新版本" : ""}
          </button>
        </div>
        {tab === "crawl" ? (
          <div className="settings-pane">
            <p className="muted tip">
              数据来自同花顺、东方财富，快照保存在本机。
            </p>
            <label className="field">
              <span>最多抓取页数（0 为全部）</span>
              <input
                type="number"
                min={0}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 0)}
              />
            </label>
            {settings?.cachePath ? (
              <details className="settings-help">
                <summary>缓存位置</summary>
                <p className="muted tip">{settings.cachePath}</p>
              </details>
            ) : null}
          </div>
        ) : tab === "deepseek" ? (
          <div className="settings-pane">
            <p className="muted tip">
              短线分析与评分（1–5 个交易日）。API Key 保存在本机。
            </p>
            <details className="settings-help">
              <summary>提示词变量</summary>
              <p className="muted tip">
                <code>______</code>、<code>{"{name}"}</code>、<code>{"{code}"}</code> 替换为股票信息；
                <code>{"{analysis}"}</code> 替换为分析正文。
              </p>
            </details>
            <label className="field">
              <span>API Key</span>
              <div className="field-inline">
                <input
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? "隐藏 Key" : "显示明文 Key"}
                >
                  {showKey ? "隐藏" : "显示"}
                </button>
              </div>
            </label>
            <label className="field">
              <span>接口地址</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com"
              />
            </label>
            <label className="field">
              <span>模型</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-chat"
              />
            </label>
            <label className="field">
              <span>分析提示词</span>
              <textarea
                className="prompt-box"
                rows={9}
                value={analysisPrompt}
                onChange={(e) => setAnalysisPrompt(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                style={{ alignSelf: "flex-start", marginTop: 4 }}
                onClick={() => setAnalysisPrompt(DEFAULT_ANALYSIS_PROMPT)}
              >
                恢复默认
              </button>
            </label>
            <label className="field">
              <span>评分提示词</span>
              <textarea
                className="prompt-box"
                rows={7}
                value={scorePrompt}
                onChange={(e) => setScorePrompt(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                style={{ alignSelf: "flex-start", marginTop: 4 }}
                onClick={() => setScorePrompt(DEFAULT_SCORE_PROMPT)}
              >
                恢复默认
              </button>
            </label>
          </div>
        ) : (
          <div className="settings-pane">
            <p className="muted tip">
              更新来自 GitHub Releases。macOS 提示「文件已损坏」时，请按 README 处理。
            </p>
            <div className="about-grid">
              <div>
                <span className="muted">当前版本</span>
                <strong>v{current}</strong>
              </div>
              <div>
                <span className="muted">最新版本</span>
                <strong>{update ? `v${latest}` : "尚未检查"}</strong>
              </div>
              <div>
                <span className="muted">检测状态</span>
                <strong>
                  {updateChecking
                    ? "正在检查…"
                    : update?.available
                      ? "发现新版本"
                      : update
                        ? "已是最新版本"
                        : "—"}
                </strong>
              </div>
            </div>
            {updateError ? <p className="resolved-hint warn">{updateError}</p> : null}
            {update?.assetName ? (
              <p className="resolved-hint muted">安装包：{update.assetName}</p>
            ) : null}
            <div className="about-actions">
              <button type="button" className="btn" disabled={updateChecking} onClick={onCheckUpdate}>
                {updateChecking ? "检查中…" : "检查更新"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!update?.htmlUrl}
                onClick={() => onOpenRelease(update?.htmlUrl)}
              >
                打开发布页
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={updateInstalling || !update?.available}
                onClick={onInstallUpdate}
              >
                {updateInstalling
                  ? "正在打开…"
                  : update?.assetName?.toLowerCase().endsWith(".apk")
                    ? "下载 APK"
                    : "下载并打开安装包"}
              </button>
            </div>
            <section className="release-history" aria-labelledby="release-history-title">
              <h3 id="release-history-title">更新历史</h3>
              {historyLoading ? <p className="resolved-hint muted">正在读取 GitHub Releases…</p> : null}
              {historyError ? <p className="resolved-hint warn">{historyError}</p> : null}
              {historyError && update?.notes ? <pre className="update-notes">{update.notes}</pre> : null}
              {!historyLoading && !historyError && history.length === 0 ? (
                <p className="resolved-hint muted">暂无发布记录。</p>
              ) : null}
              {history.map((item, index) => (
                <details
                  key={item.version}
                  className="release-item"
                  open={shouldOpenRelease(item, index)}
                >
                  <summary>
                    <span className="release-ver">v{item.version}</span>
                    {item.latest ? <span className="release-badge latest">最新</span> : null}
                    {item.current ? <span className="release-badge current">当前</span> : null}
                    {item.prerelease ? <span className="release-badge pre">预发布</span> : null}
                    {formatReleaseDate(item.publishedAt) ? (
                      <time className="release-date" dateTime={item.publishedAt}>
                        {formatReleaseDate(item.publishedAt)}
                      </time>
                    ) : null}
                  </summary>
                  {item.notes ? <pre className="update-notes">{item.notes}</pre> : <p className="muted">无更新说明。</p>}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onOpenRelease(item.htmlUrl)}
                  >
                    打开 v{item.version}
                  </button>
                </details>
              ))}
            </section>
          </div>
        )}
        {tab === "about" ? null : (
          <footer>
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() =>
                onSave({
                  maxPages,
                  deepseekApiKey: apiKey,
                  deepseekBaseUrl: baseUrl,
                  deepseekModel: model,
                  analysisPrompt,
                  scorePrompt,
                })
              }
            >
              {saving ? "保存中…" : "保存设置"}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
