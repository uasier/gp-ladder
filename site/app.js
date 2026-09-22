(function () {
  var API = "https://api.github.com/repos/uasier/gp-ladder/releases"
  var FALLBACK = "https://github.com/uasier/gp-ladder/releases/latest"

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    })
  }

  function detectPlatform() {
    var ua = navigator.userAgent || ""
    if (/Android/i.test(ua)) return "android"
    if (/Windows/i.test(ua)) return "windows"
    if (/Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return "mac"
    return "other"
  }

  function findAsset(assets, test) {
    for (var i = 0; i < assets.length; i += 1) {
      if (test(assets[i].name || "")) return assets[i]
    }
    return null
  }

  function setLink(id, asset, fallbackName) {
    var node = document.getElementById(id)
    if (!node) return
    if (asset) {
      node.href = asset.browser_download_url
      var name = document.querySelector('[data-file="' + id + '"]')
      if (name) name.textContent = asset.name
    } else {
      node.href = FALLBACK
      var empty = document.querySelector('[data-file="' + id + '"]')
      if (empty && fallbackName) empty.textContent = fallbackName
    }
  }

  var shots = [
    {
      src: "./screenshots/lxsz.jpg",
      alt: "连涨天梯界面：同花顺连涨榜叠加东方财富行情，按连涨天数分档",
      cap: "同花顺连涨榜叠加东方财富行情，按天数、行业、精选筛选。",
    },
    {
      src: "./screenshots/zt.jpg",
      alt: "涨停天梯界面：东方财富涨停池按连板高度分档",
      cap: "东方财富涨停池，按连板高度分档。",
    },
    {
      src: "./screenshots/jjzt.jpg",
      alt: "昨日涨停界面：昨天涨停、今日竞价后红盘且涨幅 2% 至 8%",
      cap: "昨天涨停，今日竞价后红盘且涨幅 2%–8%。",
    },
    {
      src: "./screenshots/analysis.jpg",
      alt: "DeepSeek 短线分析：个股动能、量价与 0 到 100 短线评分",
      cap: "按 1–5 个交易日视角看盘，并给出 0–100 短线评分。",
    },
  ]

  var tabs = document.querySelectorAll("[data-shot]")
  var img = document.getElementById("showcase-img")
  var cap = document.getElementById("showcase-cap")
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var index = Number(tab.getAttribute("data-shot")) || 0
      tabs.forEach(function (item) {
        item.setAttribute("aria-selected", item === tab ? "true" : "false")
      })
      if (img && shots[index]) {
        img.src = shots[index].src
        img.alt = shots[index].alt
      }
      if (cap && shots[index]) cap.textContent = shots[index].cap
    })
  })

  var platform = detectPlatform()
  document.querySelectorAll("[data-platform]").forEach(function (card) {
    if (card.getAttribute("data-platform") === platform) card.classList.add("preferred")
  })

  var hero = document.getElementById("hero-download")
  var heroLabel = {
    mac: "下载 macOS 版",
    windows: "下载 Windows 版",
    android: "下载 Android 版",
    other: "下载安装包",
  }
  if (hero) hero.textContent = heroLabel[platform] || heroLabel.other

  fetch(API)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status)
      return res.json()
    })
    .then(function (rows) {
      var list = (rows || []).filter(function (row) {
        return row && !row.draft
      })
      var stable = list.find(function (row) {
        return !row.prerelease
      })
      var latest = stable || list[0]
      if (latest) {
        var ver = String(latest.tag_name || "").replace(/^v/i, "")
        var verNode = document.getElementById("latest-version")
        if (verNode) verNode.textContent = "最新 v" + ver
        var assets = latest.assets || []
        var macArm = findAsset(assets, function (n) {
          return /aarch64\.dmg$/i.test(n)
        })
        var macIntel = findAsset(assets, function (n) {
          return /x64\.dmg$/i.test(n)
        })
        var win = findAsset(assets, function (n) {
          return /x64-setup\.exe$/i.test(n)
        })
        var apk = findAsset(assets, function (n) {
          return /aarch64\.apk$/i.test(n)
        })
        setLink("dl-mac-arm", macArm, "gp-ladder_*_aarch64.dmg")
        setLink("dl-mac-intel", macIntel, "gp-ladder_*_x64.dmg")
        setLink("dl-win", win, "gp-ladder_*_x64-setup.exe")
        setLink("dl-android", apk, "gp-ladder_*_aarch64.apk")
        if (hero) {
          var map = { mac: macArm, windows: win, android: apk }
          var chosen = map[platform]
          hero.href = chosen ? chosen.browser_download_url : FALLBACK
        }
      }

      var box = document.getElementById("release-history")
      if (!box) return
      var html = list
        .map(function (row, index) {
          var version = String(row.tag_name || "").replace(/^v/i, "")
          var name = row.name || "v" + version
          var day = String(row.published_at || "").slice(0, 10)
          var notes = (row.body || "").trim() || "无更新说明。"
          var open = index === 0 ? " open" : ""
          var latestBadge = index === 0 ? '<span class="badge latest">最新</span>' : ""
          return (
            "<details class=\"history-item\"" +
            open +
            "><summary class=\"history-head\"><h3>" +
            esc(name) +
            "</h3>" +
            latestBadge +
            (day ? '<span class="history-date">' + esc(day) + "</span>" : "") +
            "</summary><pre class=\"history-notes\">" +
            esc(notes) +
            "</pre></details>"
          )
        })
        .join("")
      if (html) box.innerHTML = html
    })
    .catch(function () {})
})()
