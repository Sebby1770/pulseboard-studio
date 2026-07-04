"""Project scoring logic for PulseBoard Studio."""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
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

EVIDENCE_SCORES = {
    "idea": 20,
    "signals": 60,
    "users": 90,
}

EVIDENCE_MARGINS = {
    "idea": 12,
    "signals": 7,
    "users": 3,
}

MODEL_VERSION = "7.0"


@dataclass(frozen=True)
class ProjectBrief:
    idea: str
    goal: str
    deadline_days: int
    hours_per_week: int
    confidence: int
    scope: str
    risk_appetite: str
    evidence: str


def analyse_project(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a deterministic execution plan for a proposed project."""

    brief = _coerce_payload(payload)
    score, metrics, signals = _score_brief(brief)

    return {
        "modelVersion": MODEL_VERSION,
        "score": score,
        "scoreRange": _score_range(score, brief.evidence),
        "verdict": _verdict(score),
        "summary": _summary(brief, score),
        "evidenceGrade": _evidence_grade(brief.evidence),
        "signals": sorted(signals),
        "metrics": metrics,
        "recommendedLever": _recommended_lever(brief, metrics),
        "highestImpactMoves": _highest_impact_moves(brief, score),
        "scenarioVariants": _scenario_variants(brief, score),
        "thisWeekPlan": _this_week_plan(brief, metrics, signals),
        "stopConditions": _stop_conditions(brief, metrics),
        "nextSteps": _next_steps(brief, score, signals),
        "risks": _risks(brief, metrics["risk"]),
        "timeline": _timeline(brief),
        "smallestExperiment": _smallest_experiment(brief, signals),
        "questions": _questions(brief, signals),
    }


def _score_brief(brief: ProjectBrief) -> tuple[int, dict[str, int], set[str]]:
    idea_words = _word_count(brief.idea)
    goal_words = _word_count(brief.goal)
    signals = _signal_hits(f"{brief.idea} {brief.goal}")

    evidence = EVIDENCE_SCORES[brief.evidence]
    clarity = _clamp(
        25
        + min(idea_words, 18) * 2.2
        + min(goal_words, 10) * 3.2
        + min(len(signals), 5) * 3,
        0,
        100,
    )
    capacity = _clamp(brief.hours_per_week * 5, 0, 100)
    deadline_fit = _deadline_fit(brief.deadline_days)
    scope_drag = SCOPE_FACTORS[brief.scope] * 15

    feasibility = _clamp(
        48
        + brief.confidence * 7
        + capacity * 0.16
        + deadline_fit * 0.20
        - scope_drag
        + evidence * 0.08,
        0,
        100,
    )
    momentum = _clamp(
        20
        + brief.confidence * 9
        + min(brief.hours_per_week, 12) * 4
        + min(len(signals), 5) * 4
        - max(0, SCOPE_FACTORS[brief.scope] - 1) * 8
        + evidence * 0.12,
        0,
        100,
    )
    risk = _clamp(
        100
        - feasibility
        + SCOPE_FACTORS[brief.scope] * 11
        + max(0, 21 - brief.deadline_days) * 1.5
        + (100 - evidence) * 0.18,
        0,
        100,
    )
    risk_tolerance_adjustment = (RISK_FACTORS[brief.risk_appetite] - 2) * 2
    score = round(
        _clamp(
            clarity * 0.22
            + feasibility * 0.28
            + momentum * 0.20
            + evidence * 0.14
            + (100 - risk) * 0.16
            + risk_tolerance_adjustment,
            0,
            100,
        )
    )

    metrics: dict[str, int] = {
        "clarity": round(clarity),
        "feasibility": round(feasibility),
        "momentum": round(momentum),
        "evidence": evidence,
        "risk": round(risk),
    }

    return score, metrics, signals


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
    evidence = str(payload.get("evidence", "idea")).strip().lower()
    if scope not in SCOPE_FACTORS:
        scope = "focused"
    if risk_appetite not in RISK_FACTORS:
        risk_appetite = "medium"
    if evidence not in EVIDENCE_SCORES:
        evidence = "idea"

    return ProjectBrief(
        idea=idea,
        goal=goal,
        deadline_days=_coerce_int(payload.get("deadlineDays"), default=21, minimum=1, maximum=180),
        hours_per_week=_coerce_int(payload.get("hoursPerWeek"), default=6, minimum=1, maximum=60),
        confidence=_coerce_int(payload.get("confidence"), default=3, minimum=1, maximum=5),
        scope=scope,
        risk_appetite=risk_appetite,
        evidence=evidence,
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
    tokens = set(re.findall(r"[a-z0-9]+", text.lower()))
    return SIGNAL_WORDS.intersection(tokens)


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
    goal = brief.goal.rstrip(".")
    return (
        f'{stance} The first release target is "{goal}". Plan on about '
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
    if brief.evidence == "idea":
        risks.append("Score is assumption-heavy; collect one external signal before expanding the build.")
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


def _smallest_experiment(brief: ProjectBrief, signals: set[str]) -> dict[str, str]:
    if {"dashboard", "data"}.intersection(signals):
        build = "Use one realistic dataset and one decision-focused dashboard view."
        test = "Give it to three target users without explaining the interface."
        success = "At least two users identify the right next action within 60 seconds."
    elif {"api", "automate"}.intersection(signals):
        build = "Automate one narrow input-to-output path with a visible manual fallback."
        test = "Run ten representative cases, including two deliberate failure cases."
        success = "Eight normal cases complete correctly and every failure is recoverable."
    else:
        build = "Create the smallest end-to-end version that delivers the core promise once."
        test = "Put it in front of three people who match the intended user."
        success = "Two people complete the core workflow without step-by-step help."

    if brief.deadline_days <= 7:
        build = f"Time-box one day: {build[0].lower()}{build[1:]}"

    return {"build": build, "test": test, "success": success}


def _questions(brief: ProjectBrief, signals: set[str]) -> list[str]:
    questions = [
        "Who is the first specific user, and what are they doing immediately before this?",
        "What evidence would make you stop, narrow, or change direction?",
    ]
    if {"api", "data", "automate"}.intersection(signals):
        questions.insert(1, "Which data source or integration is most likely to fail first?")
    elif brief.confidence <= 2:
        questions.insert(1, "Which assumption is causing the low confidence, and can it be tested today?")
    else:
        questions.insert(1, "What is the one outcome the first release must improve?")
    if brief.scope == "ambitious":
        questions.append("Which entire feature family can be removed from the first release?")
    if brief.evidence == "idea":
        questions.insert(1, "What is the fastest external signal that would challenge this idea?")
    return questions[:4]


def _highest_impact_moves(brief: ProjectBrief, current_score: int) -> list[dict[str, Any]]:
    candidates: list[tuple[str, str, str, str, str, ProjectBrief]] = []

    if brief.evidence == "idea":
        candidates.append(
            (
                "evidence",
                "Get one external signal",
                "Show the promise to five target users and record which problem they recognize without prompting.",
                "Evidence",
                "1-3 days",
                replace(brief, evidence="signals"),
            )
        )
    elif brief.evidence == "signals":
        candidates.append(
            (
                "evidence",
                "Observe real use",
                "Put one working path in front of three target users and capture what they actually complete.",
                "Evidence",
                "3-5 days",
                replace(brief, evidence="users"),
            )
        )

    if brief.scope != "tiny":
        narrower_scope = "focused" if brief.scope == "ambitious" else "tiny"
        candidates.append(
            (
                "scope",
                "Reduce to one workflow",
                "Remove one complete feature family and keep a single input-to-outcome path for release one.",
                "Feasibility",
                "30 minutes",
                replace(brief, scope=narrower_scope),
            )
        )

    if brief.hours_per_week < 12:
        target_hours = min(12, brief.hours_per_week + 4)
        candidates.append(
            (
                "capacity",
                f"Protect {target_hours} hours a week",
                "Reserve the extra capacity on the calendar before adding another feature or dependency.",
                "Momentum",
                "10 minutes",
                replace(brief, hours_per_week=target_hours),
            )
        )

    if brief.deadline_days <= 21:
        target_days = max(30, brief.deadline_days + 14)
        candidates.append(
            (
                "deadline",
                f"Move the decision window to {target_days} days",
                "Use the additional time for one build-test-revise loop, not for expanding scope.",
                "Risk",
                "5 minutes",
                replace(brief, deadline_days=target_days),
            )
        )

    if brief.confidence < 5:
        candidates.append(
            (
                "confidence",
                "Resolve the biggest unknown",
                "Run one focused test that would move confidence up by a single level before committing the full build.",
                "Momentum",
                "1 day",
                replace(brief, confidence=brief.confidence + 1),
            )
        )

    moves = []
    for move_id, title, action, metric, effort, projected_brief in candidates:
        projected_score, _, _ = _score_brief(projected_brief)
        moves.append(
            {
                "id": move_id,
                "title": title,
                "action": action,
                "metric": metric,
                "effort": effort,
                "projectedScore": projected_score,
                "delta": projected_score - current_score,
            }
        )

    moves.sort(key=lambda move: (-move["delta"], move["id"]))
    return moves[:3]


def _stop_conditions(brief: ProjectBrief, metrics: dict[str, int]) -> list[str]:
    conditions = [
        "Pause if two consecutive tests miss the smallest experiment's success signal.",
        "Reshape the project if the core workflow still needs explanation after three user sessions.",
    ]
    if brief.evidence == "idea":
        conditions.insert(0, "Do not expand scope until at least one target user confirms the problem exists.")
    elif metrics["risk"] >= 60:
        conditions.insert(0, "Stop the build if the highest-risk dependency fails in two representative cases.")
    else:
        conditions.insert(0, "Re-score before adding any feature that does not strengthen the release goal.")
    return conditions[:3]


def _scenario_variants(brief: ProjectBrief, current_score: int) -> list[dict[str, Any]]:
    variants: list[tuple[str, str, str, ProjectBrief, list[str]]] = []

    lean_brief = replace(brief, scope="tiny")
    if brief.deadline_days <= 14:
        lean_brief = replace(lean_brief, deadline_days=21)
    variants.append(
        (
            "lean-launch",
            "Lean launch",
            "Shows the score if release one becomes a single tiny workflow.",
            lean_brief,
            _scenario_changes(brief, lean_brief),
        )
    )

    evidence_step = "signals" if brief.evidence == "idea" else "users"
    proof_brief = replace(
        brief,
        evidence=evidence_step,
        confidence=min(5, brief.confidence + 1),
        hours_per_week=max(brief.hours_per_week, min(12, brief.hours_per_week + 2)),
    )
    variants.append(
        (
            "proof-sprint",
            "Proof sprint",
            "Shows the score if this week is used to earn stronger evidence before expanding.",
            proof_brief,
            _scenario_changes(brief, proof_brief),
        )
    )

    drift_brief = replace(
        brief,
        scope="ambitious",
        deadline_days=min(brief.deadline_days, 14),
        confidence=max(1, brief.confidence - 1),
    )
    variants.append(
        (
            "scope-drift",
            "Scope drift",
            "Shows the penalty if the build grows while the decision window tightens.",
            drift_brief,
            _scenario_changes(brief, drift_brief),
        )
    )

    result = []
    for variant_id, label, rationale, projected_brief, changes in variants:
        projected_score, projected_metrics, _ = _score_brief(projected_brief)
        delta = projected_score - current_score
        result.append(
            {
                "id": variant_id,
                "label": label,
                "score": projected_score,
                "delta": delta,
                "verdict": _verdict(projected_score),
                "rationale": rationale,
                "changes": changes or ["Keep the current controls unchanged."],
                "risk": projected_metrics["risk"],
            }
        )
    return result


def _scenario_changes(current: ProjectBrief, projected: ProjectBrief) -> list[str]:
    changes = []
    if current.scope != projected.scope:
        changes.append(f"Scope: {current.scope} -> {projected.scope}")
    if current.evidence != projected.evidence:
        changes.append(f"Evidence: {current.evidence} -> {projected.evidence}")
    if current.confidence != projected.confidence:
        changes.append(f"Confidence: {current.confidence} -> {projected.confidence}")
    if current.hours_per_week != projected.hours_per_week:
        changes.append(f"Hours/week: {current.hours_per_week} -> {projected.hours_per_week}")
    if current.deadline_days != projected.deadline_days:
        changes.append(f"Deadline: {current.deadline_days} -> {projected.deadline_days} days")
    return changes


def _allocate_week_hours(weekly_hours: int) -> tuple[int, int, int, int]:
    if weekly_hours < 4:
        allocation = [0, 0, 0, 0]
        for index in range(weekly_hours):
            allocation[index] = 1
        return tuple(allocation)

    allocation = [
        min(2, max(1, round(weekly_hours * 0.16))),
        max(1, round(weekly_hours * 0.48)),
        max(1, round(weekly_hours * 0.24)),
        1,
    ]
    priority = [1, 2, 0, 3]
    difference = weekly_hours - sum(allocation)
    while difference > 0:
        for index in priority:
            allocation[index] += 1
            difference -= 1
            if difference == 0:
                break
    while difference < 0:
        for index in priority:
            if allocation[index] > 1:
                allocation[index] -= 1
                difference += 1
            if difference == 0:
                break
    return tuple(allocation)


def _this_week_plan(
    brief: ProjectBrief, metrics: dict[str, int], signals: set[str]
) -> dict[str, Any]:
    weekly_hours = max(1, min(brief.hours_per_week, 18))
    framing_hours, build_hours, test_hours, decide_hours = _allocate_week_hours(weekly_hours)

    if metrics["evidence"] < 60:
        focus = "Find proof before adding surface area"
        checkpoint = "End the week with one external signal that either confirms or weakens the promise."
    elif metrics["risk"] >= 60:
        focus = "Retire the riskiest assumption"
        checkpoint = "End the week knowing whether the fragile dependency works in representative cases."
    elif brief.scope == "ambitious":
        focus = "Compress scope into one path"
        checkpoint = "End the week with one removed feature family and one complete release path."
    else:
        focus = "Ship one visible learning loop"
        checkpoint = "End the week with a tested happy path and one clear next decision."

    build_action = "Build the smallest end-to-end happy path."
    test_action = "Test with three target users or representative scenarios."
    if {"api", "automate"}.intersection(signals):
        build_action = "Wire one input-to-output automation path with a manual fallback."
        test_action = "Run ten cases, including two failures, and record recovery steps."
    elif {"dashboard", "data"}.intersection(signals):
        build_action = "Build one decision-focused dashboard view with realistic data."
        test_action = "Ask three users what next action the dashboard suggests."

    return {
        "focus": focus,
        "availableHours": weekly_hours,
        "checkpoint": checkpoint,
        "blocks": [
            {
                "label": "Frame",
                "hours": framing_hours,
                "action": "Write the user promise, success signal, and non-goals.",
            },
            {"label": "Build", "hours": build_hours, "action": build_action},
            {"label": "Test", "hours": test_hours, "action": test_action},
            {
                "label": "Decide",
                "hours": decide_hours,
                "action": "Re-score, compare against the baseline, and choose one next move.",
            },
        ],
    }


def _recommended_lever(brief: ProjectBrief, metrics: dict[str, int]) -> dict[str, str]:
    comparable = {
        "clarity": metrics["clarity"],
        "feasibility": metrics["feasibility"],
        "momentum": metrics["momentum"],
        "evidence": metrics["evidence"],
        "risk": 100 - metrics["risk"],
    }
    weakest = min(comparable, key=comparable.get)

    if brief.scope == "ambitious" and metrics["feasibility"] < 75:
        weakest = "feasibility"
    elif brief.deadline_days <= 14 and metrics["risk"] >= 45:
        weakest = "risk"

    levers = {
        "clarity": {
            "metric": "Clarity",
            "title": "Make the promise measurable",
            "action": "Rewrite the release goal as one observable user outcome with a number or time limit.",
            "rationale": "A sharper finish line improves prioritization before any code changes.",
        },
        "feasibility": {
            "metric": "Feasibility",
            "title": "Remove one feature family",
            "action": "Move one complete feature group out of the first release and keep one end-to-end workflow.",
            "rationale": "Scope reduction is the fastest way to make the current time and capacity credible.",
        },
        "momentum": {
            "metric": "Momentum",
            "title": "Book the first build block",
            "action": f"Schedule one uninterrupted {min(brief.hours_per_week, 4)}-hour block and finish a visible happy path.",
            "rationale": "A concrete build block converts confidence into evidence and makes the next decision easier.",
        },
        "evidence": {
            "metric": "Evidence",
            "title": "Get one external signal",
            "action": "Show the promise or prototype to one target user and record what they actually try to do.",
            "rationale": "External behavior is more trustworthy than adding detail to the project description.",
        },
        "risk": {
            "metric": "Risk",
            "title": "Test the most fragile assumption",
            "action": "Name the assumption most likely to invalidate the project and test it before expanding scope.",
            "rationale": "Reducing one unknown is more valuable than polishing several known parts.",
        },
    }
    return levers[weakest]


def _evidence_grade(evidence: str) -> dict[str, str]:
    grades = {
        "idea": {
            "label": "Early estimate",
            "detail": "This score is driven mostly by assumptions and planning inputs.",
        },
        "signals": {
            "label": "Directional",
            "detail": "Some external interest exists, but user behavior is not yet proven.",
        },
        "users": {
            "label": "Evidence-backed",
            "detail": "Observed user behavior makes this score more dependable.",
        },
    }
    return grades[evidence]


def _score_range(score: int, evidence: str) -> dict[str, int]:
    margin = EVIDENCE_MARGINS[evidence]
    return {
        "low": max(0, score - margin),
        "high": min(100, score + margin),
        "margin": margin,
    }
