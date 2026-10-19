# 下载官网部署与维护

正式地址：<https://gp.uasier.com/>。服务器：`154.36.168.192`，部署根目录：`/opt/gp-website`。

官网提供界面预览、平台下载、版本选择、更新记录和安装帮助。安装包直接来自 `uasier/gp-ladder` 的 GitHub Releases；服务器缓存版本元数据，不镜像安装包。未提交的桌面应用修改不会因官网部署而发布。

## 服务与端口

| 入口 | 用途 |
| --- | --- |
| 公网 80 | 现有 `clashx-subscription-nginx` 按 `gp.uasier.com` 返回 308 HTTPS 跳转 |
| 公网 443 | 现有 `shiban-sni` 按 TLS SNI 将 `gp.uasier.com` 转发至 40501 |
| `127.0.0.1:40501` | `gp-website-tls`，Nginx 证书终止与反向代理 |
| `127.0.0.1:40500` | `gp-website`，Node.js 24 静态服务与 `/api/releases` |

40500/40501 仅监听本机。为该服务保留 40500–40599；40502 可供短时内部验证，常态不运行服务。没有改动既有域名的上游或默认路由。现有入口配置分别为 `/opt/clashx-proxy/sni-nginx.conf` 和 `/opt/clashx-proxy/nginx.conf`。

运行文件：

```text
/opt/gp-website/
├── current -> releases/<部署时间>
├── previous -> releases/<上次部署时间>
├── releases/              # 独立的历史部署与 artifact.tar.gz
├── data/releases.json     # 持久化版本缓存，容器内 uid 1000 可写
├── tls/                   # root:root，目录 700、证书/私钥 600
├── backups/               # 共享 Nginx 原配置的私有备份
├── docker-compose.yml
├── nginx.conf
├── configure-ingress.py
└── README.md
```

容器使用 `restart: unless-stopped`。服务端每 15 分钟访问 GitHub，同步正式版、预览版及其实际附件；草稿不对外展示。默认选择 GitHub 标记的最新稳定版。缺包的平台不会借用其他版本的安装包。

GitHub 不可用时保留最近成功的缓存；首次部署可读取内置 `site/releases.json`。页面会提示正在使用缓存。纯静态镜像也可以使用该清单，但不会拥有服务端的定时同步能力。

## 构建与更新

不需要编译桌面安装包：

```bash
npm run site:build
npx vitest run scripts/site-releases.test.ts src/seo.test.ts src/siteShowcase.test.ts
```

`site:build` 将页面、截图、图标与 SEO 文件组装到 `.site-dist/`，并为 CSS/入口 JS 加内容摘要，避免更新后命中旧缓存。代码不使用远程字体、CDN 脚本或额外 npm 运行依赖。

在仓库根目录上传一个新部署：

```bash
GP_SITE_RELEASE=$(date -u +%Y%m%dT%H%M%SZ)
COPYFILE_DISABLE=1 tar -czf "/tmp/gp-website-${GP_SITE_RELEASE}.tar.gz" \
  .site-dist site/releases.js deploy/website/server.mjs
ssh root@154.36.168.192 "install -d -m 755 /opt/gp-website/releases/${GP_SITE_RELEASE}"
scp "/tmp/gp-website-${GP_SITE_RELEASE}.tar.gz" \
  "root@154.36.168.192:/opt/gp-website/releases/${GP_SITE_RELEASE}/artifact.tar.gz"
ssh root@154.36.168.192 bash -s -- "$GP_SITE_RELEASE" <<'REMOTE'
set -euo pipefail
cd /opt/gp-website
release="$1"
tar --no-same-owner -xzf "releases/$release/artifact.tar.gz" -C "releases/$release"
ln -sfn "$(readlink current)" previous
ln -s "releases/$release" current.next
mv -Tf current.next current
if ! docker compose up -d --force-recreate --no-deps --wait --wait-timeout 45 website; then
  ln -s "$(readlink previous)" current.rollback
  mv -Tf current.rollback current
  docker compose up -d --force-recreate --no-deps --wait --wait-timeout 45 website
  exit 1
fi
curl --fail http://127.0.0.1:40500/healthz
REMOTE
```

Docker 会在创建容器时解析 `current` 目录挂载，所以更新后必须重建 `website` 容器，单独切换符号链接不够。常规页面更新不需要重载共享 Nginx。

若同时修改了 Compose 或独立 TLS 配置，另行上传 `deploy/website/docker-compose.yml`、`deploy/website/nginx.conf`，先运行 `docker compose config -q` 和 `docker exec gp-website-tls nginx -t`；验证通过后再应用。初次接入共享入口时运行 `python3 /opt/gp-website/configure-ingress.py`：该脚本先备份、追加域名、测试两份配置，失败时恢复原配置，成功后平滑重载。

## 检查与回滚

```bash
ssh root@154.36.168.192 'cd /opt/gp-website && docker compose ps'
ssh root@154.36.168.192 'docker logs --tail 50 gp-website'
curl -I https://gp.uasier.com/
curl -I http://gp.uasier.com/
curl https://gp.uasier.com/healthz
curl https://gp.uasier.com/api/releases
```

预期 HTTPS 200、HTTP 308、健康检查 `ok: true`；版本接口提供 `latest`、`updatedAt`、`stale` 和 `releases`。

回滚网站代码（保留版本缓存与证书）：

```bash
ssh root@154.36.168.192 bash -s <<'REMOTE'
set -euo pipefail
cd /opt/gp-website
test -L previous
ln -s "$(readlink previous)" current.rollback
mv -Tf current.rollback current
docker compose up -d --force-recreate --no-deps --wait --wait-timeout 45 website
REMOTE
```

共享入口的备份包含其他服务的私有配置，不要复制进 Git。需要撤回域名接入时，仅删除本服务的 SNI 行与 `# BEGIN gp-website` / `# END gp-website` 区块，再测试、重载；不要用很久以前的完整备份覆盖后来新增的其他服务。

## 证书更新

使用用户提供的 TrustAsia 证书：有效期 **2026-10-19 至 2027-01-17 09:59:59 UTC**（北京时间 2027-01-17 17:59:59）。这份手动上传的证书没有自动续期，需要在到期前换发。

将新的匹配证书链和私钥放到服务器的以下位置，再验证与平滑重载：

```text
/opt/gp-website/tls/gp.uasier.com_bundle.crt
/opt/gp-website/tls/gp.uasier.com.key
```

```bash
ssh root@154.36.168.192 '
  chmod 600 /opt/gp-website/tls/* &&
  docker exec gp-website-tls nginx -t &&
  docker exec gp-website-tls nginx -s reload
'
```

替换前应保留旧证书目录的私有备份；`nginx -t` 会检查证书与私钥匹配。证书目录位于静态根目录之外，网站不会提供证书下载。仓库已忽略 `*_nginx.zip`、`deploy/website/tls/` 和运行数据。

## 首次上线验证

- 桌面/平板/手机：1440、768、390、320px，无横向溢出。
- 标签点击和键盘切换、手机菜单、版本选择、缺包提示、安装帮助均通过。
- 版本接口失败时使用内置清单；两者都失败时提供明确的 GitHub 下载入口。
- 生产 HTTPS 的桌面/手机浏览器验证通过，无脚本、CSP 或资源错误。
- 5 个版本的 17 个安装包链接返回 200；v0.2.3 的 4 个平台包实际下载后 SHA-256 与 GitHub 元数据一致。
- 证书路径与路径穿越请求不可访问；既有域名 HTTP 行为和 HTTPS 服务正常。

验证时下载的文件未永久存储到官网。服务器保留 `download-validation.json` 与 `ingress-check.json` 作为首发检查记录。
