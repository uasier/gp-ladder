#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(feature = "desktop")]
    gp_ladder_lib::run();

    #[cfg(not(feature = "desktop"))]
    {
        eprintln!("桌面端需要 --features desktop（默认已开启）");
        std::process::exit(1);
    }
}
