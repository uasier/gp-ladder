"""在线服务路由和刷新行为验证。"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from gp import web


class WebServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = web.app.test_client()
        self.client.get("/logout")

    def login(self, password: str = "uasier") -> None:
        self.client.post("/login", data={"password": password})

    def test_requires_password_and_accepts_default_password(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers["Location"])

        bad = self.client.post("/login", data={"password": "wrong"})
        self.assertEqual(bad.status_code, 200)
        self.assertIn("密码错误", bad.get_data(as_text=True))

        with patch.object(web.store, "load", side_effect=RuntimeError("upstream unavailable")):
            self.login()
            response = self.client.get("/")
        self.assertEqual(response.status_code, 502)

    def test_refresh_forces_latest_data_and_returns_metadata(self) -> None:
        rows = [{"股票代码": "000001"}, {"股票代码": "000002"}]
        with patch.object(web.store, "load", return_value=rows) as load:
            self.login()
            response = self.client.post("/api/refresh")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["count"], 2)
        load.assert_called_once_with(force=True)

    def test_refresh_requires_login(self) -> None:
        response = self.client.post("/api/refresh")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "需要登录")


if __name__ == "__main__":
    unittest.main()
