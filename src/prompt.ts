import stockPickPrompt from "../src-tauri/prompts/stock-pick.txt?raw"

export const DEFAULT_STOCK_PICK_PROMPT = stockPickPrompt

export const DEFAULT_ANALYSIS_PROMPT = `你是短线交易研究员，只看未来 1–5 个交易日。请针对【股票名称/代码：______】给出可执行的短线盘面判断。优先使用文末【行情快照】里的连涨天数、涨幅、换手、散户指数、现价；不够的再补公开信息。

写作原则：
- 短线视角：看动能、量价、位置、题材热度、隔日风险，不写长期投资故事。
- 先结论、后证据。每条最多两句话。
- 关键价位和百分比加 **加粗**。
- 事实与观点分开；观点前写「判断：」。
- 查不到写「未查到公开信息」，禁止编造和套话。

必须按下面 Markdown 结构输出，不要增减标题：

## 短线结论
一句话：未来 1–5 日更像追高、持有观察，还是回避。点明最大顾虑。

## 操作要点
- 三条最要紧的短线要点，每条不超过 22 字

## 一、盘面与动能
1. 连涨节奏：连涨天数、累计涨幅、今日涨跌，是加速还是乏力
2. 量能换手：今日换手和成交额是否配合，有无天量见顶迹象
3. 散户情绪：散户指数方向，更像主力吸筹还是散户接盘

## 二、位置与博弈
4. 支撑压力：给出 1–2 个短线关键价位及依据
5. 板块效应：所属行业是否当周热点，有没有领涨龙
6. 短线筹码：龙虎榜、明显减持或砸盘风险（没有就写未查到）

## 三、催化与持续性
7. 近端催化：1–2 周内有无消息、政策、事件
8. 炒作阶段：新启动、主升，还是尾声

## 四、隔日风险
9. 追高回撤：连涨后可能的回撤空间
10. 流动性：换手是否过高、是否容易砸盘或跌停
11. 突发扰动：停牌、立案、异常波动公告

## 操作计划
- 买点：
- 止损：
- 目标：
- 不宜做：

## 短线风险提示
- 最需要警惕的 2–3 个点，短句`

export const DEFAULT_SCORE_PROMPT = `你是短线交易评分模型。请只根据下面这份短线要点，对【{name} / {code}】打 0–100 分。分数代表「未来 1–5 日的短线可操作性」，不是长期投资价值。

规则：
- 先看隔日硬伤（立案、停牌、跌停风险），再看量价是否配合，最后看位置和题材热度。
- 连涨过热、天量、散户大幅流入、明显追高，分数应低于 60。
- 有立案、停牌、异常波动监管等硬伤，分数必须低于 40。
- 量价健康、有支撑、板块仍热，可以给 70 以上。
- reason 只写最关键的一句，不超过 28 字。

只输出 JSON：
{"score": 0, "label": "不宜追高|谨慎参与|可关注|短线活跃", "reason": "一句理由"}

短线要点：
{analysis}`

export const DEFAULT_ZT_ANALYSIS_PROMPT = `你是涨停板短线研究员，只看次日溢价与连板接力（未来 1–3 个交易日）。请针对【股票名称/代码：______】给出涨停板复盘与接力博弈判断。优先使用文末【行情快照】里的连板天数、封板资金、首次封板时间、最后封板时间、炸板次数、今日换手率、散户指数、现价；不够的再补公开题材信息。

写作原则：
- 聚焦超短打板与连板接力博弈：看连板梯队地位、封板硬度、炸板回封成色、次日开盘预期。不写长期投资故事。
- 先结论、后证据。每条最多两句话。关键价位、时间点和百分比加 **加粗**。
- 查不到写「未查到公开信息」，禁止编造。

必须按下面 Markdown 结构输出，不要增减标题：

## 短线结论
一句话：该板属于核心强势板、跟风板还是勉强烂板，次日更可能高溢价连板、冲高获利了结还是低开防砸。

## 操作要点
- 三条最要紧的接力要点，每条不超过 22 字

## 一、板型与封单质量
1. 连板身位：是首板启动、中位接力还是空间高标，在所属题材中是否领涨龙头
2. 封板硬度：首次封板时间早晚（早盘秒板还是尾盘偷袭），封板资金额与流通市值比例
3. 炸板博弈：有无炸板、炸板次数，回封是否果断放量

## 二、板块共振与情绪周期
4. 板块效应：同题材涨停梯队数量，是否有首板助攻和小弟跟随
5. 散户情绪：散户指数是主力净流出散户接盘，还是主力资金强势主导

## 三、次日预案与博弈
6. 竞价开盘预期：次日健康开盘区间（一字、高开还是平开）及量能要求
7. 分歧接力点：若盘中开板回踩，何种承接可以考虑接力

## 操作计划
- 买点：
- 止损：
- 目标：
- 不宜做：

## 短线风险提示
- 最需要警惕的 2–3 个点（例如特停监管、中位股核按钮、炸板大面等），短句`

export const DEFAULT_ZT_SCORE_PROMPT = `你是「涨停连板接力」评分模型。请只根据下面涨停板分析要点，对【{name} / {code}】打 0–100 分。分数代表「次日连板接力与溢价的可操作性」，不是长期投资价值。

规则：
- 早盘快速封死、大额封单、题材总龙头、零炸板，可给 75–95 分。
- 多次炸板、尾盘勉强封死、中位跟风杂毛、散户大幅接盘，应低于 60 分。
- 有停牌核查风险、立案雷点、跌停砸盘先例，必须低于 40 分。
- reason 只写最关键的一句，不超过 28 字。

只输出 JSON：
{"score": 0, "label": "不宜接力|谨慎参与|可关注|强势连板", "reason": "一句理由"}

涨停要点：
{analysis}`

export const DEFAULT_JJZT_ANALYSIS_PROMPT = `你是短线研究员。标的是【股票名称/代码：______】：昨天涨停，今天集合竞价结束后红盘，涨幅落在 2%–8%。请判断「昨强今不追高、能否弱转强」。优先使用文末【行情快照】里的今开涨幅、今日涨跌幅、昨连板、换手、散户指数、现价。

写作原则：
- 只看竞价后到午前的承接，不写年报故事。
- 先结论后证据，每条最多两句话。关键价位和百分比加 **加粗**。
- 查不到写「未查到公开信息」，禁止编造。

必须按下面 Markdown 结构输出：

## 短线结论
一句话：2%–8% 红盘是健康高开还是冲高乏力，今天更像弱转强还是诱多。

## 操作要点
- 三条，每条不超过 22 字

## 一、竞价与高开
1. 今开涨幅：是否落在 2%–8%，偏下限还是上限
2. 红盘质量：开盘后有没有立刻回落变绿
3. 量能：换手和成交是否够承接昨日涨停

## 二、昨日连板与情绪
4. 昨连板：首板还是高位，今日溢价是否匹配
5. 散户方向：更像资金回流还是散户接力
6. 板块：同板块昨日涨停今天是否一起红

## 三、日内博弈
7. 回踩买点：高开后回踩今开/均价是否可做
8. 冲高风险：靠近 8% 后是否容易回吐

## 操作计划
- 买点：
- 止损：
- 目标：
- 不宜做：

## 短线风险提示
- 2–3 个最要紧的点`

export const DEFAULT_JJZT_SCORE_PROMPT = `你是「昨涨停、今开 2%–8% 红盘」评分模型。请只根据下面要点，对【{name} / {code}】打 0–100 分。分数代表今天弱转强的可操作性。

规则：
- 今开 3%–6%、量能承接好、低位首板次日，可以 70 以上。
- 今开靠近 8%、高位连板次日、散户大幅流入，低于 60。
- 开盘后迅速回落、量能萎缩，低于 50。
- reason 不超过 28 字。

只输出 JSON：
{"score": 0, "label": "不宜追高|谨慎参与|可关注|短线活跃", "reason": "一句理由"}

要点：
{analysis}`

export type PromptScene = "lxsz" | "zt" | "jjzt"
export type PromptEditorScene = PromptScene | "pick"
export type PromptKind = "analysis" | "score"

export type SceneConfig = {
  key: PromptScene
  title: string
  shortLabel: string
  badge: string
  badgeClass: string
  description: string
  dataFields: string[]
  defaultAnalysis: string
  defaultScore: string
}

export const STOCK_PICK_SCENE = {
  title: "AI 快速选股",
  shortLabel: "AI 选股",
  badge: "当前筛选",
  badgeClass: "badge-lxsz",
  description: "比较当前页面筛选后的全部股票，推荐最多 4 只短线观察候选。候选较多时分组比较后汇总；此提示词适用于三个榜单。",
  dataFields: ["当前筛选列表", "所属榜单", "行情时间", "量比", "涨跌幅", "换手率", "散户指数"],
  defaultAnalysis: DEFAULT_STOCK_PICK_PROMPT,
  defaultScore: "",
}

export const STOCK_PICK_VARIABLES = [
  { value: "{scene}", label: "当前榜单" },
  { value: "{count}", label: "本组候选数" },
  { value: "{limit}", label: "推荐数量" },
  { value: "{quoteTime}", label: "行情时间" },
  { value: "{stocks}", label: "候选行情列表" },
] as const

export const SCENE_CONFIGS: Record<PromptScene, SceneConfig> = {
  lxsz: {
    key: "lxsz",
    title: "连涨天梯 (LXSZ)",
    shortLabel: "连涨模型",
    badge: "动能连阳",
    badgeClass: "badge-lxsz",
    description: "专用于连涨天数梯队分析，评估多日连阳标的量价匹配度、动能加速或乏力、以及散户接盘风险。",
    dataFields: ["连涨天数", "连续涨跌幅", "累计换手率", "今日涨跌幅", "散户指数", "现价"],
    defaultAnalysis: DEFAULT_ANALYSIS_PROMPT,
    defaultScore: DEFAULT_SCORE_PROMPT,
  },
  zt: {
    key: "zt",
    title: "涨停天梯 (ZT)",
    shortLabel: "涨停接力",
    badge: "连板硬度",
    badgeClass: "badge-zt",
    description: "专用于涨停池梯队复盘与次日接力博弈，评估封板资金硬度、炸板成色、连板身位与次日高溢价连板几率。",
    dataFields: ["连板天数", "封板资金", "首次封板", "最后封板", "炸板次数", "换手率", "散户指数"],
    defaultAnalysis: DEFAULT_ZT_ANALYSIS_PROMPT,
    defaultScore: DEFAULT_ZT_SCORE_PROMPT,
  },
  jjzt: {
    key: "jjzt",
    title: "昨日涨停 · 竞价红盘 (JJZT)",
    shortLabel: "弱转强红盘",
    badge: "竞价高开",
    badgeClass: "badge-jjzt",
    description: "专用于昨天涨停、今日集合竞价后开盘红盘 2%–8% 标的，研判早盘开盘承接与昨强今弱转强博弈。",
    dataFields: ["今开涨幅", "今日涨跌幅", "昨日连板", "今日换手率", "散户指数", "现价"],
    defaultAnalysis: DEFAULT_JJZT_ANALYSIS_PROMPT,
    defaultScore: DEFAULT_JJZT_SCORE_PROMPT,
  },
}
