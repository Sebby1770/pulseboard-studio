"""Local SQLite journal and slate log.

Connections open on use, never at import. ``PULSEBOARD_DB`` overrides
``~/.pulseboard/studio.sqlite`` and must be an absolute path.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

JOURNAL_READ_LIMIT = 40
VERDICTS = frozenset({"GO", "CONDITIONAL", "NO-GO"})
CREATE_OUTCOMES = frozenset({"shipped", "held", "killed", ""})
MARK_OUTCOMES = frozenset({"shipped", "held", "killed"})

_JOURNAL_COLUMNS = "id, created, idea, verdict, score, outcome, model_version"


class StoreError(Exception):
    """Invalid journal or slate-log input."""


def database_path() -> Path:
    override = os.environ.get("PULSEBOARD_DB", "").strip()
    if override:
        path = Path(override)
        if not path.is_absolute():
            raise StoreError("PULSEBOARD_DB must be an absolute path.")
        return path
    return Path.home() / ".pulseboard" / "studio.sqlite"


def list_journal() -> list[dict[str, Any]]:
    with _session() as connection:
        rows = connection.execute(
            f"""
            SELECT {_JOURNAL_COLUMNS}
            FROM journal
            ORDER BY id DESC
            LIMIT ?
            """,
            (JOURNAL_READ_LIMIT,),
        ).fetchall()
    return [_journal_row(row) for row in rows]


def create_journal(payload: Any) -> dict[str, Any]:
    idea, verdict, score, outcome, model_version = _journal_fields(payload)
    created = _utc_now()
    with _session() as connection:
        cursor = connection.execute(
            """
            INSERT INTO journal (created, idea, verdict, score, outcome, model_version)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (created, idea, verdict, score, outcome, model_version),
        )
        row = connection.execute(
            f"SELECT {_JOURNAL_COLUMNS} FROM journal WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    if row is None:
        raise sqlite3.Error("Journal entry was not stored.")
    return _journal_row(row)


def update_journal_outcome(journal_id: str, payload: Any) -> dict[str, Any] | None:
    row_id = _parse_journal_id(journal_id)
    outcome = _mark_outcome(payload)
    with _session() as connection:
        existing = connection.execute(
            "SELECT id FROM journal WHERE id = ?",
            (row_id,),
        ).fetchone()
        if existing is None:
            return None
        connection.execute(
            "UPDATE journal SET outcome = ? WHERE id = ?",
            (outcome, row_id),
        )
        row = connection.execute(
            f"SELECT {_JOURNAL_COLUMNS} FROM journal WHERE id = ?",
            (row_id,),
        ).fetchone()
    if row is None:
        return None
    return _journal_row(row)


def log_slate(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise StoreError("Slate log body must be an object.")
    hours = payload.get("hours")
    items = payload.get("items")
    if isinstance(hours, bool) or not isinstance(hours, (int, float)):
        raise StoreError("hours must be a number.")
    if isinstance(hours, float) and not math.isfinite(hours):
        raise StoreError("hours must be a number.")
    if not isinstance(items, list):
        raise StoreError("items must be an array.")
    try:
        items_json = json.dumps(items)
    except (TypeError, ValueError) as exc:
        raise StoreError("items must be JSON serializable.") from exc
    created = _utc_now()
    with _session() as connection:
        cursor = connection.execute(
            "INSERT INTO slate (created, hours, items_json) VALUES (?, ?, ?)",
            (created, int(hours), items_json),
        )
        row_id = cursor.lastrowid
    return {"id": row_id, "created": created}


def _journal_fields(payload: Any) -> tuple[str, str, int, str, str]:
    if not isinstance(payload, dict):
        raise StoreError("Journal body must be an object.")
    idea = payload.get("idea")
    verdict = payload.get("verdict")
    score = payload.get("score")
    outcome = payload.get("outcome")
    model_version = payload.get("model_version")
    if not isinstance(idea, str):
        raise StoreError("idea must be a string.")
    if not isinstance(model_version, str):
        raise StoreError("model_version must be a string.")
    if verdict not in VERDICTS:
        raise StoreError("verdict must be GO, CONDITIONAL, or NO-GO.")
    if not isinstance(outcome, str) or outcome not in CREATE_OUTCOMES:
        raise StoreError("outcome must be shipped, held, killed, or empty.")
    if isinstance(score, bool) or not isinstance(score, int):
        raise StoreError("score must be an integer.")
    return idea, verdict, score, outcome, model_version


def _mark_outcome(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise StoreError("Journal body must be an object.")
    outcome = payload.get("outcome")
    if not isinstance(outcome, str) or outcome not in MARK_OUTCOMES:
        raise StoreError("outcome must be shipped, held, or killed.")
    return outcome


def _parse_journal_id(journal_id: str) -> int:
    if not isinstance(journal_id, str) or not journal_id.isdigit():
        raise StoreError("Journal id must be an integer.")
    row_id = int(journal_id)
    if row_id < 1:
        raise StoreError("Journal id must be an integer.")
    return row_id


def _journal_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "created": row["created"],
        "idea": row["idea"],
        "verdict": row["verdict"],
        "score": row["score"],
        "outcome": row["outcome"],
        "model_version": row["model_version"],
    }


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=5)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created TEXT NOT NULL,
                idea TEXT NOT NULL,
                verdict TEXT NOT NULL,
                score INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                model_version TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS slate (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created TEXT NOT NULL,
                hours INTEGER NOT NULL,
                items_json TEXT NOT NULL
            )
            """
        )
    except Exception:
        connection.close()
        raise
    return connection


@contextmanager
def _session() -> Iterator[sqlite3.Connection]:
    connection = _connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
