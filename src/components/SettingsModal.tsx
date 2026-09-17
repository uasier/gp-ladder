import { useEffect, useState } from "react"
import { DEFAULT_ANALYSIS_PROMPT, DEFAULT_SCORE_PROMPT } from "../prompt"
import type { SettingsView } from "../types"

type Props = {
  open: boolean
  settings: SettingsView | null
  saving: boolean
  onClose: () => void
  onSave: (patch: {
    maxPages: number
    deepseekApiKey: string
    deepseekBaseUrl: string
    deepseekModel: string
    analysisPrompt: string
    scorePrompt: string
  }) => Promise<void>
}

type Tab = "crawl" | "deepseek"

export function SettingsModal({ open, settings, saving, onClose, onSave }: Props) {
  const [tab, setTab] = useState<Tab>("crawl")
  const [maxPages, setMaxPages] = useState(0)
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com")
  const [model, setModel] = useState("deepseek-chat")
  const [analysisPrompt, setAnalysisPrompt] = useState(DEFAULT_ANALYSIS_PROMPT)
  const [scorePrompt, setScorePrompt] = useState(DEFAULT_SCORE_PROMPT)

  useEffect(() => {
    if (!open || !settings) return
    setMaxPages(settings.maxPages || 0)
    setApiKey(settings.deepseekApiKey || "")
    setBaseUrl(settings.deepseekBaseUrl || "https://api.deepseek.com")
    setModel(settings.deepseekModel || "deepseek-chat")
    setAnalysisPrompt(settings.analysisPrompt || DEFAULT_ANALYSIS_PROMPT)
    setScorePrompt(settings.scorePrompt || DEFAULT_SCORE_PROMPT)
    setTab("crawl")
  }, [open, settings])

  if (!open) return null

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
          <button type="button" className={tab === "crawl" ? "active" : ""} onClick={() => setTab("crawl")}>
            抓取
          </button>
          <button
            type="button"
            className={tab === "deepseek" ? "active" : ""}
            onClick={() => setTab("deepseek")}
          >
            DeepSeek
            {settings?.hasDeepseekKey ? " · 已配置" : ""}
          </button>
        </div>
        {tab === "crawl" ? (
          <div className="settings-pane">
            <p className="muted tip">
              抓取在软件内部完成：直接请求同花顺连涨榜和东方财富行情。快照保存在本机应用数据目录。
            </p>
            <label className="field">
              <span>最多抓取页数（0 表示抓完全部）</span>
              <input
                type="number"
                min={0}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 0)}
              />
            </label>
            <p className="resolved-hint muted">
              {settings?.cachePath ? `快照：${settings.cachePath}` : ""}
            </p>
          </div>
        ) : (
          <div className="settings-pane">
            <p className="muted tip">
              右键股票可按短线视角（未来 1–5 个交易日）调用 DeepSeek 看盘，并给出短线评分。Key 只保存在本机设置文件。
              分析提示词里的 <code>______</code> / <code>{"{name}"}</code> / <code>{"{code}"}</code> 会替换成标的；
              评分提示词里的 <code>{"{analysis}"}</code> 会替换成分析正文。
            </p>
            <label className="field">
              <span>API Key</span>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
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
                rows={10}
                value={analysisPrompt}
                onChange={(e) => setAnalysisPrompt(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                onClick={() => setAnalysisPrompt(DEFAULT_ANALYSIS_PROMPT)}
              >
                恢复默认分析提示词
              </button>
            </label>
            <label className="field">
              <span>AI 评分提示词</span>
              <textarea
                className="prompt-box"
                rows={8}
                value={scorePrompt}
                onChange={(e) => setScorePrompt(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                onClick={() => setScorePrompt(DEFAULT_SCORE_PROMPT)}
              >
                恢复默认评分提示词
              </button>
            </label>
          </div>
        )}
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
            {saving ? "保存中…" : "保存"}
          </button>
        </footer>
      </div>
    </div>
  )
}
