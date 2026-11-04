import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSafeAssetName, isSafeTag } from "../../site/releases.js";
import { ReleaseCache, REFRESH_MS } from "./release-cache.mjs";
import { parseRange } from "./ranges.mjs";

const root = path.resolve(process.env.SITE_ROOT || fileURLToPath(new URL("../../.site-dist", import.meta.url)));
const cache = new ReleaseCache({
  dataDir: path.resolve(process.env.SITE_DATA || "/data"),
  bootstrapPath: path.join(root, "releases.json"),
});
await cache.init();

if (process.argv.includes("--sync-only")) {
  process.exitCode = await cache.refresh() ? 0 : 1;
} else {
  const types = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
    ".svg": "image/svg+xml", ".ico": "image/x-icon",
  };
  const downloadTypes = {
    ".apk": "application/vnd.android.package-archive", ".dmg": "application/x-apple-diskimage",
    ".exe": "application/vnd.microsoft.portable-executable", ".gz": "application/gzip",
  };
  function json(req, res, value, status = 200, control = "no-store") {
    const body = JSON.stringify(value);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": control });
    res.end(req.method === "HEAD" ? undefined : body);
  }
  function sendFile(req, res, filename, info, contentType, asset) {
    const etag = asset ? `"${asset.digest}"` : null;
    const headers = {
      "Content-Type": contentType,
      "Cache-Control": asset ? "public, max-age=3600, must-revalidate" : /\.(png|jpg|ico)$/.test(filename) ? "public, max-age=86400" : "no-cache",
      "Last-Modified": info.mtime.toUTCString(),
    };
    if (asset) {
      headers.ETag = etag;
      headers["Accept-Ranges"] = "bytes";
      headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(asset.name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
      if (req.headers["if-none-match"]?.split(/,\s*/).some(value => value === etag || value === `W/${etag}` || value === "*")) {
        res.writeHead(304, headers);
        return res.end();
      }
    }
    const ifRange = req.headers["if-range"];
    const matchesRange = !ifRange || ifRange === etag ||
      (!ifRange.startsWith('"') && Date.parse(ifRange) >= Math.floor(info.mtimeMs / 1000) * 1000);
    const range = asset && req.method === "GET" && matchesRange ? parseRange(req.headers.range, info.size) : null;
    if (range === "invalid") {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}`, "Content-Length": 0 });
      return res.end();
    }
    headers["Content-Length"] = range ? range.end - range.start + 1 : info.size;
    if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${info.size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(filename, range || undefined);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      return json(req, res, { error: "Method not allowed" }, 405);
    }
    try {
      const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
      if (pathname === "/healthz")
        return json(req, res, { ok: cache.ready, releases: cache.manifest?.releases.length || 0, assetsReady: cache.ready }, cache.ready ? 200 : 503);
      if (pathname === "/api/releases" || pathname === "/releases.json") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        return cache.ready
          ? json(req, res, cache.publicManifest(), 200, "public, max-age=60, stale-if-error=86400")
          : json(req, res, { error: "Release cache is synchronizing" }, 503);
      }
      if (pathname.startsWith("/downloads/")) {
        const parts = pathname.slice("/downloads/".length).split("/");
        if (parts.length !== 2 || !isSafeTag(parts[0]) || !isSafeAssetName(parts[1]))
          return json(req, res, { error: "Not found" }, 404);
        const download = await cache.getDownload(...parts);
        if (!download) return json(req, res, { error: "Not found" }, 404);
        const info = await stat(download.filename);
        return sendFile(req, res, download.filename, info, downloadTypes[path.extname(download.filename)] || "application/octet-stream", download.asset);
      }
      if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").some(part => part.startsWith(".")))
        return json(req, res, { error: "Not found" }, 404);
      const filename = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
      const type = types[path.extname(filename)];
      if (!filename.startsWith(`${root}${path.sep}`) || !type)
        return json(req, res, { error: "Not found" }, 404);
      const info = await stat(filename);
      if (!info.isFile()) return json(req, res, { error: "Not found" }, 404);
      sendFile(req, res, filename, info, type);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      json(req, res, { error: "Not found" }, error instanceof URIError ? 400 : 404);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const port = Number(process.env.PORT || 40500);
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => {
    console.log(`Download site listening at http://${host}:${port}`);
    void cache.refresh();
  });
  const timer = setInterval(() => void cache.refresh(), REFRESH_MS);
  timer.unref();
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      clearInterval(timer);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
}
