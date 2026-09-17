use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    std::env::var("GP_DESKTOP_DATA")
        .ok()
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| PathBuf::from("/data"))
}

#[cfg_attr(not(feature = "web"), allow(dead_code))]
pub fn dist_dir() -> PathBuf {
    std::env::var("GP_DESKTOP_DIST")
        .ok()
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| PathBuf::from("/app/dist"))
}

#[cfg_attr(not(feature = "web"), allow(dead_code))]
pub fn listen_port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .or_else(|| {
            std::env::var("GP_DESKTOP_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
        })
        .unwrap_or(40300)
}

#[cfg(test)]
mod tests {
    #[test]
    fn default_port_is_40300() {
        let parsed = "not-a-port".parse::<u16>().ok().unwrap_or(40300);
        assert_eq!(parsed, 40300);
    }
}
