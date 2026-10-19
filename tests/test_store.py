import http.client
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

_HOME_DB = Path.home() / ".pulseboard" / "studio.sqlite"
_HOME_DB_MTIME = _HOME_DB.stat().st_mtime_ns if _HOME_DB.exists() else None
_HOME_DIR_EXISTED = _HOME_DB.parent.exists()
_TEMP = tempfile.TemporaryDirectory(prefix="pulseboard-store-")
os.environ["PULSEBOARD_DB"] = str(Path(_TEMP.name) / "import-guard.sqlite")

from pulseboard import MODEL_VERSION, __version__  # noqa: E402
from server import PulseBoardHandler  # noqa: E402

JSON_HEADERS = {"content-type": "application/json"}


class JournalStoreTests(unittest.TestCase):
    def setUp(self):
        self.db_path = str(Path(_TEMP.name) / f"{id(self)}.sqlite")
        os.environ["PULSEBOARD_DB"] = self.db_path
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), PulseBoardHandler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host, self.port = self.server.server_address

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        os.environ["PULSEBOARD_DB"] = str(Path(_TEMP.name) / "import-guard.sqlite")
        self.assertFalse((Path(_TEMP.name) / "import-guard.sqlite").exists())
        if _HOME_DB_MTIME is None:
            self.assertFalse(_HOME_DB.exists())
        else:
            self.assertEqual(_HOME_DB.stat().st_mtime_ns, _HOME_DB_MTIME)
        if not _HOME_DIR_EXISTED:
            self.assertFalse(_HOME_DB.parent.exists())

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(self.host, self.port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            payload = response.read()
            return response.status, dict(response.getheaders()), payload
        finally:
            connection.close()

    def post_json(self, path, payload):
        return self.request(
            "POST",
            path,
            body=json.dumps(payload).encode("utf-8"),
            headers=JSON_HEADERS,
        )

    def create_journal(self, idea, verdict="GO", score=75, outcome="", model_version="9.1"):
        status, _, body = self.post_json(
            "/api/journal",
            {
                "idea": idea,
                "verdict": verdict,
                "score": score,
                "outcome": outcome,
                "model_version": model_version,
            },
        )
        self.assertEqual(status, 200, body)
        return json.loads(body)

    def test_package_version_stays_ahead_of_unchanged_model(self):
        self.assertEqual(__version__, "2.1.0")
        self.assertEqual(MODEL_VERSION, "9.1")

    def test_create_returns_the_row_and_lists_newest_first(self):
        self.assertFalse(Path(self.db_path).exists())
        status, _, body = self.request("GET", "/api/journal")
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body), {"items": []})

        older = self.create_journal("Older idea", verdict="CONDITIONAL", score=50, outcome="held")
        newer = self.create_journal("Newer idea", verdict="NO-GO", score=20, outcome="killed")

        self.assertEqual(
            set(older),
            {"id", "created", "idea", "verdict", "score", "outcome", "model_version"},
        )
        self.assertEqual(older["idea"], "Older idea")
        self.assertEqual(older["verdict"], "CONDITIONAL")
        self.assertEqual(older["score"], 50)
        self.assertEqual(older["outcome"], "held")
        self.assertEqual(older["model_version"], "9.1")
        self.assertRegex(older["created"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertGreater(newer["id"], older["id"])

        status, _, body = self.request("GET", "/api/journal")
        items = json.loads(body)["items"]
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in items], [newer["id"], older["id"]])
        self.assertEqual([item["idea"] for item in items], ["Newer idea", "Older idea"])

        for index in range(41):
            self.create_journal(f"idea-{index}", verdict="GO", score=index, outcome="")
        status, _, body = self.request("GET", "/api/journal")
        capped = json.loads(body)["items"]
        self.assertEqual(len(capped), 40)
        self.assertEqual(capped[0]["idea"], "idea-40")
        self.assertNotIn("Older idea", [item["idea"] for item in capped])
        self.assertNotIn("idea-0", [item["idea"] for item in capped])

    def test_outcome_update_and_missing_id(self):
        created = self.create_journal("Ship the dashboard", outcome="")
        status, _, body = self.post_json(
            f"/api/journal/{created['id']}/outcome",
            {"outcome": "shipped"},
        )
        self.assertEqual(status, 200, body)
        updated = json.loads(body)
        self.assertEqual(updated["outcome"], "shipped")
        self.assertEqual(updated["id"], created["id"])
        self.assertEqual(updated["idea"], created["idea"])
        self.assertEqual(updated["verdict"], created["verdict"])
        self.assertEqual(updated["score"], created["score"])
        self.assertEqual(updated["created"], created["created"])
        self.assertEqual(updated["model_version"], "9.1")

        status, _, body = self.post_json("/api/journal/99999/outcome", {"outcome": "held"})
        self.assertEqual(status, 404, body)
        self.assertIn("error", json.loads(body))

        status, _, body = self.post_json(
            f"/api/journal/{created['id']}/outcome",
            {"outcome": "later"},
        )
        self.assertEqual(status, 400, body)
        status, _, body = self.request("GET", "/api/journal")
        self.assertEqual(json.loads(body)["items"][0]["outcome"], "shipped")

        status, _, body = self.post_json("/api/journal/nope/outcome", {"outcome": "killed"})
        self.assertEqual(status, 400, body)

    def test_bad_verdict_is_400(self):
        status, headers, body = self.post_json(
            "/api/journal",
            {
                "idea": "Build a dashboard.",
                "verdict": "MAYBE",
                "score": 10,
                "outcome": "",
                "model_version": "9.1",
            },
        )
        self.assertEqual(status, 400, body)
        self.assertIn("verdict", json.loads(body)["error"])
        self.assertEqual(headers["cache-control"], "no-store")

        status, _, body = self.request(
            "POST",
            "/api/journal",
            body=b'{"idea":"Build a dashboard.","verdict":"GO","score":1,"outcome":"","model_version":"9.1"}',
            headers={"content-type": "text/plain"},
        )
        self.assertEqual(status, 415)
        self.assertEqual(json.loads(body)["error"], "Content-Type must be application/json.")

        status, _, body = self.post_json(
            "/api/journal",
            {
                "idea": "Build a dashboard.",
                "verdict": "GO",
                "score": 10.5,
                "outcome": "shipped",
                "model_version": "9.1",
            },
        )
        self.assertEqual(status, 400, body)

        oversized = json.dumps(
            {
                "idea": "x" * 20000,
                "verdict": "GO",
                "score": 1,
                "outcome": "",
                "model_version": "9.1",
            }
        ).encode("utf-8")
        self.assertGreater(len(oversized), 16384)
        status, _, body = self.request("POST", "/api/journal", body=oversized, headers=JSON_HEADERS)
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(body)["error"], "Request body is too large.")

        status, _, body = self.request("GET", "/api/journal")
        self.assertEqual(json.loads(body)["items"], [])

    def test_slate_log_stores_hours_and_items(self):
        items = [{"rank": 1, "label": "do", "hours": 8, "brief": {"idea": "Ship one workflow."}}]
        status, _, body = self.post_json("/api/slate-log", {"hours": 8, "items": items})
        self.assertEqual(status, 200, body)
        payload = json.loads(body)
        self.assertEqual(set(payload), {"id", "created"})
        self.assertRegex(payload["created"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                "SELECT hours, items_json FROM slate WHERE id = ?",
                (payload["id"],),
            ).fetchone()
        finally:
            connection.close()
        self.assertEqual(row[0], 8)
        self.assertEqual(row[1], json.dumps(items))

        status, _, body = self.post_json("/api/slate-log", {"hours": 8, "items": {"rank": 1}})
        self.assertEqual(status, 400, body)

    def test_home_database_stays_untouched(self):
        self.assertFalse((Path(_TEMP.name) / "import-guard.sqlite").exists())
        if _HOME_DB_MTIME is None:
            self.assertFalse(_HOME_DB.exists())
        else:
            self.assertEqual(_HOME_DB.stat().st_mtime_ns, _HOME_DB_MTIME)
        if not _HOME_DIR_EXISTED:
            self.assertFalse(_HOME_DB.parent.exists())


if __name__ == "__main__":
    unittest.main()
