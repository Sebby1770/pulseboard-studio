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
        self.assertEqual(payload["modelVersion"], "7.0")
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

    def test_access_logs_strip_query_strings(self):
        stream = io.StringIO()

        with contextlib.redirect_stderr(stream):
            status, _, _ = self.request("GET", "/?idea=private-secret")

        self.assertEqual(status, 200)
        self.assertIn("GET / HTTP", stream.getvalue())
        self.assertNotIn("private-secret", stream.getvalue())


if __name__ == "__main__":
    unittest.main()
