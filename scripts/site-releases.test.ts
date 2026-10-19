import { describe, expect, it } from "vitest";
import {
  assetFor,
  latestStable,
  normalizeReleases,
  renderNotes,
  sizeLabel,
} from "../site/releases.js";

const asset = (tag: string, name: string) => ({
  name,
  size: 1048576,
  state: "uploaded",
  browser_download_url: `https://github.com/uasier/gp-ladder/releases/download/${tag}/${name}`,
});
const release = (tag: string, options = {}) => ({
  tag_name: tag,
  published_at: "2026-10-19T10:00:00Z",
  assets: [],
  ...options,
});

describe("download version catalog", () => {
  it("excludes drafts, duplicate tags and malformed versions", () => {
    const rows = normalizeReleases([
      release("v0.2.3", { draft: true }),
      release("v0.2.3"),
      release("v0.2.3"),
      release("<script>"),
      null,
    ]);
    expect(rows.map((row) => row.tag_name)).toEqual(["v0.2.3"]);
  });
  it("uses the declared latest stable release even when a maintenance release is newer", () => {
    const rows = normalizeReleases([
      release("v1.0.0"),
      release("v1.1.0-beta.1", {
        prerelease: true,
        published_at: "2026-10-20T10:00:00Z",
      }),
      release("v0.9.9", { published_at: "2026-10-21T10:00:00Z" }),
    ]);
    expect(latestStable(rows, "v1.0.0")?.tag_name).toBe("v1.0.0");
    expect(latestStable(rows, "v1.1.0-beta.1")?.prerelease).toBe(false);
  });
  it("does not label a preview-only catalog as stable", () => {
    expect(
      latestStable(
        normalizeReleases([release("v1.0.0-beta.1", { prerelease: true })]),
      ),
    ).toBeNull();
  });
  it("never substitutes a newer installer for a missing platform in an older release", () => {
    const [row] = normalizeReleases([
      release("v0.2.2", {
        assets: [
          asset("v0.2.2", "gp-ladder_0.2.2_aarch64.dmg"),
          asset("v0.2.3", "gp-ladder_0.2.3_x64-setup.exe"),
        ],
      }),
    ]);
    expect(assetFor(row, "mac-arm")?.name).toBe("gp-ladder_0.2.2_aarch64.dmg");
    expect(assetFor(row, "win")).toBeNull();
    expect(assetFor(row, "android")).toBeNull();
  });
  it("matches Intel and Apple Silicon separately, excluding updater archives", () => {
    const [row] = normalizeReleases([
      release("v0.2.3", {
        assets: [
          asset("v0.2.3", "gp-ladder_0.2.3_aarch64.app.tar.gz"),
          asset("v0.2.3", "gp-ladder_0.2.3_x64.dmg"),
          asset("v0.2.3", "gp-ladder_0.2.3_aarch64.dmg"),
        ],
      }),
    ]);
    expect(assetFor(row, "mac-intel")?.name).toMatch(/_x64\.dmg$/);
    expect(assetFor(row, "mac-arm")?.name).toMatch(/_aarch64\.dmg$/);
  });
  it("rejects off-repository URLs and unfinished uploads", () => {
    const good = asset("v0.2.3", "gp-ladder_0.2.3_aarch64.dmg");
    const [row] = normalizeReleases([
      release("v0.2.3", {
        assets: [
          good,
          { ...good, state: "starter" },
          { ...good, browser_download_url: "javascript:alert(1)" },
          {
            ...good,
            browser_download_url:
              "https://github.com.evil.test/uasier/gp-ladder/releases/download/v0.2.3/a.dmg",
          },
          {
            ...good,
            browser_download_url:
              "https://github.com/other/repo/releases/download/v0.2.3/a.dmg",
          },
        ],
      }),
    ]);
    expect(row.assets).toHaveLength(1);
  });
  it("requires a real catalog rather than treating API error objects as success", () => {
    expect(() =>
      normalizeReleases({ message: "API rate limit exceeded" }),
    ).toThrow();
  });
});

describe("release notes and sizes", () => {
  it("escapes HTML from GitHub while rendering a readable heading and bullet list", () => {
    const html = renderNotes(
      "## 更新\n- **修复** `<img src=x onerror=alert(1)>`\n<script>alert(1)</script>",
    );
    expect(html).toContain("<h4>更新</h4>");
    expect(html).toContain("<strong>修复</strong>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("</ul>");
  });
  it("does not turn untrusted Markdown links into executable URLs", () => {
    expect(renderNotes("[download](javascript:alert(1))")).not.toContain("<a");
  });
  it("keeps fenced commands literal and closes unfinished fences", () => {
    const html = renderNotes("```sh\n<img src=x>\n- not a list");
    expect(html).toBe(
      "<pre><code>&lt;img src=x&gt;\n- not a list\n</code></pre>",
    );
  });
  it("formats actual asset sizes", () => {
    expect(sizeLabel(6484674)).toBe("6.2 MB");
    expect(sizeLabel(0)).toBe("");
  });
});
