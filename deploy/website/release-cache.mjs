import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  isSafeAssetName,
  isSafeTag,
  localDownloadUrl,
  normalizeReleases,
} from "../../site/releases.js";

export const REFRESH_MS = 15 * 60 * 1000;

async function readJson(filename) {
  try { return JSON.parse(await readFile(filename, "utf8")); }
  catch { return null; }
}

async function writeJsonAtomic(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o644 });
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export class ReleaseCache {
  constructor({ dataDir, bootstrapPath, fetchImpl = fetch, logger = console, attempts = 3 }) {
    this.dataDir = dataDir;
    this.bootstrapPath = bootstrapPath;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.attempts = attempts;
    this.manifestPath = path.join(dataDir, "mirrored-releases.json");
    this.indexPath = path.join(dataDir, "assets.json");
    this.manifest = null;
    this.index = {};
    this.verified = new Map();
    this.refreshing = null;
    this.failed = false;
  }

  get ready() { return Boolean(this.manifest?.releases.length); }

  publicManifest() {
    if (!this.ready) return null;
    return {
      ...this.manifest,
      assetsReady: true,
      stale: this.failed || !this.manifest.updatedAt ||
        Date.now() - Date.parse(this.manifest.updatedAt) > REFRESH_MS * 2,
      releases: normalizeReleases(this.manifest, { localDownloads: true }),
    };
  }

  filename(tag, asset) {
    if (!isSafeTag(tag) || !isSafeAssetName(asset.name) ||
      !/^sha256:[a-f\d]{64}$/.test(asset.digest || "") ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0) {
      throw new Error(`Invalid release asset: ${tag}/${asset.name}`);
    }
    // Separate content versions also preserve the published file during failed replacements.
    return path.join(this.dataDir, "assets", tag, asset.digest.slice(7), asset.name);
  }

  async verifyFile(tag, asset) {
    const filename = this.filename(tag, asset);
    try {
      const info = await lstat(filename);
      if (!info.isFile() || info.size !== asset.size) return false;
      const fingerprint = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
      if (this.verified.get(filename) === fingerprint) return true;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(filename)) hash.update(chunk);
      if (`sha256:${hash.digest("hex")}` !== asset.digest) return false;
      this.verified.set(filename, fingerprint);
      this.index[`${tag}/${asset.name}/${asset.digest}`] = {
        size: asset.size, digest: asset.digest, verifiedAt: new Date().toISOString(),
      };
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async init() {
    this.index = (await readJson(this.indexPath)) || {};
    for (const filename of [this.manifestPath, path.join(this.dataDir, "releases.json"), this.bootstrapPath]) {
      const payload = await readJson(filename);
      if (!payload) continue;
      try {
        const releases = normalizeReleases(payload);
        if (!releases.length) continue;
        let complete = true;
        for (const release of releases) {
          for (const asset of release.assets) {
            if (!(await this.verifyFile(release.tag_name, asset))) complete = false;
          }
        }
        if (complete) {
          this.manifest = { ...payload, releases };
          break;
        }
      } catch (error) {
        this.logger.warn(`Cannot restore mirrored manifest: ${error.message}`);
      }
    }
    return this.ready;
  }

  async github(endpoint) {
    const response = await this.fetch(`https://api.github.com/repos/uasier/gp-ladder/${endpoint}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "gp-ladder-download-site",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return { data: await response.json(), hasNext: /rel="next"/.test(response.headers.get("link") || "") };
  }

  async download(tag, asset) {
    const filename = this.filename(tag, asset);
    if (await this.verifyFile(tag, asset)) return;
    await mkdir(path.dirname(filename), { recursive: true });
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      const temporary = `${filename}.${randomUUID()}.part`;
      try {
        const signal = AbortSignal.timeout(120000);
        const response = await this.fetch(asset.browser_download_url, {
          headers: { Accept: "application/octet-stream", "User-Agent": "gp-ladder-download-site" },
          signal,
        });
        if (!response.ok || !response.body) throw new Error(`Download HTTP ${response.status}`);
        const hash = createHash("sha256");
        let size = 0;
        const verify = new Transform({
          transform(chunk, encoding, callback) {
            size += chunk.length;
            if (size > asset.size) return callback(new Error("Size exceeds release metadata"));
            hash.update(chunk);
            callback(null, chunk);
          },
        });
        await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(temporary, { flags: "wx" }), { signal });
        if (size !== asset.size) throw new Error("Size mismatch");
        if (`sha256:${hash.digest("hex")}` !== asset.digest) throw new Error("SHA-256 mismatch");
        await rename(temporary, filename);
        const info = await lstat(filename);
        this.verified.set(filename, `${info.size}:${info.mtimeMs}:${info.ctimeMs}`);
        this.index[`${tag}/${asset.name}/${asset.digest}`] = {
          size, digest: asset.digest, verifiedAt: new Date().toISOString(),
        };
        this.logger.log(`Mirrored ${tag}/${asset.name}: ${size} bytes, SHA-256 verified`);
        return;
      } catch (error) {
        if (attempt === this.attempts) throw new Error(`${tag}/${asset.name}: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    }
  }

  refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.sync().then(() => {
      this.failed = false;
      return true;
    }).catch(error => {
      this.failed = true;
      this.logger.warn(`Release refresh failed; keeping verified cache: ${error.message}`);
      return false;
    }).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async sync() {
    const rows = [];
    for (let page = 1; page <= 20; page++) {
      const result = await this.github(`releases?per_page=100&page=${page}`);
      if (!Array.isArray(result.data)) throw new Error("Invalid release response");
      rows.push(...result.data);
      if (!result.hasNext) break;
      if (page === 20) throw new Error("Release pagination incomplete");
    }
    const releases = normalizeReleases(rows);
    if (!releases.length) throw new Error("Empty release response");
    const latest = await this.github("releases/latest");
    if (!releases.some(release => release.tag_name === latest.data.tag_name && !release.prerelease))
      throw new Error("Latest stable release missing from catalog");
    const jobs = releases.flatMap(release => release.assets.map(asset => ({ tag: release.tag_name, asset })));
    let cursor = 0;
    const errors = [];
    // All workers settle before the lock is released, even if one download fails.
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try { await this.download(job.tag, job.asset); }
        catch (error) { errors.push(error); }
      }
    }));
    await writeJsonAtomic(this.indexPath, this.index);
    if (errors.length) throw new AggregateError(errors, errors.map(error => error.message).join("; "));
    const next = { latest: latest.data.tag_name, updatedAt: new Date().toISOString(), releases };
    await writeJsonAtomic(this.manifestPath, next);
    this.manifest = next;
    this.logger.log(`Release cache ready: ${releases.length} releases, ${jobs.length} assets; latest ${next.latest}`);
  }

  async getDownload(tag, name) {
    const release = this.manifest?.releases.find(row => row.tag_name === tag);
    const asset = release?.assets.find(row => row.name === name);
    if (!asset || !(await this.verifyFile(tag, asset))) return null;
    return { asset, filename: this.filename(tag, asset), url: localDownloadUrl(tag, name) };
  }
}
