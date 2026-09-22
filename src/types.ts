export type StockRow = Record<string, string>

export type BoardKind = "lxsz" | "zt" | "jjzt"

export type Snapshot = {
  rows: StockRow[]
  updatedAt: string | null
  count: number
  maxDays: number
  quoteAt: string | null
  industries: string[]
}

export type RefreshSnapshot = {
  sessionId: number
  phase: "idle" | "running" | "done" | "error" | "cancelled" | string
  progress: string
  error: string | null
  seq: number
}

export type RefreshEvent = {
  sessionId: number
  phase: string
  progress: string
  error: string | null
}

export type SettingsView = {
  found: boolean
  builtin: boolean
  maxPages: number
  cachePath: string
  version: string
  hasDeepseekKey: boolean
  deepseekApiKey: string
  deepseekBaseUrl: string
  deepseekModel: string
  analysisPrompt: string
  scorePrompt: string
}

export type SettingsPatch = {
  maxPages?: number
  deepseekApiKey?: string
  deepseekBaseUrl?: string
  deepseekModel?: string
  analysisPrompt?: string
  scorePrompt?: string
}

export type AnalyzeRequest = {
  code: string
  name: string
  facts: StockRow
  scene?: BoardKind
}

export type AnalyzeResult = {
  code: string
  name: string
  analysis: string
  score: number | null
  scoreLabel: string | null
  scoreReason: string | null
  model: string
}

export type ExportResult = {
  path: string
  selectedPath: string
  count: number
  selected: number
  format: string
}

export type AppLogEntry = {
  ts: number
  level: string
  source: string
  message: string
}

export type UpdateCheck = {
  currentVersion: string
  latestVersion: string
  available: boolean
  name: string
  notes: string
  htmlUrl: string
  assetName: string
  assetUrl: string
  repo: string
}

export type ReleaseInfo = {
  version: string
  name: string
  notes: string
  publishedAt: string
  htmlUrl: string
  prerelease: boolean
  current: boolean
  latest: boolean
}

export type HighlightRule = {
  retailMax: number
  todayTurnoverMax: number
  avgPctMin: number
}

export type ViewMode = "cards" | "list"

export type SortKey =
  | "days"
  | "pct"
  | "todayPct"
  | "avgPct"
  | "avgTurnover"
  | "retail"
  | "price"
  | "close"

export type FilterState = {
  keyword: string
  industry: string
  pctRange: string
  turnoverRange: string
  pctTotalMin: number | null
  pctTotalMax: number | null
  todayPctMin: number | null
  todayPctMax: number | null
  priceRange: string
  priceMin: number | null
  priceMax: number | null
  turnTotalMin: number | null
  turnTotalMax: number | null
  retailRange: string
  retailMin: number | null
  retailMax: number | null
  minDays: number
  exactDay: number | null
  sort: SortKey
  excludeSt: boolean
  onlyHighlight: boolean
  nearDayHigh: boolean
  viewMode: ViewMode
}

export const DEFAULT_HIGHLIGHT: HighlightRule = {
  retailMax: -5,
  todayTurnoverMax: 10,
  avgPctMin: 1,
}

export const DEFAULT_FILTERS: FilterState = {
  keyword: "",
  industry: "all",
  pctRange: "all",
  turnoverRange: "all",
  pctTotalMin: null,
  pctTotalMax: null,
  todayPctMin: null,
  todayPctMax: null,
  priceRange: "all",
  priceMin: null,
  priceMax: null,
  turnTotalMin: null,
  turnTotalMax: null,
  retailRange: "all",
  retailMin: null,
  retailMax: null,
  minDays: 0,
  exactDay: null,
  sort: "days",
  excludeSt: true,
  onlyHighlight: true,
  nearDayHigh: false,
  viewMode: "cards",
}

export const ZT_FILTERS: FilterState = {
  ...DEFAULT_FILTERS,
  onlyHighlight: false,
}

export const EMPTY_SNAPSHOT: Snapshot = {
  rows: [],
  updatedAt: null,
  count: 0,
  maxDays: 0,
  quoteAt: null,
  industries: [],
}
