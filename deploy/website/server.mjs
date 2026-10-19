import http from "node:http";
import { createReadStream } from "node:fs";
import { readFile, writeFile, rename, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReleases } from "../../site/releases.js";

const root = path.resolve(
  process.env.SITE_ROOT ||
    fileURLToPath(new URL("../../.site-dist", import.meta.url)),
);
const dataDir = path.resolve(process.env.SITE_DATA || "/data");
const port = Number(process.env.PORT || 40500);
const host = process.env.HOST || "127.0.0.1";
const refreshMs = 15 * 60 * 1000;
const cachePath = path.join(dataDir, "releases.json");
let cache = null;
let refreshFailed = false;
let refreshing = null;

for (const filename of [cachePath, path.join(root, "releases.json")]) {
  try {
    const payload = JSON.parse(await readFile(filename, "utf8"));
    const releases = normalizeReleases(payload);
    if (releases.length) {
      cache = { ...payload, releases };
      break;
    }
  } catch {
    /* A bundled manifest is available on a fresh deployment. */
  }
}
if (!cache)
  throw new Error("No usable release manifest; run npm run site:build first");

async function github(endpoint) {
  const response = await fetch(
    `https://api.github.com/repos/uasier/gp-ladder/${endpoint}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "gp-ladder-download-site",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return {
    data: await response.json(),
    hasNext: /rel="next"/.test(response.headers.get("link") || ""),
  };
}

async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const rows = [];
    for (let page = 1; page <= 20; page++) {
      const result = await github(`releases?per_page=100&page=${page}`);
      if (!Array.isArray(result.data))
        throw new Error("Invalid GitHub release response");
      rows.push(...result.data);
      if (!result.hasNext) break;
      if (page === 20)
        throw new Error(
          "Release pagination limit reached; preserving the last complete manifest",
        );
    }
    const releases = normalizeReleases(rows);
    if (!releases.length)
      throw new Error("Empty release response; preserving cache");
    const latest = await github("releases/latest");
    const next = {
      releases,
      latest: latest.data.tag_name,
      updatedAt: new Date().toISOString(),
    };
    cache = next;
    refreshFailed = false;
    await mkdir(dataDir, { recursive: true });
    const temporary = `${cachePath}.tmp`;
    await writeFile(temporary, JSON.stringify(next), { mode: 0o644 });
    await rename(temporary, cachePath);
    console.log(
      `Release cache updated: ${releases.length} releases; latest ${next.latest}`,
    );
  })()
    .catch((error) => {
      refreshFailed = true;
      console.warn(
        `Release refresh failed; using saved manifest: ${error.message}`,
      );
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const json = (res, req, value, status = 200, cacheControl = "no-store") => {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": cacheControl,
  });
  res.end(req.method === "HEAD" ? undefined : body);
};

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return json(res, req, { error: "Method not allowed" }, 405);
  }
  try {
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    if (pathname === "/healthz")
      return json(res, req, { ok: true, releases: cache.releases.length });
    if (pathname === "/api/releases") {
      const stale =
        refreshFailed ||
        !cache.updatedAt ||
        Date.now() - Date.parse(cache.updatedAt) > refreshMs * 2;
      return json(
        res,
        req,
        { ...cache, stale },
        200,
        "public, max-age=60, stale-if-error=86400",
      );
    }
    if (
      pathname.includes("\0") ||
      pathname.includes("\\") ||
      pathname.split("/").some((part) => part.startsWith("."))
    )
      return json(res, req, { error: "Not found" }, 404);
    const relative =
      pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filename = path.resolve(root, relative);
    const type = types[path.extname(filename)];
    if (!filename.startsWith(`${root}${path.sep}`) || !type)
      return json(res, req, { error: "Not found" }, 404);
    const info = await stat(filename);
    if (!info.isFile()) return json(res, req, { error: "Not found" }, 404);
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": info.size,
      "Cache-Control": /\.(png|jpg|ico)$/.test(filename)
        ? "public, max-age=86400"
        : "no-cache",
      "Last-Modified": info.mtime.toUTCString(),
    });
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(filename);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    json(
      res,
      req,
      { error: "Not found" },
      error instanceof URIError ? 400 : 404,
    );
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, host, () => {
  console.log(`Download site listening at http://${host}:${port}`);
  refresh();
});
setInterval(refresh, refreshMs).unref();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
