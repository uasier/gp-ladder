#[cfg(feature = "web")]
#[tokio::main]
async fn main() {
    if let Err(err) = gp_ladder_lib::server::run().await {
        eprintln!("连涨天梯服务退出: {err}");
        std::process::exit(1);
    }
}

#[cfg(not(feature = "web"))]
fn main() {
    eprintln!("gp-ladder-server 需要 --features web 编译");
    std::process::exit(1);
}
