"""在线服务路由和刷新行为验证。"""

from __future__ import annotations

import gzip
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from gp import web


class RankingStoreTest(unittest.TestCase):
    def test_snapshot_never_fetches_and_returns_copy(self) -> None:
        store = web.RankingStore(cache_path=None)
        store._rows = [{"股票代码": "000001"}]
        store.updated_at = "2026-09-11 12:00:00"
        with patch.object(web, "crawl_all_pages") as crawl:
            rows, updated_at = store.snapshot()
        crawl.assert_not_called()
        self.assertEqual(updated_at, "2026-09-11 12:00:00")
        rows[0]["股票代码"] = "changed"
        self.assertEqual(store._rows[0]["股票代码"], "000001")

    def test_refresh_persists_snapshot_and_failed_refresh_keeps_old_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "web_snapshot.json"
            store = web.RankingStore(cache_path=cache)
            rows = [{"股票代码": "000001", "连涨天数": "2"}]
            with patch.object(web, "crawl_all_pages", return_value=rows), patch.object(
                web, "enrich_output_rows", return_value=rows
            ):
                saved = store.refresh()
            self.assertEqual(saved[0]["股票代码"], "000001")
            self.assertTrue(store.updated_at)
            payload = json.loads(cache.read_text(encoding="utf-8"))
            self.assertEqual(payload["rows"][0]["股票代码"], "000001")

            reloaded = web.RankingStore(cache_path=cache)
            cached_rows, cached_at = reloaded.snapshot()
            self.assertEqual(cached_rows[0]["股票代码"], "000001")
            self.assertEqual(cached_at, store.updated_at)

            with patch.object(web, "crawl_all_pages", return_value=[]):
                with self.assertRaises(RuntimeError):
                    store.refresh()
            self.assertEqual(store._rows[0]["股票代码"], "000001")
            self.assertEqual(store.updated_at, cached_at)

    def test_start_refresh_runs_in_background_and_deduplicates(self) -> None:
        store = web.RankingStore(cache_path=None)
        rows = [{"股票代码": "000001"}]
        release = threading.Event()
        calls = {"n": 0}

        def blocked_crawl(*_args: object, **_kwargs: object) -> list:
            calls["n"] += 1
            release.wait(timeout=2)
            return rows

        with patch.object(web, "crawl_all_pages", side_effect=blocked_crawl), patch.object(
            web, "enrich_output_rows", return_value=rows
        ):
            first = store.start_refresh()
            second = store.start_refresh()
            self.assertEqual(first["status"], "running")
            self.assertEqual(second["job_id"], first["job_id"])
            snapshot, _ = store.snapshot()
            self.assertEqual(snapshot, [])
            release.set()
            deadline = time.time() + 2
            status = store.job_status()
            while time.time() < deadline and status["status"] == "running":
                time.sleep(0.02)
                status = store.job_status()
        self.assertEqual(calls["n"], 1)
        self.assertEqual(status["status"], "ok")
        self.assertEqual(status["count"], 1)


class WebServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_store = web.store
        web.store = web.RankingStore(cache_path=None)
        self.client = web.app.test_client()
        self.client.get("/logout")

    def tearDown(self) -> None:
        web.store = self._orig_store

    def login(self, password: str = "uasier") -> None:
        self.client.post("/login", data={"password": password})

    def wait_for_job(self, job_id: int, timeout: float = 2.0) -> dict:
        deadline = time.time() + timeout
        last: dict = {}
        while time.time() < deadline:
            last = self.client.get("/api/refresh/status").get_json() or {}
            if last.get("job_id") == job_id and last.get("status") in {"ok", "error"}:
                return last
            time.sleep(0.02)
        self.fail(f"refresh job {job_id} did not finish: {last}")

    def test_requires_password_and_accepts_default_password(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers["Location"])

        bad = self.client.post("/login", data={"password": "wrong"})
        self.assertEqual(bad.status_code, 200)
        self.assertIn("密码错误", bad.get_data(as_text=True))

        self.login()
        home = self.client.get("/")
        self.assertEqual(home.status_code, 200)

    def test_homepage_uses_cached_snapshot_without_refreshing(self) -> None:
        web.store._rows = [
            {"股票代码": "000001", "股票简称": "平安银行", "连涨天数": "3"}
        ]
        web.store.updated_at = "2026-09-11 12:00:00"
        self.login()
        with patch.object(web, "crawl_all_pages") as crawl, patch.object(
            web, "enrich_output_rows"
        ) as enrich:
            response = self.client.get("/")
        crawl.assert_not_called()
        enrich.assert_not_called()
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("2026-09-11 12:00:00", text)
        self.assertIn("数据刷新时间", text)
        self.assertIn("刷新实时数据", text)
        self.assertNotIn("__UPDATED_AT__", text)

    def test_empty_homepage_does_not_fetch_live_data(self) -> None:
        self.login()
        with patch.object(web, "crawl_all_pages") as crawl:
            response = self.client.get("/")
        crawl.assert_not_called()
        self.assertEqual(response.status_code, 200)
        self.assertIn("尚未刷新", response.get_data(as_text=True))

    def test_refresh_is_the_only_path_that_fetches_live_data(self) -> None:
        rows = [{"股票代码": "000001"}, {"股票代码": "000002"}]
        self.login()
        with patch.object(web, "crawl_all_pages", return_value=rows) as crawl, patch.object(
            web, "enrich_output_rows", return_value=rows
        ) as enrich:
            response = self.client.post("/api/refresh")
            self.assertEqual(response.status_code, 202)
            payload = response.get_json()
            self.assertEqual(payload["status"], "running")
            status = self.wait_for_job(payload["job_id"])
        crawl.assert_called_once()
        enrich.assert_called_once()
        self.assertEqual(status["status"], "ok")
        self.assertEqual(status["count"], 2)
        self.assertEqual(status["updated_at"], web.store.updated_at)
        self.assertTrue(status["updated_at"])

    def test_homepage_and_healthz_stay_up_during_refresh(self) -> None:
        rows = [{"股票代码": "000001", "连涨天数": "1"}]
        release = threading.Event()

        def blocked_crawl(*_args: object, **_kwargs: object) -> list:
            release.wait(timeout=2)
            return rows

        self.login()
        with patch.object(web, "crawl_all_pages", side_effect=blocked_crawl), patch.object(
            web, "enrich_output_rows", return_value=rows
        ):
            response = self.client.post("/api/refresh")
            self.assertEqual(response.status_code, 202)
            home = self.client.get("/")
            health = self.client.get("/healthz")
            self.assertEqual(home.status_code, 200)
            self.assertEqual(health.status_code, 200)
            self.assertEqual(health.get_data(as_text=True), "ok")
            release.set()
            self.wait_for_job(response.get_json()["job_id"])

    def test_refresh_failure_keeps_previous_snapshot(self) -> None:
        web.store._rows = [{"股票代码": "000001"}]
        web.store.updated_at = "2026-09-11 08:00:00"
        web.store._state = "ok"
        self.login()
        with patch.object(web, "crawl_all_pages", return_value=[]):
            response = self.client.post("/api/refresh")
            status = self.wait_for_job(response.get_json()["job_id"])
        self.assertEqual(response.status_code, 202)
        self.assertEqual(status["status"], "error")
        self.assertIn("未获取到榜单数据", status["error"])
        self.assertEqual(web.store._rows, [{"股票代码": "000001"}])
        self.assertEqual(web.store.updated_at, "2026-09-11 08:00:00")

    def test_refresh_requires_login(self) -> None:
        response = self.client.post("/api/refresh")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "需要登录")
        status = self.client.get("/api/refresh/status")
        self.assertEqual(status.status_code, 401)

    def test_healthz_is_public(self) -> None:
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), "ok")

    def test_snapshot_requires_login(self) -> None:
        response = self.client.get("/api/snapshot")
        self.assertEqual(response.status_code, 401)

    def test_snapshot_returns_cached_rows_without_fetching(self) -> None:
        web.store._rows = [
            {
                "股票代码": "000001",
                "连涨天数": "3",
                "所属行业": "银行",
                "行情时间": "2026-09-11 12:00:00",
            }
        ]
        web.store.updated_at = "2026-09-11 12:00:00"
        self.login()
        with patch.object(web, "crawl_all_pages") as crawl:
            response = self.client.get("/api/snapshot")
        crawl.assert_not_called()
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["max_days"], 3)
        self.assertEqual(payload["quote_at"], "2026-09-11 12:00:00")
        self.assertEqual(payload["updated_at"], "2026-09-11 12:00:00")
        self.assertEqual(payload["rows"][0]["股票代码"], "000001")
        self.assertEqual(payload["industries"], ["银行"])

    def test_status_reports_progress_while_running(self) -> None:
        rows = [{"股票代码": "000001"}]
        release = threading.Event()

        def blocked_crawl(*_args: object, **kwargs: object) -> list:
            callback = kwargs.get("on_progress")
            if callable(callback):
                callback("正在抓取连涨榜第 1 页")
            release.wait(timeout=2)
            return rows

        self.login()
        with patch.object(web, "crawl_all_pages", side_effect=blocked_crawl), patch.object(
            web, "enrich_output_rows", return_value=rows
        ):
            response = self.client.post("/api/refresh")
            status = self.client.get("/api/refresh/status").get_json()
            self.assertEqual(response.status_code, 202)
            self.assertEqual(status["status"], "running")
            self.assertTrue(status["progress"])
            release.set()
            self.wait_for_job(response.get_json()["job_id"])

    def test_gzip_html_when_client_accepts_it(self) -> None:
        self.login()
        response = self.client.get("/", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Content-Encoding"), "gzip")
        html = gzip.decompress(response.get_data()).decode("utf-8")
        self.assertIn("连涨天梯", html)
        self.assertIn("applySnapshot", html)


if __name__ == "__main__":
    unittest.main()
