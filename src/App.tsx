import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  analyzeStock,
  cancelRefresh,
  exportSnapshot,
  getRefreshSnapshot,
  getSettings,
  getSnapshot,
  isTauri,
  onRefreshEvent,
  probeRuntime,
  saveSettings,
  startRefresh,
  writeAppLog,
} from "./api"
import { AnalyzeFloat } from "./components/AnalyzeFloat"
import { DayPills } from "./components/DayPills"
import { FilterBar } from "./components/FilterBar"
import { IndustryPills } from "./components/IndustryPills"
import { KpiGrid } from "./components/KpiGrid"
import { Ladder } from "./components/Ladder"
import { LogPanel } from "./components/LogPanel"
import { MoreFilters } from "./components/MoreFilters"
import { QuickChips } from "./components/QuickChips"
import { RefreshBanner } from "./components/RefreshBanner"
import { SettingsModal } from "./components/SettingsModal"
import { StockContextMenu } from "./components/StockContextMenu"
import { StockDrawer } from "./components/StockDrawer"
import { Toolbar } from "./components/Toolbar"
import { downloadText, rowsToCsv, rowsToJson, timestampName } from "./files"
import { filterAndSort, hasActiveFilters, topIndustries, uniqueDays } from "./stock"
import {
  DEFAULT_FILTERS,
  DEFAULT_HIGHLIGHT,
  EMPTY_SNAPSHOT,
  ZT_FILTERS,
  type FilterState,
  type AnalyzeResult,
  type HighlightRule,
  type BoardKind,
  type SettingsView,
  type Snapshot,
  type StockRow,
} from "./types"

const THEME_KEY = "gp_theme_pref"

function preferredTheme(): "dark" | "light" {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === "light" || saved === "dark") return saved
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark"
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(preferredTheme)
  const [board, setBoard] = useState<BoardKind>("lxsz")
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [lxszFilters, setLxszFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [ztFilters, setZtFilters] = useState<FilterState>(ZT_FILTERS)
  const [jjztFilters, setJjztFilters] = useState<FilterState>(ZT_FILTERS)
  const filters = board === "zt" ? ztFilters : board === "jjzt" ? jjztFilters : lxszFilters
  const setFilters =
    board === "zt" ? setZtFilters : board === "jjzt" ? setJjztFilters : setLxszFilters
  const [rule, setRule] = useState<HighlightRule>(DEFAULT_HIGHLIGHT)
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [banner, setBanner] = useState<{ text: string; tone: "busy" | "success" | "error" | null }>({
    text: "",
    tone: null,
  })
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; item: StockRow } | null>(null)
  const [analyzeOpen, setAnalyzeOpen] = useState(false)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null)
  const [analyzeTitle, setAnalyzeTitle] = useState("")
  const analyzeTarget = useRef<StockRow | null>(null)
  const keywordRef = useRef<HTMLInputElement>(null)
  const activeSession = useRef(0)
  const bannerTimer = useRef<number | null>(null)
  const boardRef = useRef(board)
  boardRef.current = board

  const filtered = useMemo(
    () => filterAndSort(snapshot.rows, filters, rule),
    [snapshot.rows, filters, rule],
  )
  const days = useMemo(() => uniqueDays(snapshot.rows), [snapshot.rows])
  const dayCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const item of filtered) {
      const day = Number(item["连涨天数"]) || 0
      counts[day] = (counts[day] ?? 0) + 1
    }
    return counts
  }, [filtered])
  const industries = useMemo(() => topIndustries(snapshot.rows), [snapshot.rows])
  const selected = useMemo(
    () => snapshot.rows.find((row) => row["股票代码"] === selectedCode) ?? null,
    [snapshot.rows, selectedCode],
  )

  const showBanner = useCallback((text: string, tone: "busy" | "success" | "error" | null) => {
    if (bannerTimer.current != null) window.clearTimeout(bannerTimer.current)
    setBanner({ text, tone })
    if (tone === "success") {
      bannerTimer.current = window.setTimeout(() => setBanner({ text: "", tone: null }), 1800)
    }
  }, [])

  const loadSnapshot = useCallback(async (kind: BoardKind) => {
    const data = await getSnapshot(kind)
    setSnapshot({
      rows: data.rows ?? [],
      updatedAt: data.updatedAt ?? null,
      count: data.count ?? data.rows?.length ?? 0,
      maxDays: data.maxDays ?? 0,
      quoteAt: data.quoteAt ?? null,
      industries: data.industries ?? [],
    })
    return data
  }, [])

  const loadSettings = useCallback(async () => {
    const view = await getSettings().catch(() => probeRuntime())
    setSettings(view)
    await writeAppLog("info", "ui", `内置抓取引擎已就绪  v${view.version}  cache=${view.cachePath}`)
    return view
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadSettings()
        if (!cancelled) await loadSnapshot("lxsz")
      } catch (e) {
        if (!cancelled) setBootError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadSettings, loadSnapshot])

  useEffect(() => {
    const unlisten = onRefreshEvent(async (event) => {
      if (event.sessionId && event.sessionId < activeSession.current) return
      if (event.phase === "running") {
        setRefreshing(true)
        showBanner(event.progress || "正在刷新…", "busy")
      } else if (event.phase === "done") {
        const data = await loadSnapshot(boardRef.current)
        setRefreshing(false)
        showBanner(event.progress || `已更新 ${data.count} 只`, "success")
      } else if (event.phase === "error") {
        setRefreshing(false)
        showBanner(event.error || "刷新失败", "error")
      } else if (event.phase === "cancelled") {
        setRefreshing(false)
        showBanner("已取消", "error")
      }
    })
    return () => {
      unlisten.then((fn) => fn()).catch(() => undefined)
    }
  }, [loadSnapshot, showBanner])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA"
      if (e.key === "Escape") setSelectedCode(null)
      if (typing) return
      if (e.key === "/") {
        e.preventDefault()
        keywordRef.current?.focus()
        keywordRef.current?.select()
      }
      if (e.key === "1") setFilters((cur) => ({ ...cur, viewMode: "cards" }))
      if (e.key === "2") setFilters((cur) => ({ ...cur, viewMode: "list" }))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function pollUntilSettled() {
    const started = await getRefreshSnapshot()
    activeSession.current = started.sessionId
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      const status = await getRefreshSnapshot()
      if (status.sessionId !== started.sessionId) return
      if (status.progress) showBanner(status.progress, "busy")
      if (status.phase === "done") {
        const data = await loadSnapshot(boardRef.current)
        setRefreshing(false)
        showBanner(status.progress || `已更新 ${data.count} 只`, "success")
        return
      }
      if (status.phase === "error") {
        setRefreshing(false)
        showBanner(status.error || "刷新失败", "error")
        return
      }
      if (status.phase === "cancelled") {
        setRefreshing(false)
        showBanner("已取消", "error")
        return
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    setRefreshing(false)
    showBanner("刷新超时，请稍后重试", "error")
  }

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    showBanner(
      board === "jjzt"
        ? "正在抓取昨日涨停今红…"
        : board === "zt"
          ? "正在抓取涨停天梯…"
          : "正在抓取同花顺连涨榜…",
      "busy",
    )
    try {
      await startRefresh(board)
      if (!isTauri()) await pollUntilSettled()
    } catch (e) {
      setRefreshing(false)
      showBanner(String(e), "error")
      await writeAppLog("error", "ui", `刷新失败: ${String(e)}`)
    }
  }

  async function handleCancel() {
    try {
      await cancelRefresh()
    } catch (e) {
      await writeAppLog("error", "ui", `取消失败: ${String(e)}`)
    }
  }

  async function handleExport(format: "html" | "csv" | "json") {
    try {
      if (format === "csv") {
        downloadText(timestampName("csv"), rowsToCsv(snapshot.rows), "text/csv;charset=utf-8")
        await writeAppLog("info", "ui", `已导出 CSV ${snapshot.count} 只`)
        return
      }
      if (format === "json") {
        downloadText(timestampName("json"), rowsToJson(snapshot.rows), "application/json;charset=utf-8")
        await writeAppLog("info", "ui", `已导出 JSON ${snapshot.count} 只`)
        return
      }
      let path: string | null = timestampName("html")
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog")
        const selected = await save({
          defaultPath: timestampName("html"),
          filters: [{ name: "HTML", extensions: ["html"] }],
        })
        path = typeof selected === "string" ? selected : null
      } else {
        path = window.prompt("HTML 导出路径", path)
      }
      if (!path) return
      const result = await exportSnapshot("html", path, board)
      await writeAppLog("info", "ui", `已导出 HTML ${result.count} 只 → ${result.path}`)
      showBanner(`已导出 ${result.count} 只`, "success")
    } catch (e) {
      showBanner(String(e), "error")
      await writeAppLog("error", "ui", `导出失败: ${String(e)}`)
    }
  }

  async function handleAnalyze(item: StockRow) {
    const code = (item["股票代码"] || "").trim()
    const name = (item["股票简称"] || "").trim()
    analyzeTarget.current = item
    setMenu(null)
    if (!settings?.hasDeepseekKey && !settings?.deepseekApiKey) {
      setSettingsOpen(true)
      showBanner("请先在设置中填写 DeepSeek API Key", "error")
      return
    }
    setAnalyzeTitle(`${name || "未命名"} ${code}`.trim())
    setAnalyzeOpen(true)
    setAnalyzeLoading(true)
    setAnalyzeError(null)
    setAnalyzeResult(null)
    try {
      const result = await analyzeStock({ code, name, facts: item, scene: board })
      setAnalyzeResult(result)
      await writeAppLog(
        "info",
        "ui",
        `DeepSeek 分析完成 ${code}  score=${result.score ?? "-"}`,
      )
    } catch (e) {
      const message = String(e)
      setAnalyzeError(message)
      await writeAppLog("error", "ui", `DeepSeek 分析失败: ${message}`)
    } finally {
      setAnalyzeLoading(false)
    }
  }

  return (
    <div className="shell">
      <div className="page-scroll">
        <div className="app">
          <Toolbar
            settings={settings}
            board={board}
            onBoardChange={(next) => {
              if (next === board) return
              setBoard(next)
              setSelectedCode(null)
              void loadSnapshot(next).catch((e) => showBanner(String(e), "error"))
            }}
            updatedAt={snapshot.updatedAt}
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            onCancel={() => void handleCancel()}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={(fmt) => void handleExport(fmt)}
            theme={theme}
            onToggleTheme={() => setTheme((cur) => (cur === "dark" ? "light" : "dark"))}
          />
          {bootError ? <div className="refresh-banner is-visible is-error">{bootError}</div> : null}
          <RefreshBanner text={banner.text} tone={banner.tone} />
          <KpiGrid snapshot={snapshot} board={board} />
          <FilterBar
            filters={filters}
            industries={snapshot.industries}
            visible={filtered.length}
            total={snapshot.count}
            showReset={hasActiveFilters(filters)}
            onChange={(patch) => setFilters((cur) => ({ ...cur, ...patch }))}
            onReset={() => setFilters(board === "lxsz" ? DEFAULT_FILTERS : ZT_FILTERS)}
            keywordRef={keywordRef}
          />
          <QuickChips filters={filters} onChange={(patch) => setFilters((cur) => ({ ...cur, ...patch }))} />
          <div className="days-section">
            <DayPills
              days={days}
              counts={dayCounts}
              total={filtered.length}
              exactDay={filters.exactDay}
              unit={board === "lxsz" ? "天" : "板"}
              allLabel={board === "lxsz" ? "全部天数" : "全部连板"}
              onSelect={(day) => setFilters((cur) => ({ ...cur, exactDay: day }))}
            />
            <IndustryPills
              items={industries}
              current={filters.industry}
              onSelect={(name) => setFilters((cur) => ({ ...cur, industry: name }))}
            />
          </div>
          <MoreFilters
            filters={filters}
            rule={rule}
            onChange={(patch) => setFilters((cur) => ({ ...cur, ...patch }))}
            onRuleChange={(patch) => setRule((cur) => ({ ...cur, ...patch }))}
          />
          <main>
            <Ladder
              rows={snapshot.rows}
              filtered={filtered}
              viewMode={filters.viewMode}
              rule={rule}
              selectedCode={selectedCode}
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              onReset={() => setFilters(board === "lxsz" ? DEFAULT_FILTERS : ZT_FILTERS)}
              onSelect={setSelectedCode}
              onContextStock={(item, x, y) => setMenu({ x, y, item })}
              board={board}
            />
          </main>
        </div>
      </div>
      <StockDrawer item={selected} rule={rule} onClose={() => setSelectedCode(null)} />
      {menu ? (
        <StockContextMenu
          x={menu.x}
          y={menu.y}
          name={menu.item["股票简称"] || ""}
          code={menu.item["股票代码"] || ""}
          onClose={() => setMenu(null)}
          onDetail={() => {
            setSelectedCode(menu.item["股票代码"])
            setMenu(null)
          }}
          onAnalyze={() => void handleAnalyze(menu.item)}
          analyzeLabel={board === "jjzt" ? "昨涨今红分析" : "短线分析"}
        />
      ) : null}
      <AnalyzeFloat
        open={analyzeOpen}
        loading={analyzeLoading}
        error={analyzeError}
        result={analyzeResult}
        title={analyzeTitle}
        onClose={() => setAnalyzeOpen(false)}
        onRetry={() => {
          const item = analyzeTarget.current
          if (item) void handleAnalyze(item)
        }}
      />
      <LogPanel open={logOpen} onToggle={() => setLogOpen((v) => !v)} />
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        saving={settingsSaving}
        onClose={() => setSettingsOpen(false)}
        onSave={async (patch) => {
          setSettingsSaving(true)
          try {
            const view = await saveSettings(patch)
            setSettings(view)
            setSettingsOpen(false)
            await writeAppLog("info", "ui", "设置已保存")
          } catch (e) {
            await writeAppLog("error", "ui", `保存设置失败: ${String(e)}`)
          } finally {
            setSettingsSaving(false)
          }
        }}
      />
    </div>
  )
}
