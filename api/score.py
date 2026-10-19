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

from pulseboard import MODEL_VERSION, ProjectInputError, analyse_project, analyse_slate

SCORE_MAX_BODY_BYTES = 16_384
SLATE_MAX_BODY_BYTES = 65_536


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_POST(self) -> None:
        if not self._accepts_json():
            self._send_json({"error": "Content-Type must be application/json."}, status=415)
            return
        try:
            payload, length = self._read_json()
            slate = self._is_slate_request(payload)
            if slate and length > SLATE_MAX_BODY_BYTES:
                raise ValueError("Request body is too large.")
            if not slate and length > SCORE_MAX_BODY_BYTES:
                raise ValueError("Request body is too large.")
            result = analyse_slate(payload) if slate else analyse_project(payload)
        except ProjectInputError as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json({"error": "Request body must be valid JSON."}, status=400)
            return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=413)
            return

        self._send_json(result)

    def do_GET(self) -> None:
        payload = {"name": "PulseBoard Studio API", "status": "ok", "modelVersion": MODEL_VERSION}
        if "slate" in (getattr(self, "path", "") or ""):
            payload["route"] = "slate"
        self._send_json(payload)

    def _is_slate_request(self, payload: Any) -> bool:
        if "slate" in (getattr(self, "path", "") or ""):
            return True
        return (
            isinstance(payload, dict)
            and isinstance(payload.get("briefs"), list)
            and "idea" not in payload
        )

    def _read_json(self) -> tuple[Any, int]:
        try:
            length = int(self.headers.get("content-length", "0") or "0")
        except ValueError as exc:
            raise ProjectInputError("Content-Length must be a valid integer.") from exc
        if length < 0:
            raise ProjectInputError("Content-Length cannot be negative.")
        if length > SLATE_MAX_BODY_BYTES:
            raise ValueError("Request body is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8")), length

    def _accepts_json(self) -> bool:
        content_type = self.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        return content_type == "application/json"

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._cors_headers()
        self.end_headers()

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("cache-control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self) -> None:
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
