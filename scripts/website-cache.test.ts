import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReleaseCache } from "../deploy/website/release-cache.mjs";
import { parseRange } from "../deploy/website/ranges.mjs";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const logger = { log() {}, warn() {} };
const release = (tag: string, bodies: string[]) => ({
  tag_name: tag, published_at: "2026-10-19T00:00:00Z",
  assets: bodies.map((body, index) => ({
    name: `installer-${index}.dmg`, size: Buffer.byteLength(body),
    browser_download_url: `https://github.com/uasier/gp-ladder/releases/download/${tag}/installer-${index}.dmg`,
    digest: `sha256:${createHash("sha256").update(body).digest("hex")}`,
  })),
});
async function setup() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "gp-cache-test-"));
  temporary.push(dataDir);
  const bodies = new Map<string, string>();
  let releases = [release("v0.2.5", ["installer one", "installer two"])];
  releases[0].assets.forEach((asset, index) => bodies.set(asset.browser_download_url, ["installer one", "installer two"][index]));
  let offline = false;
  const fetchImpl = vi.fn(async (url: string) => {
    if (offline) throw new Error("GitHub unavailable");
    if (url.includes("/releases?")) return Response.json(releases);
    if (url.endsWith("/releases/latest")) return Response.json({ tag_name: releases[0].tag_name });
    return new Response(bodies.get(url) ?? "", { status: bodies.has(url) ? 200 : 404 });
  });
  const options = { dataDir, bootstrapPath: path.join(dataDir, "bootstrap.json"), fetchImpl, logger, attempts: 1 };
  const cache = new ReleaseCache(options);
  return { cache, options, fetchImpl, bodies, setReleases: (rows: typeof releases) => { releases = rows; }, goOffline: () => { offline = true; } };
}

describe("persistent website release mirror", () => {
  it("downloads verified files once, restores them offline and serves local URLs", async () => {
    const { cache, options, fetchImpl, goOffline } = await setup();
    expect(await cache.init()).toBe(false);
    const pending = cache.refresh();
    expect(cache.refresh()).toBe(pending);
    expect(await pending).toBe(true);
    const asset = await cache.getDownload("v0.2.5", "installer-0.dmg");
    expect(await readFile(asset.filename, "utf8")).toBe("installer one");
    expect(cache.publicManifest().releases[0].assets[0].browser_download_url).toBe("/downloads/v0.2.5/installer-0.dmg");
    fetchImpl.mockClear();
    expect(await cache.refresh()).toBe(true);
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes("/releases/download/"))).toHaveLength(0);
    goOffline();
    const restored = new ReleaseCache(options);
    expect(await restored.init()).toBe(true);
    expect(await restored.refresh()).toBe(false);
    expect(restored.publicManifest().stale).toBe(true);
    expect(await readFile((await restored.getDownload("v0.2.5", "installer-1.dmg")).filename, "utf8")).toBe("installer two");
  });

  it("keeps the last published manifest and file when a replacement fails verification", async () => {
    const { cache, options, bodies, setReleases } = await setup();
    await cache.init();
    await cache.refresh();
    const before = await readFile(cache.manifestPath, "utf8");
    const next = release("v0.2.5", ["replacement one", "replacement two"]);
    bodies.set(next.assets[0].browser_download_url, "replacement one");
    bodies.set(next.assets[1].browser_download_url, "BAD digest data");
    setReleases([next]);
    expect(await cache.refresh()).toBe(false);
    expect(await readFile(cache.manifestPath, "utf8")).toBe(before);
    expect(await readFile((await cache.getDownload("v0.2.5", "installer-0.dmg")).filename, "utf8")).toBe("installer one");
    expect((await readdir(options.dataDir, { recursive: true })).some(name => String(name).endsWith(".part"))).toBe(false);
  });

  it("rejects corrupt bytes and truncated downloads before publishing a new version", async () => {
    for (const corrupt of ["wrong payload", "x"]) {
      const { cache, bodies, setReleases } = await setup();
      await cache.init();
      await cache.refresh();
      const next = release("v0.2.6", ["valid payload"]);
      bodies.set(next.assets[0].browser_download_url, corrupt);
      setReleases([next]);
      expect(await cache.refresh()).toBe(false);
      expect(cache.publicManifest().latest).toBe("v0.2.5");
      expect(await cache.getDownload("v0.2.6", "installer-0.dmg")).toBeNull();
    }
  });

  it("waits for all workers to settle before allowing a second refresh", async () => {
    const { cache, fetchImpl } = await setup();
    let unblock!: () => void;
    const blocked = new Promise<void>(resolve => { unblock = resolve; });
    const original = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async url => {
      if (url.endsWith("/installer-0.dmg")) throw new Error("first download failed");
      if (url.endsWith("/installer-1.dmg")) await blocked;
      return original(url);
    });
    let finished = false;
    const pending = cache.refresh();
    pending.then(() => { finished = true; });
    await vi.waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.endsWith("/installer-1.dmg"))).toBe(true));
    expect(finished).toBe(false);
    expect(cache.refresh()).toBe(pending);
    unblock();
    expect(await pending).toBe(false);
  });

  it("detects a corrupted cached file and repairs it on the next sync", async () => {
    const { cache } = await setup();
    await cache.refresh();
    const item = await cache.getDownload("v0.2.5", "installer-0.dmg");
    await writeFile(item.filename, "installer BAD");
    expect(await cache.getDownload("v0.2.5", "installer-0.dmg")).toBeNull();
    expect(await cache.refresh()).toBe(true);
    expect(await readFile((await cache.getDownload("v0.2.5", "installer-0.dmg")).filename, "utf8")).toBe("installer one");
  });
});

describe("download byte ranges", () => {
  it.each([
    ["bytes=0-4", { start: 0, end: 4 }], ["bytes=8-", { start: 8, end: 9 }],
    ["bytes=-3", { start: 7, end: 9 }], ["bytes=-30", { start: 0, end: 9 }],
    ["bytes=7-99", { start: 7, end: 9 }], ["bytes=10-", "invalid"],
    ["bytes=5-4", "invalid"], ["bytes=-0", "invalid"],
    ["bytes=-", null], ["bytes=0-1,4-5", null], [undefined, null],
  ])("handles %s", (range, expected) => { expect(parseRange(range, 10)).toEqual(expected); });
});
