export const REPO = "https://github.com/uasier/gp-ladder";
export const PLATFORMS = [
  {
    id: "mac-arm",
    platform: "mac",
    label: "macOS · Apple Silicon",
    extension: "DMG",
    pattern: /_aarch64\.dmg$/i,
  },
  {
    id: "mac-intel",
    platform: "mac",
    label: "macOS · Intel",
    extension: "DMG",
    pattern: /_x64\.dmg$/i,
  },
  {
    id: "win",
    platform: "windows",
    label: "Windows · 64 位",
    extension: "EXE",
    pattern: /_x64-setup\.exe$/i,
  },
  {
    id: "android",
    platform: "android",
    label: "Android · ARM64",
    extension: "APK",
    pattern: /_aarch64\.apk$/i,
  },
];

export function normalizeReleases(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.releases;
  if (!Array.isArray(rows)) throw new Error("Invalid release response");
  const seen = new Set();
  return rows
    .filter((row) => {
      if (
        !row ||
        row.draft ||
        !/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(row.tag_name) ||
        seen.has(row.tag_name)
      )
        return false;
      seen.add(row.tag_name);
      return true;
    })
    .map((row) => ({
      tag_name: row.tag_name,
      name: String(row.name || row.tag_name),
      body: String(row.body || ""),
      published_at: row.published_at || "",
      prerelease: Boolean(row.prerelease),
      html_url: `${REPO}/releases/tag/${encodeURIComponent(row.tag_name)}`,
      assets: (Array.isArray(row.assets) ? row.assets : [])
        .filter((asset) => {
          if (!asset || (asset.state && asset.state !== "uploaded"))
            return false;
          try {
            const url = new URL(asset.browser_download_url);
            return (
              url.origin === "https://github.com" &&
              !url.username &&
              !url.password &&
              url.pathname.startsWith(
                `/uasier/gp-ladder/releases/download/${encodeURIComponent(row.tag_name)}/`,
              )
            );
          } catch {
            return false;
          }
        })
        .map((asset) => ({
          name: String(asset.name || ""),
          browser_download_url: asset.browser_download_url,
          size: Number(asset.size) || 0,
          digest: /^sha256:[a-f\d]{64}$/.test(asset.digest || "")
            ? asset.digest
            : null,
        })),
    }))
    .sort(
      (a, b) =>
        (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0),
    );
}

export function latestStable(releases, preferredTag) {
  return (
    releases.find((row) => row.tag_name === preferredTag && !row.prerelease) ||
    releases.find((row) => !row.prerelease) ||
    null
  );
}

export function assetFor(release, platformId) {
  const platform = PLATFORMS.find((item) => item.id === platformId);
  return platform
    ? release.assets.find((asset) => platform.pattern.test(asset.name)) || null
    : null;
}

export function sizeLabel(bytes) {
  return bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "";
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

// Release notes are untrusted Markdown. Render text, headings, lists and code only.
export function renderNotes(text) {
  let inList = false;
  let inCode = false;
  let html = "";
  for (const line of String(text || "暂无更新说明。").split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += inCode ? "</code></pre>" : "<pre><code>";
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html += `${escapeHtml(line)}\n`;
      continue;
    }
    const bullet = /^\s*[-*]\s+/.test(line);
    if (inList && !bullet) {
      html += "</ul>";
      inList = false;
    }
    if (bullet && !inList) {
      html += "<ul>";
      inList = true;
    }
    const content = escapeHtml(line.replace(/^\s*(?:#{1,6}\s+|[-*]\s+)/, ""))
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    if (bullet) html += `<li>${content}</li>`;
    else if (/^#{1,6}\s+/.test(line)) html += `<h4>${content}</h4>`;
    else if (line.trim()) html += `<p>${content}</p>`;
  }
  return html + (inList ? "</ul>" : "") + (inCode ? "</code></pre>" : "");
}
