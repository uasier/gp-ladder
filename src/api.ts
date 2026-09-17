import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type {
  AnalyzeRequest,
  AnalyzeResult,
  AppLogEntry,
  ExportResult,
  RefreshEvent,
  RefreshSnapshot,
  SettingsPatch,
  SettingsView,
  Snapshot,
  BoardKind,
} from "./types"

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown
  isTauri?: boolean
}

export function detectTauri(globalObj: {
  window?: { __TAURI_INTERNALS__?: unknown; isTauri?: boolean }
}): boolean {
  const w = globalObj.window
  return w != null && (w.__TAURI_INTERNALS__ != null || w.isTauri === true)
}

export function isTauri(): boolean {
  return detectTauri(globalThis as { window?: TauriWindow })
}

export function parseApiError(status: number, text: string): string {
  try {
    const data = JSON.parse(text) as { error?: unknown }
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error
    }
  } catch {
    // 非 JSON 响应
  }
  const trimmed = text.trim()
  return trimmed || `HTTP ${status}`
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!res.ok) throw new Error(parseApiError(res.status, text))
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function getSnapshot(board: BoardKind = "lxsz") {
  if (isTauri()) return invoke<Snapshot>("get_snapshot", { board })
  return http<Snapshot>(`/api/snapshot?board=${board}`)
}

export function startRefresh(board: BoardKind = "lxsz") {
  if (isTauri()) return invoke<void>("start_refresh", { board })
  return http<void>(`/api/refresh/start?board=${board}`, { method: "POST" })
}

export function cancelRefresh() {
  if (isTauri()) return invoke<void>("cancel_refresh")
  return http<void>("/api/refresh/cancel", { method: "POST" })
}

export function getRefreshSnapshot() {
  if (isTauri()) return invoke<RefreshSnapshot>("get_refresh_snapshot")
  return http<RefreshSnapshot>("/api/refresh/snapshot")
}

export function onRefreshEvent(handler: (event: RefreshEvent) => void): Promise<UnlistenFn> {
  if (isTauri()) {
    return listen<RefreshEvent>("refresh-event", (e) => handler(e.payload))
  }
  return Promise.resolve(() => undefined)
}

export function getSettings() {
  if (isTauri()) return invoke<SettingsView>("get_settings")
  return http<SettingsView>("/api/settings")
}

export function saveSettings(patch: SettingsPatch) {
  if (isTauri()) return invoke<SettingsView>("save_settings", { patch })
  return http<SettingsView>("/api/settings", {
    method: "POST",
    body: JSON.stringify(patch),
  })
}

export function probeRuntime() {
  if (isTauri()) return invoke<SettingsView>("probe_runtime")
  return http<SettingsView>("/api/runtime")
}

export function exportSnapshot(format: string, path: string, board: BoardKind = "lxsz") {
  if (isTauri()) return invoke<ExportResult>("export_snapshot", { format, path, board })
  return http<ExportResult>("/api/export", {
    method: "POST",
    body: JSON.stringify({ format, path, board }),
  })
}

export function analyzeStock(request: AnalyzeRequest) {
  if (isTauri()) return invoke<AnalyzeResult>("analyze_stock", { request })
  return http<AnalyzeResult>("/api/analyze", {
    method: "POST",
    body: JSON.stringify(request),
  })
}

export function getAppLogs(limit = 500) {
  if (isTauri()) return invoke<AppLogEntry[]>("get_app_logs", { limit })
  return http<AppLogEntry[]>(`/api/logs?limit=${limit}`)
}

export async function getAppLogPath() {
  if (isTauri()) return invoke<string>("get_app_log_path")
  const data = await http<{ path: string }>("/api/logs/path")
  return data.path
}

export function writeAppLog(level: string, source: string, message: string) {
  if (isTauri()) return invoke<void>("write_app_log", { level, source, message })
  return http<void>("/api/logs", {
    method: "POST",
    body: JSON.stringify({ level, source, message }),
  })
}

export async function revealAppLog() {
  if (isTauri()) return invoke<string>("reveal_app_log")
  const data = await http<{ path: string }>("/api/logs/reveal", { method: "POST" })
  return data.path
}

export function onAppLog(handler: (entry: AppLogEntry) => void): Promise<UnlistenFn> {
  if (isTauri()) {
    return listen<AppLogEntry>("app-log", (e) => handler(e.payload))
  }
  let lastTs = 0
  let primed = false
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      const rows = await getAppLogs(80)
      if (!primed) {
        primed = true
        for (const entry of rows) {
          if (entry.ts > lastTs) lastTs = entry.ts
        }
        return
      }
      for (const entry of rows) {
        if (entry.ts > lastTs) {
          lastTs = entry.ts
          handler(entry)
        }
      }
    } catch {
      // 轮询失败时保持静默
    }
  }
  void tick()
  const id = window.setInterval(() => {
    void tick()
  }, 800)
  return Promise.resolve(() => {
    stopped = true
    window.clearInterval(id)
  })
}
