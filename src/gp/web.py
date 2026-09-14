"""在线榜单服务：登录、页面展示与手动刷新实时数据。"""

from __future__ import annotations

import gzip
import json
import os
import sys
import threading
import traceback
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

from flask import Flask, jsonify, redirect, render_template_string, request, session, url_for

from gp.crawl import crawl_all_pages
from gp.enrich import enrich_output_rows
from gp.export import generate_html_content

_UNSET = object()
DEFAULT_CACHE_PATH = "output/web_snapshot.json"


def _resolve_cache_path(cache_path: Any) -> Path | None:
    """解析快照路径：未传则读环境变量，显式 None 表示不落盘。"""

    if cache_path is None:
        return None
    if cache_path is _UNSET:
        raw = os.getenv("GP_CACHE_PATH", DEFAULT_CACHE_PATH).strip()
        return Path(raw) if raw else None
    return Path(cache_path)


class RankingStore:
    """缓存最近一次手动刷新的榜单；打开页面只读快照，不请求外部站点。"""

    def __init__(
        self,
        max_pages: int | None = None,
        cache_path: Any = _UNSET,
    ) -> None:
        self.max_pages = max_pages
        self.cache_path = _resolve_cache_path(cache_path)
        self._rows: List[Dict[str, str]] = []
        self.updated_at: str | None = None
        self._lock = threading.Lock()
        self._refreshing = threading.Lock()
        self._job_id = 0
        self._state = "idle"
        self._error: str | None = None
        self._progress = ""
        self._load_cache()
        if self._rows:
            self._state = "ok"

    def snapshot(self) -> Tuple[List[Dict[str, str]], str | None]:
        """返回内存中的榜单副本，绝不触发抓取。"""

        with self._lock:
            return [dict(row) for row in self._rows], self.updated_at

    def job_status(self) -> Dict[str, Any]:
        """当前刷新任务状态，供前端轮询。"""

        with self._lock:
            return self._status_unlocked()

    def start_refresh(self) -> Dict[str, Any]:
        """启动后台刷新并立即返回，避免卡住唯一的 HTTP worker。"""

        with self._lock:
            if self._state == "running":
                return self._status_unlocked()
            self._job_id += 1
            job_id = self._job_id
            self._state = "running"
            self._error = None
            self._progress = "正在抓取同花顺连涨榜…"
            started = self._status_unlocked()
        thread = threading.Thread(
            target=self._run_refresh,
            args=(job_id,),
            name=f"gp-refresh-{job_id}",
            daemon=True,
        )
        thread.start()
        return started

    def refresh(self) -> List[Dict[str, str]]:
        """抓取同花顺榜单并叠加东方财富实时行情，成功后才替换快照。"""

        with self._refreshing:
            self._set_progress("正在抓取同花顺连涨榜…")
            rows = crawl_all_pages(self.max_pages, on_progress=self._set_progress)
            if not rows:
                raise RuntimeError("未获取到榜单数据")
            self._set_progress("正在拉取东方财富行情…")
            enriched = enrich_output_rows(rows, on_progress=self._set_progress)
            self._set_progress("正在保存快照…")
            updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with self._lock:
                self._rows = [dict(row) for row in enriched]
                self.updated_at = updated_at
                saved = [dict(row) for row in self._rows]
            try:
                self._save_cache(saved, updated_at)
            except OSError:
                pass
            return saved

    def _status_unlocked(self) -> Dict[str, Any]:
        return {
            "status": self._state,
            "job_id": self._job_id,
            "updated_at": self.updated_at,
            "count": len(self._rows),
            "error": self._error,
            "progress": self._progress,
        }

    def _set_progress(self, message: str) -> None:
        with self._lock:
            self._progress = message

    def _run_refresh(self, job_id: int) -> None:
        try:
            self.refresh()
            with self._lock:
                if self._job_id == job_id:
                    self._state = "ok"
                    self._error = None
                    self._progress = f"已更新 {len(self._rows)} 只"
        except Exception as exc:
            print(f"后台刷新失败: {exc}", file=sys.stderr)
            if not isinstance(exc, RuntimeError):
                traceback.print_exc()
            with self._lock:
                if self._job_id == job_id:
                    self._state = "error"
                    self._error = str(exc)
                    self._progress = ""

    def _load_cache(self) -> None:
        if self.cache_path is None or not self.cache_path.is_file():
            return
        try:
            payload = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError):
            return
        if not isinstance(payload, dict):
            return
        rows = payload.get("rows")
        if not isinstance(rows, list):
            return
        cleaned = [dict(row) for row in rows if isinstance(row, dict)]
        updated = payload.get("updated_at")
        self._rows = cleaned
        self.updated_at = (
            updated.strip() if isinstance(updated, str) and updated.strip() else None
        )

    def _save_cache(self, rows: List[Dict[str, str]], updated_at: str | None) -> None:
        if self.cache_path is None:
            return
        payload = {"updated_at": updated_at, "rows": rows}
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.cache_path.with_name(self.cache_path.name + ".tmp")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        tmp_path.replace(self.cache_path)


def build_snapshot_payload(
    rows: List[Dict[str, str]], updated_at: str | None
) -> Dict[str, Any]:
    """把缓存榜单整理成前端可直接套用的快照。"""

    max_days = 0
    industries: set[str] = set()
    quote_times: List[str] = []
    for row in rows:
        industries.add(row.get("所属行业") or "未知")
        try:
            max_days = max(max_days, int(row.get("连涨天数") or 0))
        except (TypeError, ValueError):
            pass
        quote_time = (row.get("行情时间") or "").strip()
        if quote_time:
            quote_times.append(quote_time)
    return {
        "rows": [dict(row) for row in rows],
        "updated_at": updated_at,
        "count": len(rows),
        "max_days": max_days,
        "quote_at": max(quote_times) if quote_times else None,
        "industries": sorted(industries),
    }


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


@app.get("/healthz")
def healthz() -> Any:
    """给 Docker 健康检查用的轻量接口，不读榜单、不登录。"""

    return "ok", 200


@app.get("/")
@login_required
def index() -> Any:
    rows, updated_at = store.snapshot()
    return generate_html_content(rows, updated_at=updated_at)


@app.post("/api/refresh")
@login_required
def refresh() -> Any:
    return jsonify(store.start_refresh()), 202


@app.get("/api/refresh/status")
@login_required
def refresh_status() -> Any:
    return jsonify(store.job_status())


@app.get("/api/snapshot")
@login_required
def api_snapshot() -> Any:
    rows, updated_at = store.snapshot()
    return jsonify(build_snapshot_payload(rows, updated_at))


@app.after_request
def gzip_response(response: Any) -> Any:
    """压缩 HTML/JSON，避免刷新后整页下发显得像卡住。"""

    if getattr(response, "direct_passthrough", False):
        return response
    accept = request.headers.get("Accept-Encoding", "")
    if "gzip" not in accept.lower():
        return response
    if response.status_code < 200 or response.status_code >= 300:
        return response
    if response.mimetype not in {"application/json", "text/html"}:
        return response
    if response.headers.get("Content-Encoding"):
        return response
    data = response.get_data()
    if not data or len(data) < 512:
        return response
    compressed = gzip.compress(data, compresslevel=5)
    if len(compressed) >= len(data):
        return response
    response.set_data(compressed)
    response.headers["Content-Encoding"] = "gzip"
    response.headers["Content-Length"] = str(len(compressed))
    vary = response.headers.get("Vary", "")
    if "Accept-Encoding" not in vary:
        response.headers["Vary"] = (
            f"{vary}, Accept-Encoding" if vary else "Accept-Encoding"
        )
    return response


if __name__ == "__main__":  # pragma: no cover
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
