"""Project scoring logic for PulseBoard Studio."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class ProjectInputError(ValueError):
    """Raised when the project brief cannot be scored."""


SIGNAL_WORDS = {
    "api",
    "automate",
    "customer",
    "dashboard",
    "data",
    "deploy",
    "learn",
    "launch",
    "metric",
    "prototype",
    "revenue",
    "ship",
    "user",
    "workflow",
}

SCOPE_FACTORS = {
    "tiny": 1,
    "focused": 2,
    "ambitious": 3,
}

RISK_FACTORS = {
    "low": 1,
    "medium": 2,
    "high": 3,
}


@dataclass(frozen=True)
class ProjectBrief:
    idea: str
    goal: str
    deadline_days: int
    hours_per_week: int
    confidence: int
    scope: str
    risk_appetite: str


def analyse_project(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a deterministic execution plan for a proposed project."""

    brief = _coerce_payload(payload)
    idea_words = _word_count(brief.idea)
    goal_words = _word_count(brief.goal)
    signals = _signal_hits(f"{brief.idea} {brief.goal}")

    clarity = _clamp(28 + idea_words * 4 + goal_words * 5 + len(signals) * 7, 0, 100)
    capacity = _clamp(brief.hours_per_week * 5, 0, 100)
    deadline_fit = _deadline_fit(brief.deadline_days)
    scope_drag = SCOPE_FACTORS[brief.scope] * 15
    appetite_bonus = (RISK_FACTORS[brief.risk_appetite] - 2) * 5

    feasibility = _clamp(
        52
        + brief.confidence * 8
        + capacity * 0.18
        + deadline_fit * 0.22
        - scope_drag
        + appetite_bonus,
        0,
        100,
    )
    momentum = _clamp(
        24
        + brief.confidence * 10
        + min(brief.hours_per_week, 12) * 4
        + len(signals) * 5
        - max(0, SCOPE_FACTORS[brief.scope] - 1) * 8,
        0,
        100,
    )
    risk = _clamp(
        100
        - feasibility
        + SCOPE_FACTORS[brief.scope] * 12
        + max(0, 21 - brief.deadline_days) * 1.5
        - RISK_FACTORS[brief.risk_appetite] * 4,
        0,
        100,
    )
    score = round(clarity * 0.26 + feasibility * 0.34 + momentum * 0.24 + (100 - risk) * 0.16)

    return {
        "score": score,
        "verdict": _verdict(score),
        "summary": _summary(brief, score),
        "signals": sorted(signals),
        "metrics": {
            "clarity": round(clarity),
            "feasibility": round(feasibility),
            "momentum": round(momentum),
            "risk": round(risk),
        },
        "nextSteps": _next_steps(brief, score, signals),
        "risks": _risks(brief, risk),
        "timeline": _timeline(brief),
    }


def _coerce_payload(payload: dict[str, Any]) -> ProjectBrief:
    if not isinstance(payload, dict):
        raise ProjectInputError("Request body must be a JSON object.")

    idea = _clean_text(payload.get("idea"), max_length=320)
    goal = _clean_text(payload.get("goal"), max_length=220)
    if not idea:
        raise ProjectInputError("Add a project idea before scoring.")
    if not goal:
        goal = "Ship a usable first version."

    scope = str(payload.get("scope", "focused")).strip().lower()
    risk_appetite = str(payload.get("riskAppetite", "medium")).strip().lower()
    if scope not in SCOPE_FACTORS:
        scope = "focused"
    if risk_appetite not in RISK_FACTORS:
        risk_appetite = "medium"

    return ProjectBrief(
        idea=idea,
        goal=goal,
        deadline_days=_coerce_int(payload.get("deadlineDays"), default=21, minimum=1, maximum=180),
        hours_per_week=_coerce_int(payload.get("hoursPerWeek"), default=6, minimum=1, maximum=60),
        confidence=_coerce_int(payload.get("confidence"), default=3, minimum=1, maximum=5),
        scope=scope,
        risk_appetite=risk_appetite,
    )


def _clean_text(value: Any, max_length: int) -> str:
    if value is None:
        return ""
    text = " ".join(str(value).replace("\x00", "").split())
    return text[:max_length].strip()


def _coerce_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


def _word_count(text: str) -> int:
    return len([word for word in text.split(" ") if word])


def _signal_hits(text: str) -> set[str]:
    lower = text.lower()
    return {word for word in SIGNAL_WORDS if word in lower}


def _deadline_fit(days: int) -> float:
    if days <= 7:
        return 34
    if days <= 21:
        return 72
    if days <= 60:
        return 88
    return 76


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _verdict(score: int) -> str:
    if score >= 78:
        return "Green light"
    if score >= 58:
        return "Promising, trim scope"
    if score >= 42:
        return "Prototype carefully"
    return "Reshape before building"


def _summary(brief: ProjectBrief, score: int) -> str:
    if score >= 78:
        stance = "This has enough clarity and momentum for a first build."
    elif score >= 58:
        stance = "This can work if the first version stays narrow."
    elif score >= 42:
        stance = "This needs a learning prototype before a full build."
    else:
        stance = "This needs a smaller promise and a sharper outcome."
    return (
        f"{stance} Aim for {brief.goal.lower()} with about "
        f"{brief.hours_per_week} hours per week over {brief.deadline_days} days."
    )


def _next_steps(brief: ProjectBrief, score: int, signals: set[str]) -> list[str]:
    steps = [
        "Write a one-sentence user promise and pin it above the build list.",
        "Choose one workflow that proves the idea without needing every feature.",
        f"Reserve the first {min(brief.hours_per_week, 4)} hours for a clickable happy path.",
    ]
    if score < 58:
        steps.insert(1, "Cut the first version until it can be tested in one focused session.")
    if "data" in signals or "dashboard" in signals:
        steps.append("Define three metrics that would make the dashboard worth opening twice.")
    if "api" in signals or "automate" in signals:
        steps.append("Document the API boundary before wiring background automation.")
    return steps[:5]


def _risks(brief: ProjectBrief, risk: float) -> list[str]:
    risks = []
    if SCOPE_FACTORS[brief.scope] >= 3:
        risks.append("Scope is ambitious; freeze the first release around one user journey.")
    if brief.deadline_days <= 14:
        risks.append("Timeline is tight; defer polish until the core loop works end to end.")
    if brief.confidence <= 2:
        risks.append("Confidence is low; validate with a throwaway prototype before committing.")
    if risk <= 42:
        risks.append("No major risk spikes detected; keep checking assumptions weekly.")
    if not risks:
        risks.append("Main risk is unknown demand; test the promise with one real user or scenario.")
    return risks[:4]


def _timeline(brief: ProjectBrief) -> list[dict[str, str]]:
    return [
        {
            "label": "Day 1",
            "action": "Define the user, success signal, and what the first version will not do.",
        },
        {
            "label": "First build block",
            "action": f"Spend {min(brief.hours_per_week, 6)} hours on the smallest working flow.",
        },
        {
            "label": "Midpoint",
            "action": "Test with real input, remove confusing steps, and update the score.",
        },
        {
            "label": "Ship window",
            "action": "Publish a demo, capture feedback, and choose the next single improvement.",
        },
    ]
