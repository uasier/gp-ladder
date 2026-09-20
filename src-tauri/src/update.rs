//! 从 GitHub Releases 检查新版本，并下载当前平台安装包。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const DEFAULT_REPO: &str = "uasier/gp-ladder";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub current_version: String,
    pub latest_version: String,
    pub available: bool,
    pub name: String,
    pub notes: String,
    pub html_url: String,
    pub asset_name: String,
    pub asset_url: String,
    pub repo: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub fn github_repo() -> String {
    std::env::var("GP_GITHUB_REPO")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_REPO.into())
}

pub fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "macos-arm64"
        } else {
            "macos-x64"
        }
    } else if cfg!(target_os = "windows") {
        "windows-x64"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "linux"
    }
}

/// 去掉可选的 `v` 前缀，解析成 (major, minor, patch)。
pub fn parse_semver(raw: &str) -> Option<(u64, u64, u64)> {
    let s = raw.trim().trim_start_matches(['v', 'V']);
    let core = s.split(['-', '+']).next().unwrap_or(s);
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let patch = parts.next().unwrap_or("0").parse().unwrap_or(0);
    Some((major, minor, patch))
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_semver(latest), parse_semver(current)) {
        (Some(a), Some(b)) => a > b,
        _ => false,
    }
}

pub fn asset_matches(name: &str, platform: &str) -> bool {
    let n = name.to_ascii_lowercase();
    match platform {
        "macos-arm64" => {
            n.ends_with(".dmg") && (n.contains("aarch64") || n.contains("arm64"))
        }
        "macos-x64" => {
            n.ends_with(".dmg")
                && (n.contains("_x64")
                    || n.contains("-x64")
                    || n.contains("x86_64")
                    || n.contains("intel"))
                && !n.contains("aarch64")
                && !n.contains("arm64")
        }
        "windows-x64" => n.ends_with(".exe") && (n.contains("setup") || n.contains("nsis")),
        "linux" => n.ends_with(".appimage") || n.ends_with(".deb"),
        "android" => n.ends_with(".apk"),
        _ => false,
    }
}

fn pick_asset<'a>(assets: &'a [GithubAsset], platform: &str) -> Option<&'a GithubAsset> {
    if platform == "android" {
        let matched: Vec<_> = assets
            .iter()
            .filter(|a| asset_matches(&a.name, platform))
            .collect();
        return matched
            .iter()
            .copied()
            .find(|a| a.name.to_ascii_lowercase().contains("universal"))
            .or_else(|| {
                matched.iter().copied().find(|a| {
                    let n = a.name.to_ascii_lowercase();
                    n.contains("aarch64") || n.contains("arm64")
                })
            })
            .or_else(|| matched.first().copied());
    }
    assets.iter().find(|a| asset_matches(&a.name, platform))
}

fn empty_check() -> UpdateCheck {
    UpdateCheck {
        current_version: current_version().into(),
        latest_version: current_version().into(),
        available: false,
        name: String::new(),
        notes: String::new(),
        html_url: format!("https://github.com/{}/releases", github_repo()),
        asset_name: String::new(),
        asset_url: String::new(),
        repo: github_repo(),
    }
}

fn from_release(rel: &GithubRelease, platform: &str) -> UpdateCheck {
    let latest = rel.tag_name.trim().trim_start_matches(['v', 'V']).to_string();
    let current = current_version().to_string();
    let asset = pick_asset(&rel.assets, platform);
    UpdateCheck {
        current_version: current.clone(),
        latest_version: latest.clone(),
        available: is_newer(&latest, &current) && !rel.draft && !rel.prerelease,
        name: if rel.name.trim().is_empty() {
            format!("v{latest}")
        } else {
            rel.name.clone()
        },
        notes: rel.body.trim().to_string(),
        html_url: if rel.html_url.trim().is_empty() {
            format!("https://github.com/{}/releases/tag/{}", github_repo(), rel.tag_name)
        } else {
            rel.html_url.clone()
        },
        asset_name: asset.map(|a| a.name.clone()).unwrap_or_default(),
        asset_url: asset.map(|a| a.browser_download_url.clone()).unwrap_or_default(),
        repo: github_repo(),
    }
}

fn fetch_latest_release() -> Result<Option<GithubRelease>, String> {
    let repo = github_repo();
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let ua = format!("gp-ladder/{ver} (+https://github.com/{repo})", ver = current_version());
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(ua)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .map_err(|e| format!("请求 GitHub Releases 失败: {e}"))?;
    let status = response.status();
    if status.as_u16() == 404 {
        return Ok(None);
    }
    let text = response
        .text()
        .map_err(|e| format!("读取 GitHub 响应失败: {e}"))?;
    if !status.is_success() {
        return Err(format!("GitHub API HTTP {status}: {}", text.chars().take(180).collect::<String>()));
    }
    serde_json::from_str(&text).map(Some).map_err(|e| format!("解析 GitHub Release JSON 失败: {e}"))
}

/// `force` 预留：当前每次都访问 GitHub；前端用本地缓存控制频率。
pub fn check_update(_force: bool) -> Result<UpdateCheck, String> {
    match fetch_latest_release()? {
        None => Ok(empty_check()),
        Some(rel) => Ok(from_release(&rel, current_platform())),
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn open_url(url: &str) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("链接为空".into());
    }
    Err("请使用系统浏览器打开该链接".into())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn open_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("链接为空".into());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("无法打开链接: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("无法打开链接: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("无法打开链接: {e}"))?;
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法打开安装包: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("无法打开安装包: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法打开安装包: {e}"))?;
    }
    Ok(())
}

#[cfg_attr(any(target_os = "android", target_os = "ios"), allow(dead_code))]
fn safe_file_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err("安装包文件名不合法".into());
    }
    let base = Path::new(trimmed)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .trim();
    if base.is_empty() || base != trimmed {
        return Err("安装包文件名不合法".into());
    }
    Ok(base.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    let ua = format!(
        "gp-ladder/{ver} (+https://github.com/{repo})",
        ver = current_version(),
        repo = github_repo()
    );
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(180))
        .user_agent(ua)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {e}"))?;
    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("下载安装包失败: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("下载安装包 HTTP {status}"));
    }
    let bytes = response
        .bytes()
        .map_err(|e| format!("读取安装包失败: {e}"))?;
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("无法创建临时目录: {e}"))?;
    }
    fs::write(dest, &bytes).map_err(|e| format!("写入安装包失败: {e}"))
}

/// 下载当前平台安装包到临时目录并打开。返回本地路径。
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn install_update() -> Result<String, String> {
    let info = check_update(true)?;
    if !info.available {
        return Err("当前已是最新版本".into());
    }
    if info.asset_url.trim().is_empty() {
        if !info.html_url.trim().is_empty() {
            open_url(&info.html_url)?;
            return Ok(info.html_url);
        }
        return Err("GitHub Release 中没有适合当前系统的安装包".into());
    }
    let name = safe_file_name(&info.asset_name)?;
    let dest: PathBuf = std::env::temp_dir().join("gp-ladder-updates").join(&name);
    crate::applog::info("update", format!("开始下载 {name}"));
    download_file(&info.asset_url, &dest)?;
    open_path(&dest)?;
    crate::applog::info("update", format!("已打开安装包 {}", dest.display()));
    Ok(dest.to_string_lossy().into_owned())
}

#[allow(dead_code)]
pub fn open_release(url: Option<String>) -> Result<(), String> {
    let target = match url {
        Some(u) if !u.trim().is_empty() => u,
        _ => check_update(false)?.html_url,
    };
    open_url(&target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> GithubAsset {
        GithubAsset {
            name: name.into(),
            browser_download_url: format!("https://example.invalid/{name}"),
        }
    }

    #[test]
    fn parse_and_compare_semver() {
        assert_eq!(parse_semver("v0.1.0"), Some((0, 1, 0)));
        assert_eq!(parse_semver("1.2.3-beta"), Some((1, 2, 3)));
        assert!(is_newer("0.2.0", "0.1.0"));
        assert!(is_newer("v0.1.1", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("not-a-version", "0.1.0"));
    }

    #[test]
    fn pick_platform_assets() {
        let assets = vec![
            asset("连涨天梯_0.2.0_aarch64.dmg"),
            asset("连涨天梯_0.2.0_x64.dmg"),
            asset("连涨天梯_0.2.0_x64-setup.exe"),
        ];
        assert_eq!(
            pick_asset(&assets, "macos-arm64").unwrap().name,
            "连涨天梯_0.2.0_aarch64.dmg"
        );
        assert_eq!(
            pick_asset(&assets, "macos-x64").unwrap().name,
            "连涨天梯_0.2.0_x64.dmg"
        );
        assert_eq!(
            pick_asset(&assets, "windows-x64").unwrap().name,
            "连涨天梯_0.2.0_x64-setup.exe"
        );
        assert!(pick_asset(&assets, "linux").is_none());

        let ascii = vec![
            asset("gp-ladder_0.2.0_aarch64.dmg"),
            asset("gp-ladder_0.2.0_x64.dmg"),
            asset("gp-ladder_0.2.0_x64-setup.exe"),
            asset("gp-ladder_0.2.0_aarch64.apk"),
            asset("gp-ladder_0.2.0_universal.apk"),
            asset("gp-ladder_0.2.0_aarch64.app.tar.gz"),
        ];
        assert_eq!(
            pick_asset(&ascii, "macos-arm64").unwrap().name,
            "gp-ladder_0.2.0_aarch64.dmg"
        );
        assert_eq!(
            pick_asset(&ascii, "macos-x64").unwrap().name,
            "gp-ladder_0.2.0_x64.dmg"
        );
        assert_eq!(
            pick_asset(&ascii, "windows-x64").unwrap().name,
            "gp-ladder_0.2.0_x64-setup.exe"
        );
        assert_eq!(
            pick_asset(&ascii, "android").unwrap().name,
            "gp-ladder_0.2.0_universal.apk"
        );
        assert!(pick_asset(&assets, "android").is_none());
    }

    #[test]
    fn from_release_marks_newer_and_skips_draft() {
        let rel = GithubRelease {
            tag_name: "v9.9.9".into(),
            name: "连涨天梯 v9.9.9".into(),
            body: "修复实体涨幅".into(),
            html_url: "https://github.com/uasier/gp-ladder/releases/tag/v9.9.9".into(),
            draft: false,
            prerelease: false,
            assets: vec![asset("连涨天梯_9.9.9_aarch64.dmg")],
        };
        let info = from_release(&rel, "macos-arm64");
        assert!(info.available);
        assert_eq!(info.latest_version, "9.9.9");
        assert_eq!(info.asset_name, "连涨天梯_9.9.9_aarch64.dmg");

        let mut draft = rel;
        draft.draft = true;
        assert!(!from_release(&draft, "macos-arm64").available);
    }

    #[test]
    fn same_version_is_not_available() {
        let ver = current_version();
        let rel = GithubRelease {
            tag_name: format!("v{ver}"),
            name: String::new(),
            body: String::new(),
            html_url: String::new(),
            draft: false,
            prerelease: false,
            assets: vec![],
        };
        let info = from_release(&rel, "macos-arm64");
        assert!(!info.available);
        assert_eq!(info.latest_version, ver);
    }

    #[test]
    fn safe_name_rejects_paths() {
        assert!(safe_file_name("连涨天梯_0.1.0_aarch64.dmg").is_ok());
        assert!(safe_file_name("../evil.exe").is_err());
        assert!(safe_file_name("").is_err());
    }
}
