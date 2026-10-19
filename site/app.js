import {
  PLATFORMS,
  REPO,
  normalizeReleases,
  latestStable,
  assetFor,
  sizeLabel,
  escapeHtml as esc,
  renderNotes,
} from "./releases.js";

const $ = (selector) => document.querySelector(selector);
const shots = [
  { title: "连涨天梯", cap: "按连涨天数分档，把市场梯队展开来看。" },
  { title: "涨停天梯", cap: "按连板高度排列，观察涨停梯队的变化。" },
  {
    title: "昨日涨停",
    cap: "跟踪昨日涨停、今日竞价后红盘且涨幅 2%–8% 的标的。",
  },
  { title: "短线分析", cap: "结合量价、动能与风险，多一个整理思路的视角。" },
];

function showShot(index, focus = false) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= shots.length) return;
  document
    .querySelectorAll("#showcase-tabs [data-shot]")
    .forEach((tab, position) => {
      const active = position === i;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
  document
    .querySelectorAll(".showcase-stage [data-frame]")
    .forEach((frame, position) => {
      frame.classList.toggle("is-on", position === i);
      frame.hidden = position !== i;
    });
  $("#showcase-title").textContent = shots[i].title;
  $("#showcase-cap").textContent = shots[i].cap;
}

const tablist = $("#showcase-tabs");
tablist.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-shot]");
  if (tab) showShot(tab.dataset.shot);
});
tablist.addEventListener("keydown", (event) => {
  const active = Number(
    tablist.querySelector('[aria-selected="true"]').dataset.shot,
  );
  const positions = {
    ArrowRight: (active + 1) % shots.length,
    ArrowLeft: (active + shots.length - 1) % shots.length,
    Home: 0,
    End: shots.length - 1,
  };
  if (!(event.key in positions)) return;
  event.preventDefault();
  showShot(positions[event.key], true);
});

const menu = $("#site-menu");
const menuToggle = $(".menu-toggle");
function closeMenu() {
  menu.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "展开导航");
}
menuToggle.addEventListener("click", () => {
  const open = menu.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "收起导航" : "展开导航");
});
menu.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.classList.contains("is-open")) {
    closeMenu();
    menuToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".nav")) closeMenu();
  if (event.target.closest('a[href="#install-help"]'))
    $("#install-help").open = true;
});
matchMedia("(min-width: 601px)").addEventListener("change", closeMenu);

const ua = navigator.userAgent;
const platform = /Android/i.test(ua)
  ? "android"
  : /Windows/i.test(ua)
    ? "windows"
    : /Macintosh/i.test(ua) && navigator.maxTouchPoints < 2
      ? "mac"
      : "other";
document
  .querySelectorAll("[data-platform]")
  .forEach((card) =>
    card.classList.toggle("preferred", card.dataset.platform === platform),
  );
const labels = {
  mac: "下载 macOS 版",
  windows: "下载 Windows 版",
  android: "下载 Android 版",
  other: "免费下载",
};
$("#hero-download span").textContent = labels[platform];
$("#year").textContent = new Date().getFullYear();

// Reveal installation help when navigating directly to its anchor.
function openAnchoredHelp() {
  if (location.hash === "#install-help") $("#install-help").open = true;
}
addEventListener("hashchange", openAnchoredHelp);
openAnchoredHelp();

let releases = [];
let latest = null;
const selector = $("#version-select");
const status = $("#release-status");
const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      }).format(date);
};

function selectRelease(tag) {
  const release = releases.find((row) => row.tag_name === tag);
  if (!release) return;
  $("#release-date").textContent =
    `${dateLabel(release.published_at)} 发布${release.prerelease ? " · 预览版" : ""}`;
  for (const platform of PLATFORMS) {
    const asset = assetFor(release, platform.id);
    const link = $(`#dl-${platform.id}`);
    const filename = $(`[data-file="${platform.id}"]`);
    const meta = $(`[data-meta="${platform.id}"]`);
    if (asset) {
      link.href = asset.browser_download_url;
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
      link.setAttribute(
        "aria-label",
        `下载 ${release.tag_name} ${platform.label} ${sizeLabel(asset.size)}`,
      );
      link.innerHTML = `下载 ${platform.extension} <svg class="icon" aria-hidden="true"><use href="#i-download"/></svg>`;
      filename.textContent = asset.name;
      meta.textContent = [sizeLabel(asset.size), platform.extension]
        .filter(Boolean)
        .join(" · ");
    } else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
      link.setAttribute(
        "aria-label",
        `${release.tag_name} 未提供 ${platform.label} 安装包`,
      );
      link.textContent = "此版本未提供";
      filename.textContent = "可选择其他版本";
      meta.textContent = "暂无安装包";
    }
  }
}
selector.addEventListener("change", () => selectRelease(selector.value));

function renderHistory() {
  $("#release-history").innerHTML = releases
    .map((release) => {
      const isLatest = release.tag_name === latest?.tag_name;
      const badge = release.prerelease
        ? '<span class="badge preview">预览版</span>'
        : isLatest
          ? '<span class="badge latest">最新稳定版</span>'
          : "";
      const downloads = PLATFORMS.map((platform) => {
        const asset = assetFor(release, platform.id);
        return asset
          ? `<a href="${esc(asset.browser_download_url)}" aria-label="下载 ${esc(release.tag_name)} ${esc(platform.label)}" title="${esc(asset.name)}"><span>${esc(platform.label)}</span><small>${esc(sizeLabel(asset.size))} ↓</small></a>`
          : `<span class="history-missing">${esc(platform.label)} · 未提供</span>`;
      }).join("");
      return `<details class="history-item"${isLatest ? " open" : ""}><summary class="history-head"><span class="history-version">${esc(release.tag_name)}</span>${badge}<time class="history-date" datetime="${esc(release.published_at)}">${esc(dateLabel(release.published_at))}</time></summary><div class="history-content"><div class="history-notes">${renderNotes(release.body)}</div><div class="history-assets">${downloads}<a class="release-link" href="${esc(release.html_url)}" target="_blank" rel="noopener noreferrer">完整发布说明与附件 ↗</a></div></div></details>`;
    })
    .join("");
}

async function fetchJson(url, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadReleases() {
  const sources = [document.body.dataset.releasesApi, "./releases.json"];
  for (const [index, source] of sources.entries()) {
    try {
      const payload = await fetchJson(source);
      releases = normalizeReleases(payload);
      if (!releases.length) throw new Error("No published releases");
      latest = latestStable(releases, payload.latest);
      const selected = latest || releases[0];
      selector.innerHTML = releases
        .map(
          (release) =>
            `<option value="${esc(release.tag_name)}">${esc(release.tag_name)}${release.prerelease ? " · 预览版" : release.tag_name === latest?.tag_name ? " · 最新稳定版" : ""}</option>`,
        )
        .join("");
      selector.disabled = false;
      selector.value = selected.tag_name;
      $("#latest-version").textContent = latest
        ? `${latest.tag_name} 已发布 · 查看更新`
        : `${selected.tag_name} · 预览版`;
      selectRelease(selected.tag_name);
      renderHistory();
      const cached = index > 0 || payload.stale;
      status.classList.toggle("is-warning", Boolean(cached));
      status.textContent = cached
        ? `显示已缓存的版本${payload.updatedAt ? `（${dateLabel(payload.updatedAt)}）` : ""}。最新发布以 GitHub 为准。`
        : "";
      return;
    } catch {
      /* Try the bundled manifest if the release service is unavailable. */
    }
  }
  selector.innerHTML = "<option>版本列表暂不可用</option>";
  status.classList.add("is-warning");
  status.innerHTML = `暂时无法获取版本，请前往 <a href="${REPO}/releases">GitHub Releases ↗</a> 下载。`;
  $("#release-history").innerHTML =
    `<p class="history-empty">更新记录暂不可用。<a class="text-link" href="${REPO}/releases">前往 GitHub 查看 ↗</a></p>`;
  document.querySelectorAll(".download-button").forEach((link) => {
    link.textContent = "前往 GitHub ↗";
  });
}
loadReleases();
