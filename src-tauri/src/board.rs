//! 榜单类型：连涨 / 涨停 / 昨日涨停今红。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum BoardKind {
    #[default]
    Lxsz,
    Zt,
    Jjzt,
}

impl BoardKind {
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
            Some("zt") | Some("limitup") | Some("limit-up") => Self::Zt,
            Some("jjzt") | Some("auction") | Some("jingjia") => Self::Jjzt,
            _ => Self::Lxsz,
        }
    }

    #[allow(dead_code)]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lxsz => "lxsz",
            Self::Zt => "zt",
            Self::Jjzt => "jjzt",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Self::Lxsz => "连涨榜",
            Self::Zt => "涨停榜",
            Self::Jjzt => "昨日涨停",
        }
    }
}
