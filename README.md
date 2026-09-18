# 连涨天梯

桌面工作台：从同花顺抓取连续上涨榜，叠加东方财富当日行情（现价、涨跌幅、今开高低、换手、成交额、市盈率、散户资金），在窗口里筛选、精选并导出。

抓取在软件内部完成，不依赖本机 Python、uv 或仓库脚本。打开只读本地快照；点击「刷新实时数据」才会联网。

## 下载

从 [GitHub Releases](https://github.com/uasier/gp-ladder/releases) 获取安装包：

- macOS：`gp-ladder_*_aarch64.dmg`（Apple Silicon）/ `gp-ladder_*_x64.dmg`（Intel）；未签名，首次请右键 → 打开
- Windows：`gp-ladder_*_x64-setup.exe`（未签名，SmartScreen 可能提示「仍要运行」）

应用内 **设置 → 关于** 可检查更新，并下载当前系统对应的安装包。

## 环境

- Node 18+
- Rust 1.77+（推荐最新 stable）

## 开发

```bash
npm install
npm test
npm run test:rust
npm run tauri dev
```

打包：

```bash
npm run tauri build
# 或按平台
npm run tauri:build:mac    # .app / .dmg
npm run tauri:build:win    # NSIS（需 Windows 工具链或交叉编译）
```

同一套前端的 Web 服务（默认端口 **40300**）：

```bash
npm run server
# http://localhost:40300
```

设置与快照在本机应用目录（macOS：`~/Library/Application Support/com.gp.ladder.app/`）。

## 功能

- 连涨天梯、涨停天梯、昨日涨停（顶部「昨涨」：昨天涨停，今日竞价后红盘且涨幅 2%–8%）
- 行业、天数、涨幅、换手、散户指数、精选筛选
- 个股抽屉详情
- 右键股票按短线视角调用 DeepSeek 看盘（动能、量价、买点止损），并给出 0–100 短线评分
- 导出 HTML / CSV / JSON
- 刷新进度与运行日志
- 检查 GitHub Release 更新并下载安装包

## 仓库结构

```text
.
├── src/                 # React 界面
├── src-tauri/           # Rust 宿主：抓取、行情、快照、导出
│   ├── src/
│   │   ├── crawl.rs     # 同花顺连涨榜
│   │   ├── quotes.rs    # 东方财富行情
│   │   ├── pipeline.rs  # 刷新管线
│   │   └── ...
│   └── templates/ladder.html
├── package.json
└── README.md
```

## 发布

三个版本号必须一致：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`。

```bash
# 只校验
npm run version:check

# 同步三个文件到指定版本（不提交）
npm run version:set -- 0.2.0

# 同步版本、提交并打 annotated tag（不推送）
npm run release:tag -- 0.2.0
git push origin HEAD && git push origin v0.2.0
```

推送 `v*` tag 后，GitHub Actions 会在 macOS arm64 / macOS x64 / Windows x64 构建，并上传到该 tag 的 GitHub Release。也可在 Actions 里手动 `workflow_dispatch`，填已有 tag 补传安装包。

## 注意事项

- 需要能访问 `data.10jqka.com.cn` 与 `push2delay.eastmoney.com`。
- 页面结构若变更，解析可能失败；可在设置里把「最多抓取页数」设为 1 试跑。
- 安装包未签名。macOS 请右键 App 选择「打开」；Windows 如遇 SmartScreen，选择「仍要运行」。
