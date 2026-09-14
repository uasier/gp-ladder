"""命令行入口。"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from gp.crawl import crawl_all_pages
from gp.export import save_selected_stocks, save_to_csv, save_to_html, save_to_json

OUTPUT_DIR = Path("output")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="爬取连涨股票榜单数据并保存为 CSV / JSON / HTML。")
    parser.add_argument("-o", "--output", help="输出文件路径（默认写入 output/）")
    parser.add_argument("-m", "--max-pages", type=int, help="可选，限制抓取的最大页数")
    parser.add_argument(
        "-f",
        "--format",
        choices=("csv", "json", "html"),
        default="html",
        help="输出数据格式，支持 csv/json/html，默认 html",
    )
    parser.add_argument(
        "--retail-min",
        type=float,
        help="散户指数下限（%%）。CSV/JSON 直接过滤；HTML 作为页面默认筛选",
    )
    parser.add_argument(
        "--retail-max",
        type=float,
        help="散户指数上限（%%）。CSV/JSON 直接过滤；HTML 作为页面默认筛选",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_path = OUTPUT_DIR / f"lxsz_rankings_{timestamp}.{args.format}"
    output_path = Path(args.output or default_path).expanduser().resolve()
    rows = crawl_all_pages(args.max_pages)

    if not rows:
        raise SystemExit("未获取到任何数据，程序结束。")

    if args.format == "csv":
        save_to_csv(
            rows, output_path, retail_min=args.retail_min, retail_max=args.retail_max
        )
    elif args.format == "json":
        save_to_json(
            rows, output_path, retail_min=args.retail_min, retail_max=args.retail_max
        )
    else:
        save_to_html(
            rows, output_path, retail_min=args.retail_min, retail_max=args.retail_max
        )

    selected_path, selected_count = save_selected_stocks(rows, output_path)
    print(
        f"共抓取 {len(rows)} 条记录，已保存至 {output_path}；"
        f"精选 {selected_count} 只，已写入 {selected_path}。"
    )
