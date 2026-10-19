import { useEffect, useRef, useState } from "react"
import { listReleaseHistory, testDeepseek } from "../api"
import "./SettingsModal.css"
import {
  DEFAULT_ANALYSIS_PROMPT,
  DEFAULT_JJZT_ANALYSIS_PROMPT,
  DEFAULT_JJZT_SCORE_PROMPT,
  DEFAULT_SCORE_PROMPT,
  DEFAULT_STOCK_PICK_PROMPT,
  STOCK_PICK_SCENE,
  STOCK_PICK_VARIABLES,
  DEFAULT_ZT_ANALYSIS_PROMPT,
  DEFAULT_ZT_SCORE_PROMPT,
  SCENE_CONFIGS,
  type PromptKind,
  type PromptScene,
  type PromptEditorScene,
} from "../prompt"
import { formatReleaseDate, shouldOpenRelease } from "../releaseHistory"
import type { ReleaseInfo, SettingsView, UpdateCheck } from "../types"

type Tab = "crawl" | "deepseek" | "about"

type Props = {
  open: boolean
  settings: SettingsView | null
  saving: boolean
  initialTab?: Tab
  initialPromptScene?: PromptEditorScene
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
    ztAnalysisPrompt?: string
    ztScorePrompt?: string
    jjztAnalysisPrompt?: string
    jjztScorePrompt?: string
    stockPickPrompt: string
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
  initialPromptScene = "lxsz",
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

  // 场景与提示词状态
  const [activeScene, setActiveScene] = useState<PromptEditorScene>("lxsz")
  const [activeKind, setActiveKind] = useState<PromptKind>("analysis")

  // 各场景独立提示词
  const [prompts, setPrompts] = useState({
    lxszAnalysis: DEFAULT_ANALYSIS_PROMPT,
    lxszScore: DEFAULT_SCORE_PROMPT,
    ztAnalysis: DEFAULT_ZT_ANALYSIS_PROMPT,
    ztScore: DEFAULT_ZT_SCORE_PROMPT,
    jjztAnalysis: DEFAULT_JJZT_ANALYSIS_PROMPT,
    jjztScore: DEFAULT_JJZT_SCORE_PROMPT,
    stockPick: DEFAULT_STOCK_PICK_PROMPT,
  })

  // 连通性测试状态
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [history, setHistory] = useState<ReleaseInfo[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open || !settings) return
    setMaxPages(settings.maxPages || 0)
    setApiKey(settings.deepseekApiKey || "")
    setBaseUrl(settings.deepseekBaseUrl || "https://api.deepseek.com")
    setModel(settings.deepseekModel || "deepseek-chat")
    setPrompts({
      lxszAnalysis: settings.analysisPrompt || DEFAULT_ANALYSIS_PROMPT,
      lxszScore: settings.scorePrompt || DEFAULT_SCORE_PROMPT,
      ztAnalysis: settings.ztAnalysisPrompt || DEFAULT_ZT_ANALYSIS_PROMPT,
      ztScore: settings.ztScorePrompt || DEFAULT_ZT_SCORE_PROMPT,
      jjztAnalysis: settings.jjztAnalysisPrompt || DEFAULT_JJZT_ANALYSIS_PROMPT,
      jjztScore: settings.jjztScorePrompt || DEFAULT_JJZT_SCORE_PROMPT,
      stockPick: settings.stockPickPrompt || DEFAULT_STOCK_PICK_PROMPT,
    })
    setTestResult(null)
    setTab(initialTab)
    setActiveScene(initialPromptScene)
    setActiveKind("analysis")
  }, [open, settings, initialTab, initialPromptScene])

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

  // 当前场景与提示词提取
  const currentSceneConfig = activeScene === "pick" ? STOCK_PICK_SCENE : SCENE_CONFIGS[activeScene]
  const promptKey = activeScene === "pick" ? "stockPick" : `${activeScene}${activeKind === "analysis" ? "Analysis" : "Score"}` as keyof typeof prompts
  const currentPromptText = prompts[promptKey]
  const defaultPromptText =
    activeScene === "pick" || activeKind === "analysis" ? currentSceneConfig.defaultAnalysis : currentSceneConfig.defaultScore
  const isCustomized = currentPromptText.trim() !== defaultPromptText.trim()

  function updateCurrentPrompt(value: string) {
    setPrompts((prev) => ({
      ...prev,
      [promptKey]: value,
    }))
  }

  function handleResetCurrentPrompt() {
    updateCurrentPrompt(defaultPromptText)
  }

  function handleResetCurrentScene() {
    if (activeScene === "pick") {
      updateCurrentPrompt(DEFAULT_STOCK_PICK_PROMPT)
      return
    }
    setPrompts((prev) => ({
      ...prev,
      [`${activeScene}Analysis`]: currentSceneConfig.defaultAnalysis,
      [`${activeScene}Score`]: currentSceneConfig.defaultScore,
    }))
  }

  function handleResetAllScenes() {
    setPrompts({
      lxszAnalysis: DEFAULT_ANALYSIS_PROMPT,
      lxszScore: DEFAULT_SCORE_PROMPT,
      ztAnalysis: DEFAULT_ZT_ANALYSIS_PROMPT,
      ztScore: DEFAULT_ZT_SCORE_PROMPT,
      jjztAnalysis: DEFAULT_JJZT_ANALYSIS_PROMPT,
      jjztScore: DEFAULT_JJZT_SCORE_PROMPT,
      stockPick: DEFAULT_STOCK_PICK_PROMPT,
    })
  }

  function insertVariable(varText: string) {
    const el = textareaRef.current
    if (!el) {
      updateCurrentPrompt(currentPromptText + varText)
      return
    }
    const start = el.selectionStart ?? currentPromptText.length
    const end = el.selectionEnd ?? currentPromptText.length
    const nextText = currentPromptText.substring(0, start) + varText + currentPromptText.substring(end)
    updateCurrentPrompt(nextText)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + varText.length, start + varText.length)
    }, 0)
  }

  async function handleTestConnection() {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, message: "请先填写 API Key" })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const msg = await testDeepseek({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      })
      setTestResult({ ok: true, message: msg || "连接成功！DeepSeek 接口响应正常" })
    } catch (e) {
      setTestResult({ ok: false, message: String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-label="设置与算法配置"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2>系统偏好与算法配置</h2>
            {settings?.hasDeepseekKey ? (
              <span className="badge" style={{ fontSize: 11, background: "var(--accent-bg)", color: "var(--accent)" }}>
                AI 就绪
              </span>
            ) : null}
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="关闭设置 (Esc)">
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
            抓取引擎
          </button>
          <button
            type="button"
            className={tab === "deepseek" ? "active" : ""}
            onClick={() => setTab("deepseek")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            DeepSeek 智能模型
            {apiKey.trim() || settings?.hasDeepseekKey ? " · 已配置" : ""}
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
            关于与版本
            {update?.available ? " · 有新版本" : ""}
          </button>
        </div>

        {tab === "crawl" ? (
          <div className="settings-pane">
            <p className="muted tip">
              内置抓取引擎自动采集同花顺连涨动能榜与东方财富实时行情，快照安全持久化存储在本机。
            </p>
            <label className="field">
              <span>最多抓取页数（0 为全部全量翻页）</span>
              <input
                type="number"
                min={0}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 0)}
              />
            </label>
            {settings?.cachePath ? (
              <details className="settings-help">
                <summary>本地快照缓存路径</summary>
                <p className="muted tip" style={{ wordBreak: "break-all" }}>{settings.cachePath}</p>
              </details>
            ) : null}
          </div>
        ) : tab === "deepseek" ? (
          <div className="settings-pane deepseek-settings-pane">
            {/* 模块1: 基础连接与模型配置 */}
            <div className="settings-section-card">
              <div className="section-card-header">
                <span className="section-card-title">🔑 接口凭据与模型接入</span>
                <span className="section-card-hint">
                  {apiKey.trim() ? "✅ API Key 已填写" : "⚠️ 需填写 Key 才能使用 AI 分析"}
                </span>
              </div>

              <label className="field">
                <span>DeepSeek API Key</span>
                <div className="field-inline">
                  <input
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? "隐藏 Key" : "显示明文 Key"}
                  >
                    {showKey ? "隐藏" : "显示"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleTestConnection()}
                    disabled={testing || !apiKey.trim()}
                    title="发送测试请求验证 API Key 与模型是否可用"
                  >
                    {testing ? "测试中…" : "测试连接"}
                  </button>
                </div>
              </label>

              {testResult ? (
                <div
                  className={`connection-test-banner ${testResult.ok ? "is-success" : "is-error"}`}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    marginBottom: 10,
                    background: testResult.ok ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${testResult.ok ? "var(--down-border)" : "var(--up-border)"}`,
                    color: testResult.ok ? "var(--down)" : "var(--up)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{testResult.ok ? "✓" : "✕"}</span>
                  <span>{testResult.message}</span>
                </div>
              ) : null}

              <div className="model-connection-grid">
                <label className="field" style={{ margin: 0 }}>
                  <span>API 接口地址 (Base URL)</span>
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com"
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>模型标识 (Model)</span>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="deepseek-chat"
                  />
                </label>
              </div>

              {/* 快速预设按钮群 */}
              <div className="model-quick-chips" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>常用预设：</span>
                <button
                  type="button"
                  className="quick-chip"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={() => {
                    setModel("deepseek-chat")
                    setBaseUrl("https://api.deepseek.com")
                  }}
                  title="DeepSeek V3 通用高速对话模型"
                >
                  ⚡️ deepseek-chat
                </button>
                <button
                  type="button"
                  className="quick-chip"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={() => {
                    setModel("deepseek-reasoner")
                    setBaseUrl("https://api.deepseek.com")
                  }}
                  title="DeepSeek R1 深度思考推理模型"
                >
                  🧠 deepseek-reasoner (深度推理)
                </button>
              </div>
            </div>

            {/* 模块2: 分场景提示词展示与编辑逻辑 */}
            <div className="settings-section-card" style={{ marginTop: 14 }}>
              <div className="section-card-header prompt-editor-heading" style={{ marginBottom: 8 }}>
                <div>
                  <span className="section-card-title">🎯 功能场景提示词配置</span>
                  <p className="section-card-sub" style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
                    分别配置个股分析、评分与当前筛选列表的 AI 选股偏好。
                  </p>
                </div>
                <div className="prompt-reset-actions">
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={handleResetCurrentScene}
                    title="将当前选中场景的提示词恢复为系统推荐设置"
                  >
                    恢复该场景默认
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={handleResetAllScenes}
                    title="恢复全部榜单及 AI 选股的默认提示词"
                  >
                    恢复全部默认
                  </button>
                </div>
              </div>

              {/* 场景选择切换器 */}
              <div className="prompt-scene-tabs" role="tablist" aria-label="提示词场景切换">
                {(Object.keys(SCENE_CONFIGS) as PromptScene[]).map((key) => {
                  const cfg = SCENE_CONFIGS[key]
                  const isActive = activeScene === key
                  const hasCustom =
                    prompts[`${key}Analysis` as keyof typeof prompts].trim() !== cfg.defaultAnalysis.trim() ||
                    prompts[`${key}Score` as keyof typeof prompts].trim() !== cfg.defaultScore.trim()
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`prompt-scene-tab ${isActive ? "active" : ""}`}
                      onClick={() => setActiveScene(key)}
                    >
                      <span className="scene-tab-name">{cfg.shortLabel}</span>
                      {hasCustom ? <span className="scene-modified-dot" title="已自定义" /> : null}
                    </button>
                  )
                })}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeScene === "pick"}
                  className={`prompt-scene-tab ${activeScene === "pick" ? "active" : ""}`}
                  onClick={() => { setActiveScene("pick"); setActiveKind("analysis") }}
                >
                  <span className="scene-tab-name">AI 选股</span>
                  {prompts.stockPick.trim() !== DEFAULT_STOCK_PICK_PROMPT.trim() ? <span className="scene-modified-dot" title="已自定义" /> : null}
                </button>
              </div>

              {/* 选中场景功能说明卡片 */}
              <div className="prompt-scene-guide">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="scene-guide-title">{currentSceneConfig.title}</span>
                    <span className={`badge ${currentSceneConfig.badgeClass}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                      {currentSceneConfig.badge}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: isCustomized ? "var(--gold)" : "var(--down)" }}>
                    {isCustomized ? "● 已自定义" : "✓ 系统默认"}
                  </span>
                </div>
                <p className="scene-guide-desc">{currentSceneConfig.description}</p>
                <div className="scene-guide-factors">
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>快照注入字段：</span>
                  {currentSceneConfig.dataFields.map((f) => (
                    <span key={f} className="factor-tag">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* 分析提示词 vs 评分提示词 切换 */}
              <div className="prompt-kind-switch" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                {activeScene === "pick" ? <strong className="scene-guide-title">选股提示词</strong> : (
                <div className="seg" role="group" aria-label="提示词类型切换">
                  <button
                    type="button"
                    className={activeKind === "analysis" ? "on" : ""}
                    onClick={() => setActiveKind("analysis")}
                  >
                    📝 短线盘面分析提示词
                  </button>
                  <button
                    type="button"
                    className={activeKind === "score" ? "on" : ""}
                    onClick={() => setActiveKind("score")}
                  >
                    🎯 0–100 评分模型提示词
                  </button>
                </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {currentPromptText.length} 字符
                  </span>
                  {isCustomized ? (
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "2px 7px", fontSize: 11 }}
                      onClick={handleResetCurrentPrompt}
                      title="重置当前选中的提示词为默认"
                    >
                      恢复默认
                    </button>
                  ) : null}
                </div>
              </div>

              {/* 动态可用变量插入工具条 */}
              <div className="prompt-variables-bar">
                <span className="var-hint">点击插入动态变量：</span>
                {activeScene === "pick" ? STOCK_PICK_VARIABLES.map(variable => (
                  <button key={variable.value} type="button" className="var-btn" onClick={() => insertVariable(variable.value)}>
                    <code>{variable.value}</code> {variable.label}
                  </button>
                )) : (<>
                <button
                  type="button"
                  className="var-btn"
                  onClick={() => insertVariable("{name}")}
                  title="插入股票简称（如 平安银行）"
                >
                  <code>{"{name}"}</code> 简称
                </button>
                <button
                  type="button"
                  className="var-btn"
                  onClick={() => insertVariable("{code}")}
                  title="插入股票代码（如 000001）"
                >
                  <code>{"{code}"}</code> 代码
                </button>
                <button
                  type="button"
                  className="var-btn"
                  onClick={() => insertVariable("{stock}")}
                  title="插入完整股票标识（如 平安银行 / 000001）"
                >
                  <code>{"{stock}"}</code> 标的
                </button>
                {activeKind === "score" ? (
                  <button
                    type="button"
                    className="var-btn highlight"
                    onClick={() => insertVariable("{analysis}")}
                    title="插入前序生成的短线分析正文供评分"
                  >
                    <code>{"{analysis}"}</code> 分析报告正文
                  </button>
                ) : (
                  <button
                    type="button"
                    className="var-btn"
                    onClick={() => insertVariable("【股票名称/代码：______】")}
                    title="插入标准填空槽位"
                  >
                    <code>______</code> 槽位
                  </button>
                )}
                </>)}
              </div>

              {/* 提示词多行编辑框 */}
              <label className="field" style={{ margin: "8px 0 0" }}>
                <textarea
                  ref={textareaRef}
                  className="prompt-box"
                  aria-label={activeScene === "pick" ? "AI 选股提示词" : `${currentSceneConfig.shortLabel}${activeKind === "analysis" ? "分析" : "评分"}提示词`}
                  rows={activeKind === "analysis" ? 9 : 7}
                  value={currentPromptText}
                  onChange={(e) => updateCurrentPrompt(e.target.value)}
                  placeholder="在此编辑提示词..."
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    width: "100%",
                  }}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="settings-pane about-pane">
            <div className="about-brand">
              <div className="about-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <div className="about-meta">
                <div className="about-title-row">
                  <h3>连涨天梯</h3>
                  <span className="about-version">v{current}</span>
                </div>
                <p className="about-subtitle">A 股强势动能连阳与涨停接力超短决策仪表盘</p>
              </div>
            </div>

            <div className="about-update-card">
              <div className="about-update-header">
                <div>
                  <strong>软件版本更新</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {updateChecking
                      ? "正在连接 GitHub 检测新版本…"
                      : update?.available
                        ? `发现新版本 v${latest}`
                        : "当前已是最新稳定版本"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={updateChecking}
                    onClick={onCheckUpdate}
                    title="立即检查 GitHub Releases 最新版本"
                  >
                    {updateChecking ? "检测中…" : "检查更新"}
                  </button>
                  {update?.available ? (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={updateInstalling}
                      onClick={onInstallUpdate}
                      title="打开安装包或下载新版本"
                    >
                      {updateInstalling ? "准备中…" : "立即升级"}
                    </button>
                  ) : null}
                </div>
              </div>
              {updateError ? (
                <div className="about-update-error" style={{ color: "var(--up)", fontSize: 12, marginTop: 8 }}>
                  更新检测失败: {updateError}（若提示文件已损坏，请重新从 Release 下载覆盖）
                </div>
              ) : null}
            </div>

            {/* 更新历史区块 (测试断言所需) */}
            <div className="about-history-section" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 650, fontSize: 13 }}>版本更新历史</span>
                {historyLoading ? <span className="muted" style={{ fontSize: 11 }}>加载中…</span> : null}
              </div>
              {historyError ? (
                <div className="muted" style={{ fontSize: 12, padding: "8px 0" }}>
                  获取更新历史失败: {historyError}
                </div>
              ) : history.length > 0 ? (
                <div className="about-history-list" style={{ maxHeight: 180, overflowY: "auto" }}>
                  {history.map((rel, idx) => (
                    <details
                      key={rel.version}
                      className="history-item"
                      open={shouldOpenRelease(rel, idx)}
                      style={{ padding: "6px 0", borderBottom: "1px dashed var(--border)" }}
                    >
                      <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <span style={{ fontWeight: 600, fontSize: 12.5 }}>v{rel.version}</span>
                        <time className="muted" style={{ fontSize: 11 }}>{formatReleaseDate(rel.publishedAt)}</time>
                      </summary>
                      {rel.notes ? (
                        <p className="muted" style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                          {rel.notes}
                        </p>
                      ) : null}
                    </details>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>暂无离线历史，可通过 listReleaseHistory 获取在线版本。</div>
              )}
            </div>
          </div>
        )}

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {tab === "deepseek"
              ? "配置保存在本机；分析时向所配置接口发送提示词和候选行情"
              : "配置修改后点击保存立即生效"}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => {
                void onSave({
                  maxPages,
                  deepseekApiKey: apiKey.trim(),
                  deepseekBaseUrl: baseUrl.trim(),
                  deepseekModel: model.trim(),
                  analysisPrompt: prompts.lxszAnalysis,
                  scorePrompt: prompts.lxszScore,
                  ztAnalysisPrompt: prompts.ztAnalysis,
                  ztScorePrompt: prompts.ztScore,
                  jjztAnalysisPrompt: prompts.jjztAnalysis,
                  jjztScorePrompt: prompts.jjztScore,
                  stockPickPrompt: prompts.stockPick,
                })
              }}
            >
              {saving ? "保存中…" : "保存配置"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
