"""在线榜单服务：登录、页面展示与最新数据刷新。"""

from __future__ import annotations

import os
import threading
from datetime import datetime
from functools import wraps
from typing import Any, Callable, Dict, List

from flask import Flask, jsonify, redirect, render_template_string, request, session, url_for

from gp.crawl import crawl_all_pages
from gp.enrich import enrich_output_rows
from gp.export import generate_html_content


class RankingStore:
    """保存最近一次成功抓取结果，避免每次打开页面都请求外部站点。"""

    def __init__(self, max_pages: int | None = None) -> None:
        self.max_pages = max_pages
        self._rows: List[Dict[str, str]] = []
        self.updated_at: str | None = None
        self._lock = threading.Lock()

    def load(self, *, force: bool = False) -> List[Dict[str, str]]:
        if self._rows and not force:
            return self._rows
        with self._lock:
            if self._rows and not force:
                return self._rows
            rows = crawl_all_pages(self.max_pages)
            if not rows:
                raise RuntimeError("未获取到榜单数据")
            self._rows = enrich_output_rows(rows)
            self.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            return self._rows


def _parse_max_pages() -> int | None:
    value = os.getenv("GP_MAX_PAGES", "").strip()
    if not value:
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed > 0 else None


app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv("GP_SECRET_KEY", "gp-local-session-key"),
    GP_PASSWORD=os.getenv("GP_PASSWORD", "uasier"),
)
store = RankingStore(_parse_max_pages())


LOGIN_PAGE = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>连涨天梯 - 访问验证</title><style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:#f5f7fb;color:#182230}
@media(prefers-color-scheme:dark){:root{background:#0b0f17;color:#f8fafc}.panel{background:#151d2c;border-color:#2b3547}.panel input{background:#0e131d;color:#f8fafc;border-color:#3a465b}}
body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;box-sizing:border-box}.panel{width:min(100%,360px);padding:32px;border:1px solid #dce3ee;border-radius:12px;background:#fff;box-shadow:0 10px 30px #1c2d4a18;box-sizing:border-box}h1{margin:0 0 8px;font-size:24px}.hint{margin:0 0 24px;color:#6b778c;font-size:14px}.panel label{display:block;font-size:13px;font-weight:600;margin-bottom:8px}.panel input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:16px;background:#fff;color:#182230}.panel button{width:100%;margin-top:16px;border:0;border-radius:6px;padding:11px;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;cursor:pointer}.error{margin:0 0 14px;color:#dc2626;font-size:13px}
</style></head><body><main class="panel"><h1>连涨天梯</h1><p class="hint">输入访问密码查看最新榜单</p>{% if error %}<p class="error">密码错误，请重试</p>{% endif %}<form method="post" action="{{ url_for('login') }}"><label for="password">访问密码</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">进入榜单</button></form></main></body></html>"""


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    """限制页面和刷新接口必须先通过密码验证。"""

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        if not session.get("authenticated"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "需要登录"}), 401
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


@app.route("/login", methods=["GET", "POST"])
def login() -> Any:
    error = False
    if request.method == "POST":
        if request.form.get("password", "") == app.config["GP_PASSWORD"]:
            session["authenticated"] = True
            return redirect(request.args.get("next") or url_for("index"))
        error = True
    return render_template_string(LOGIN_PAGE, error=error)


@app.post("/logout")
def logout() -> Any:
    session.clear()
    return redirect(url_for("login"))


@app.get("/")
@login_required
def index() -> Any:
    try:
        rows = store.load()
    except Exception as exc:
        return f"暂时无法获取榜单数据：{exc}", 502
    return generate_html_content(rows)


@app.post("/api/refresh")
@login_required
def refresh() -> Any:
    try:
        rows = store.load(force=True)
    except Exception as exc:
        return jsonify({"error": f"刷新失败：{exc}"}), 502
    return jsonify({"count": len(rows), "updated_at": store.updated_at})


if __name__ == "__main__":  # pragma: no cover
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
