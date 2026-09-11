# 同花顺连涨股票榜单

从同花顺「连续上涨」榜抓取数据，再叠加东方财富**当日行情**（现价、涨跌幅、今开高低、换手、成交额、市盈率、散户资金），并导出 CSV、JSON 或可交互 HTML 天梯页。符合精选规则的股票会额外写出一份列表。

本项目使用 [uv](https://docs.astral.sh/uv/) 管理 Python 版本与依赖。

## 环境要求

- [uv](https://docs.astral.sh/uv/)（推荐 0.9+）
- Python 3.11+（由 uv 按 `.python-version` 自动准备，无需手动安装）

## 安装

### 1. 安装 uv

macOS / Linux：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Windows（PowerShell）：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

安装完成后重新打开终端，执行 `uv --version` 确认可用。

### 2. 同步项目环境

在仓库根目录执行：

```bash
uv sync
```

该命令会：

- 使用 `.python-version` 中的 Python 3.11
- 创建 `.venv` 虚拟环境
- 按 `uv.lock` 安装锁定依赖（当前仅 `requests` 及其传递依赖）

## 使用

```bash
# 抓取全部页，默认写入 output/ 下的 HTML 天梯页
uv run gp

# 兼容旧入口
uv run python main.py

# 输出 JSON
uv run gp -f json -o output/output.json

# 输出 CSV，并限制最多抓取 1 页（便于试跑）
uv run gp -f csv -m 1

# 指定 HTML 输出路径
uv run gp -f html -o output/rankings.html
```

查看全部参数：

```bash
uv run gp -h
```

用浏览器打开生成的 `.html` 即可筛选行业、连涨天数、涨幅/换手区间，并查看精选高亮。

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `-f` / `--format` | 输出格式：`html`（默认）、`csv`、`json` |
| `-o` / `--output` | 输出文件路径。省略时写入 `output/lxsz_rankings_时间戳.html` |
| `-m` / `--max-pages` | 最多抓取页数。省略则一直翻页直到没有数据 |
| `--retail-min` | 散户指数下限（%）。CSV/JSON 直接过滤；HTML 作为默认筛选并参与精选 |
| `--retail-max` | 散户指数上限（%） |

## 输出说明

每次成功抓取后会写出两类文件：

1. **主结果**：由 `-f` 决定
   - `html`：带筛选与天梯分组的可视化页面
   - `csv`：UTF-8 BOM，可用 Excel 直接打开
   - `json`：UTF-8，字段与页面一致
2. **精选列表**：与主结果同目录，文件名为 `{主文件名}_selected.txt`，内容是 JSON 数组，例如 `["000001 平安银行", ...]`

主结果字段：

- 序号、股票代码、股票简称
- 收盘价 / 最高价 / 最低价
- 连涨天数、连续涨跌幅、累计换手率、所属行业
- 平均涨幅/天、平均换手/天（由连续涨跌幅、累计换手率除以连涨天数得到）
- 现价、今日涨跌幅、今开 / 今高 / 今低、今日换手率、成交额、行情时间（东方财富当日行情）
- 市盈率、散户指数、散户净额（随当日行情一并拉取）

## 散户指数

散户指数使用东方财富资金流向里的 **小单净流入占比（%）**：

- 正值：散户净买入
- 负值：散户净卖出
- 同时给出 **散户净额**（小单净流入金额，格式化为万/亿）

## 当天实时行情

脚本会在连涨榜之外，按股票代码批量请求东方财富行情：

| 字段 | 含义 |
| --- | --- |
| 现价 / 今日涨跌幅 | 当日最新价与涨跌幅 |
| 今开 / 今高 / 今低 | 当日开盘与高低 |
| 今日换手率 / 成交额 | 当日成交 |
| 散户指数 / 散户净额 | 当日小单净流入占比与金额 |
| 市盈率 | 动态市盈率 |
| 行情时间 | 该笔行情的更新时间 |

说明：

- **连涨天数、连续涨跌幅、榜单收盘价** 仍来自同花顺技术选股榜，按收盘统计，盘中一般不会把「今天还没收盘」算进连涨天数。
- **现价、今日涨跌幅、散户资金** 来自东方财富。交易时段走 delay 接口，大约延迟 1～3 分钟；收盘后即为当日收盘。
- HTML 卡片会同时显示「连涨累计涨跌幅」和「今 ±x% / 现价」。可用「今日涨跌幅区间」筛选，或按今日涨跌幅排序。

重新生成页面即可看到当天数据：

```bash
uv run python main.py -f html
```

### 页面筛选

- 下拉：全部 / 净流出 / -5%~0% / 0%~5% / 5%~10% / 10%+ / 净流入
- 自定义区间：填写最小、最大百分比
- 精选条件：可再设散户指数上下限，配合「仅显示精选股票」
- 排序：散户指数（高→低）
- URL 参数示例：`rankings.html?retail=out` 或 `rankings.html?retail=-5-0` 或 `rankings.html?retailMin=-3&retailMax=5`

自定义区间与下拉条件同时生效（取交集）。

### 命令行筛选

```bash
# HTML：页面打开时按 -5%～0% 过滤，精选列表也使用该区间
uv run python main.py -f html --retail-min -5 --retail-max 0

# 只保留散户净流入（JSON / CSV 直接删掉区间外的行）
uv run python main.py -f json --retail-min 0 -o output.json
```

口径说明：东方财富将「小单」视为散户委托（小于 2 万股或 4 万元）。该指标反映当日资金结构，不是股东户数。

## 精选规则

同时满足以下三条才会高亮，并写入精选列表：

| 指标 | 规则 |
| --- | --- |
| 散户指数 | **小于 -5%** |
| 当日换手率 | **小于 10%** |
| 平均日涨幅 | **大于 1%** |

平均日涨幅 = 连续涨跌幅 / 连涨天数。缺散户指数或当日换手率的股票不会入选。页面「精选条件」可改阈值；也可用 URL 覆盖：

```text
rankings.html?hlRetailMax=-5&hlTurnoverMax=10&hlAvgPctMin=1
```

## 日常维护

```bash
# 增加依赖
uv add <package>

# 移除依赖
uv remove <package>

# 升级已锁定依赖
uv lock --upgrade
uv sync

# 仅检查能否解析，不改环境
uv lock --check
```

不要把 `.venv` 提交进 Git。依赖以 `pyproject.toml` 声明、以 `uv.lock` 锁定。

## 项目结构

```text
.
├── main.py                 # 兼容入口
├── pyproject.toml
├── uv.lock
├── README.md
├── src/gp/                 # 业务代码
│   ├── cli.py              # 命令行
│   ├── crawl.py            # 同花顺榜单
│   ├── quotes.py           # 东方财富行情
│   ├── enrich.py           # 平均值与字段补充
│   ├── highlight.py        # 精选规则
│   ├── export.py           # CSV / JSON / HTML
│   ├── formatters.py
│   ├── constants.py
│   └── templates/ladder.html
├── tests/                  # 单元测试
└── output/                 # 抓取产物（不入库）
```

运行测试：

```bash
uv run python -m unittest discover -s tests -v
```

## 在线服务与 Docker 部署

启动 Web 服务后可直接用浏览器访问 `http://localhost:8000`。首次访问会要求输入密码，默认密码为 `uasier`。登录后的页面顶部有刷新按钮，会重新抓取同花顺榜单和东方财富行情并展示最新结果。

本地启动：

```bash
uv run gunicorn --bind 0.0.0.0:8000 --workers 1 gp.web:app
```

Docker 部署：

```bash
docker compose up -d --build
```

然后访问 `http://localhost:8000`。可在 `.env` 或运行参数中设置：

- `GP_HOST_PORT`：对外端口，默认 `8000`
- `GP_PASSWORD`：访问密码
- `GP_SECRET_KEY`：会话签名密钥
- `GP_MAX_PAGES`：每次抓取的页数上限
- `TZ`：容器时区，默认 `Asia/Shanghai`

## 注意事项

- 数据来自公开网页，需要能访问 `data.10jqka.com.cn` 与 `push2delay.eastmoney.com`（当日行情 / 散户指数）。
- 页面结构若变更，解析可能失败；可先加 `-m 1` 确认是否仍能抓到表格。
- 抓取产物默认在 `output/`，已写入 `.gitignore`。
