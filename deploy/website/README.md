# 下载官网部署与维护

正式地址：<https://gp.uasier.com/>。服务器：`154.36.168.192`，部署根目录：`/opt/gp-website`。

官网缓存 `uasier/gp-ladder` 的公开 GitHub Releases 元数据和全部附件。用户从 `https://gp.uasier.com/downloads/<版本>/<文件名>` 下载，下载请求不重定向到 GitHub。

## 服务与存储

| 入口 | 用途 |
| --- | --- |
| 公网 80 | 现有 `clashx-subscription-nginx` 将本域名 308 跳转到 HTTPS |
| 公网 443 | 现有 `shiban-sni` 按 SNI 将本域名转发至 40501 |
| `127.0.0.1:40501` | `gp-website-tls` 终止 TLS，并反向代理网站 |
| `127.0.0.1:40500` | `gp-website` 提供页面、版本目录和缓存文件下载 |

40500/40501 仅监听回环地址；40500–40599 为远程官网预留段。部署预热使用不监听端口的 `--sync-only` 命令。既有域名及默认路由保持原配置。

```text
/opt/gp-website/
├── current -> releases/<部署时间>
├── previous -> releases/<上次部署时间>
├── prepared -> releases/<待激活的部署时间>
├── releases/                    # 网站代码与 artifact.tar.gz
├── data/mirrored-releases.json   # 已完成镜像的版本目录，上游 URL 仅供服务器同步
├── data/assets.json              # 已校验文件的大小、摘要与验证时间
├── data/assets/<tag>/<sha256>/   # 持久化附件；同名附件的不同内容分别保存
├── data/releases.json            # 旧版元数据缓存，保留供回滚读取
├── tls/                         # root:root，目录 700、文件 600
├── backups/                     # Compose 与共享入口配置的私有备份
├── docker-compose.yml
├── nginx.conf
└── README.md
```

容器 uid/gid 为 1000，`data/` 可写；应用目录与容器根文件系统只读。升级或重建网站容器不会删除附件。旧附件不自动清理，避免旧下载链接或回滚失效。

## 同步与下载行为

- 启动时校验已有文件；后台每 15 分钟同步 GitHub Releases，忽略草稿。
- 最多并行下载 3 个附件。每个附件使用独立临时文件，验证大小和 SHA-256 后原子改名；单次下载超时 120 秒，最多尝试 3 次。
- 一轮同步的全部附件完成后才原子发布新目录。失败时保留上一份完整目录和已校验的文件，下一轮复用已成功下载的附件。
- 内容按摘要存放，因此上游替换同名附件时，失败的同步不会覆盖当前提供的旧文件。
- GitHub 暂时不可用时，已有目录和安装包照常提供，API 中 `stale` 为 `true`。
- `/api/releases` 和 `/releases.json` 均返回服务器下载路径；页面和历史版本下载按钮均指向官网。GitHub Pages 静态镜像读取官网公开 API，回退清单也使用官网地址。
- 下载支持 `GET`、`HEAD`、单段字节范围、`ETag` 与 `If-Range`，可断点续传；返回 `Content-Disposition: attachment`。
- 两份版本目录都不可用时，页面禁用下载按钮并提示重试，不转到 GitHub 下载。首次启动无完整缓存时健康检查返回 503，预热完成后才应切换流量。

## 构建、预热与激活

在仓库根目录执行：

```bash
npm run site:build
npx vitest run scripts/website-cache.test.ts scripts/site-releases.test.ts src/seo.test.ts src/siteShowcase.test.ts
GP_SITE_RELEASE=$(date -u +%Y%m%dT%H%M%SZ)
COPYFILE_DISABLE=1 tar -czf "/tmp/gp-website-${GP_SITE_RELEASE}.tar.gz" \
  .site-dist site/releases.js deploy/website/*.mjs deploy/website/docker-compose.yml
ssh root@154.36.168.192 "install -d -m 755 /opt/gp-website/releases/${GP_SITE_RELEASE}"
scp "/tmp/gp-website-${GP_SITE_RELEASE}.tar.gz" \
  "root@154.36.168.192:/opt/gp-website/releases/${GP_SITE_RELEASE}/artifact.tar.gz"
```

在服务器 `/opt/gp-website` 下设置 `release` 为上述部署时间，然后启动后台预热：

```bash
release=<部署时间>
tar --no-same-owner -xzf "releases/$release/artifact.tar.gz" -C "releases/$release"
# 若同名任务存在，先确认已退出，再 docker rm；不要并行运行多个同步任务。
docker run -d --name gp-website-mirror-warmup \
  --network host --user 1000:1000 --workdir /app --read-only --tmpfs /tmp \
  -e SITE_ROOT=/app/.site-dist -e SITE_DATA=/data \
  -v "/opt/gp-website/releases/$release:/app:ro" -v /opt/gp-website/data:/data \
  node:24-bookworm-slim node deploy/website/server.mjs --sync-only
ln -sfn "releases/$release" prepared
```

分步查看 `docker logs --tail 15 gp-website-mirror-warmup` 与 `docker inspect gp-website-mirror-warmup --format '{{.State.Status}} {{.State.ExitCode}}'`。只有退出状态为 `exited 0` 才激活，不以等待时长判断成功。

```bash
release_dir=$(readlink prepared)
release=${release_dir#releases/}
previous_dir=$(readlink current)
[ "$(docker inspect gp-website-mirror-warmup --format '{{.State.Status}}:{{.State.ExitCode}}')" = 'exited:0' ]
backup="backups/website-$release"
install -d -m 700 "$backup"
cp docker-compose.yml "$backup/docker-compose.yml"
cp "$release_dir/deploy/website/docker-compose.yml" docker-compose.yml
if ! docker compose config -q; then
  cp "$backup/docker-compose.yml" docker-compose.yml
  exit 1
fi
ln -sfn "$previous_dir" previous
ln -s "$release_dir" current.next
mv -Tf current.next current
if ! docker compose up -d --force-recreate --no-deps --wait --wait-timeout 45 website; then
  cp "$backup/docker-compose.yml" docker-compose.yml
  ln -s "$previous_dir" current.rollback
  mv -Tf current.rollback current
  docker compose up -d --force-recreate --no-deps --wait --wait-timeout 45 website
  exit 1
fi
docker rm gp-website-mirror-warmup
curl --fail http://127.0.0.1:40500/healthz
```

Docker 创建容器时会解析 `current`，切换符号链接后必须重建 `website`。常规更新不需要重载共享 Nginx。若要回滚，把 `current` 指回 `previous`，恢复本次部署 `backups/website-<部署时间>/docker-compose.yml` 后重建容器，保留 `data/` 与证书。回滚到旧版服务会恢复 GitHub 直连下载行为。

## 验证

```bash
curl https://gp.uasier.com/healthz
curl https://gp.uasier.com/api/releases
curl -I https://gp.uasier.com/downloads/v0.2.5/gp-ladder_0.2.5_x64-setup.exe
curl -H 'Range: bytes=0-31' -o /tmp/gp-download-head \
  https://gp.uasier.com/downloads/v0.2.5/gp-ladder_0.2.5_x64-setup.exe
```

健康检查应包含 `ok: true`、`assetsReady: true`，目录中的附件地址以 `/downloads/` 开头。下载响应应无 GitHub 重定向；Range 请求返回 206。可将实际下载文件的 SHA-256 与目录中的摘要比较。原先不存在的安装包仍显示“此版本未提供”。

2026-10-20 首次镜像上线时，共缓存 7 个版本、39 个附件，合计 322,132,502 字节。全部附件均通过官网 HTTPS 完整下载与 SHA-256 校验，并验证了无重定向、附件响应头及 Range 请求。验收记录保存在服务器 `/opt/gp-website/mirror-validation.json`，不属于静态网站内容。

## 证书和共享入口

现有证书由 TrustAsia 签发，有效期至 **2027-01-17 09:59:59 UTC（北京时间 17:59:59）**，需手动续期。证书位于 `/opt/gp-website/tls/gp.uasier.com_bundle.crt`，私钥位于同目录的 `gp.uasier.com.key`。替换前保留旧文件，保持目录 700、文件 600，并执行：

```bash
docker exec gp-website-tls nginx -t
docker exec gp-website-tls nginx -s reload
```

共享入口配置是 `/opt/clashx-proxy/sni-nginx.conf` 和 `/opt/clashx-proxy/nginx.conf`。只有入口配置变更时才运行 `configure-ingress.py`；它会备份、验证并回滚失败修改。不要用旧的完整备份覆盖后来新增的其他域名配置。共享入口备份及 TLS 私钥不得入库或放进静态站点。仓库已忽略证书 ZIP、网站 TLS 目录和运行数据。
