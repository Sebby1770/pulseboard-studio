import contextlib
import http.client
import io
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from server import PulseBoardHandler


class LocalServerTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), PulseBoardHandler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host, self.port = self.server.server_address

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(self.host, self.port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            payload = response.read()
            return response.status, dict(response.getheaders()), payload
        finally:
            connection.close()

    def test_health_endpoint_reports_model_version_without_caching(self):
        status, headers, body = self.request("GET", "/api/score")
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["modelVersion"], "9.1")
        self.assertEqual(headers["cache-control"], "no-store")

    def test_post_requires_json_content_type(self):
        status, headers, body = self.request(
            "POST",
            "/api/score",
            body=b'{"idea":"Build a dashboard."}',
            headers={"content-type": "text/plain"},
        )
        payload = json.loads(body)

        self.assertEqual(status, 415)
        self.assertEqual(payload["error"], "Content-Type must be application/json.")
        self.assertEqual(headers["cache-control"], "no-store")

    def test_static_assets_receive_restricted_security_headers_and_asset_cache(self):
        status, headers, body = self.request("GET", "/static/assets/decision-field.png")

        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"\x89PNG"))
        self.assertEqual(headers["cache-control"], "public, max-age=3600")
        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertIn("frame-ancestors 'none'", headers["content-security-policy"])

    def test_favicon_is_served(self):
        status, headers, body = self.request("GET", "/favicon.svg")

        self.assertEqual(status, 200)
        self.assertIn(b"<svg", body)
        self.assertEqual(headers["x-content-type-options"], "nosniff")

    def test_non_public_paths_are_not_served(self):
        for path in (
            "/pulseboard/engine.py",
            "/tests/golden-engine.json",
            "/README.md",
            "/server.py",
            "/docs/ARCHITECTURE.md",
        ):
            status, _, body = self.request("GET", path)
            payload = json.loads(body)
            self.assertEqual(status, 404, path)
            self.assertEqual(payload["error"], "Not found.")

    def test_access_logs_strip_query_strings(self):
        stream = io.StringIO()

        with contextlib.redirect_stderr(stream):
            status, _, _ = self.request("GET", "/?idea=private-secret")

        self.assertEqual(status, 200)
        self.assertIn("GET / HTTP", stream.getvalue())
        self.assertNotIn("private-secret", stream.getvalue())

    def test_slate_health_and_allocation(self):
        status, _, body = self.request("GET", "/api/slate")
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["modelVersion"], "9.1")
        self.assertEqual(payload["route"], "slate")

        score_body = json.dumps(
            {
                "hoursPerWeek": 8,
                "briefs": [
                    {
                        "idea": "Build an API dashboard that tracks customer usage data and launch risks.",
                        "goal": "Ship a prototype for one SaaS workflow.",
                        "deadlineDays": 21,
                        "hoursPerWeek": 8,
                        "confidence": 4,
                        "scope": "focused",
                        "riskAppetite": "medium",
                        "evidence": "signals",
                    }
                ],
            }
        ).encode("utf-8")
        status, _, body = self.request(
            "POST",
            "/api/slate",
            body=score_body,
            headers={"content-type": "application/json"},
        )
        slate = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(slate["totalAssigned"], 8)
        self.assertEqual(slate["items"][0]["label"], "do")
        self.assertEqual(slate["items"][0]["hours"], 8)

    def test_score_body_limit_stays_small_and_slate_allows_more(self):
        oversized = json.dumps(
            {"idea": "Build a dashboard.", "padding": "x" * 20000}
        ).encode("utf-8")
        status, _, body = self.request(
            "POST",
            "/api/score",
            body=oversized,
            headers={"content-type": "application/json"},
        )
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(body)["error"], "Request body is too large.")

        slate_body = json.dumps(
            {
                "hoursPerWeek": 8,
                "padding": "y" * 20000,
                "briefs": [
                    {"idea": "Build a focused API dashboard for one customer workflow."}
                ],
            }
        ).encode("utf-8")
        self.assertGreater(len(slate_body), 16384)
        self.assertLess(len(slate_body), 65536)
        status, _, body = self.request(
            "POST",
            "/api/slate",
            body=slate_body,
            headers={"content-type": "application/json"},
        )
        self.assertEqual(status, 200, body)
        self.assertIn("items", json.loads(body))


if __name__ == "__main__":
    unittest.main()
