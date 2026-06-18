"""Vercel Python serverless function for project scoring."""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pulseboard import ProjectInputError, analyse_project

MAX_BODY_BYTES = 16_384


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            result = analyse_project(payload)
        except ProjectInputError as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except json.JSONDecodeError:
            self._send_json({"error": "Request body must be valid JSON."}, status=400)
            return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=413)
            return

        self._send_json(result)

    def do_GET(self) -> None:
        self._send_json({"name": "PulseBoard Studio API", "status": "ok"})

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0") or "0")
        if length > MAX_BODY_BYTES:
            raise ValueError("Request body is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._cors_headers()
        self.end_headers()

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self) -> None:
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
