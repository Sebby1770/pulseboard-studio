"""Local development server for PulseBoard Studio."""

from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from pulseboard import MODEL_VERSION, ProjectInputError, analyse_project

ROOT = Path(__file__).resolve().parent
MAX_BODY_BYTES = 16_384


class PulseBoardHandler(BaseHTTPRequestHandler):
    server_version = "PulseBoardStudio/1.0"

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/score":
            self._send_json(
                {"name": "PulseBoard Studio API", "status": "ok", "modelVersion": MODEL_VERSION}
            )
            return
        self._serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/score":
            self._send_json({"error": "Unknown API route."}, status=404)
            return

        if not self._accepts_json():
            self._send_json({"error": "Content-Type must be application/json."}, status=415)
            return

        try:
            payload = self._read_json()
            result = analyse_project(payload)
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

    def _serve_static(self, request_path: str) -> None:
        rel_path = unquote(request_path.lstrip("/")) or "index.html"
        target = (ROOT / rel_path).resolve()
        if target.is_dir():
            target = (target / "index.html").resolve()
        if not target.is_relative_to(ROOT) or not target.exists():
            self._send_json({"error": "Not found."}, status=404)
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(data)))
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("referrer-policy", "strict-origin-when-cross-origin")
        self.send_header("permissions-policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "content-security-policy",
            "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; "
            "script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        )
        cache_control = "public, max-age=3600" if "/assets/" in request_path else "no-cache"
        self.send_header("cache-control", cache_control)
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("content-length", "0") or "0")
        except ValueError as exc:
            raise ProjectInputError("Content-Length must be a valid integer.") from exc
        if length < 0:
            raise ProjectInputError("Content-Length cannot be negative.")
        if length > MAX_BODY_BYTES:
            raise ValueError("Request body is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

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

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        path = urlparse(self.path).path
        self.log_message('"%s %s %s" %s %s', self.command, path, self.request_version, code, size)


def main() -> None:
    port = 8787
    server = ThreadingHTTPServer(("127.0.0.1", port), PulseBoardHandler)
    print(f"PulseBoard Studio running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
