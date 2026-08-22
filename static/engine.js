/** On-device port of pulseboard.engine. Python remains the oracle. */

export const MODEL_VERSION = "9.0";

export class ProjectInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProjectInputError";
  }
}

const SIGNAL_WORDS = new Set([
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
]);

const SCOPE_FACTORS = {
  tiny: 1,
  focused: 2,
  ambitious: 3,
};

const RISK_FACTORS = {
  low: 1,
  medium: 2,
  high: 3,
};

const EVIDENCE_SCORES = {
  idea: 20,
  signals: 60,
  users: 90,
};

const EVIDENCE_MARGINS = {
  idea: 12,
  signals: 7,
  users: 3,
};

const GO_THRESHOLD = 72;
const NO_GO_THRESHOLD = 42;
const SCOPE_ORDER = ["tiny", "focused", "ambitious"];
const EVIDENCE_ORDER = ["idea", "signals", "users"];

export function analyseProject(payload) {
  const brief = coercePayload(payload);
  const [score, metrics, signals] = scoreBrief(brief);

  return {
    modelVersion: MODEL_VERSION,
    score,
    scoreRange: scoreRange(score, brief.evidence),
    verdict: verdictFor(score),
    summary: summaryFor(brief, score),
    evidenceGrade: evidenceGrade(brief.evidence),
    signals: [...signals].sort(),
    metrics,
    recommendedLever: recommendedLever(brief, metrics),
    highestImpactMoves: highestImpactMoves(brief, score),
    scenarioVariants: scenarioVariants(brief, score),
    thisWeekPlan: thisWeekPlan(brief, metrics, signals),
    stopConditions: stopConditions(brief, metrics),
    nextSteps: nextSteps(brief, score, signals),
    risks: risksFor(brief, metrics.risk),
    timeline: timelineFor(brief),
    smallestExperiment: smallestExperiment(brief, signals),
    questions: questionsFor(brief, signals),
    goNoGo: goNoGo(brief, score, metrics),
    killCriteria: killCriteria(brief, metrics),
    sensitivityTable: sensitivityTable(brief, score),
    evidenceLadder: evidenceLadder(brief, score),
    flipPoints: flipPoints(brief, score, metrics),
  };
}

function scoreBrief(brief) {
  const ideaWords = wordCount(brief.idea);
  const goalWords = wordCount(brief.goal);
  const signals = signalHits(`${brief.idea} ${brief.goal}`);

  const evidence = EVIDENCE_SCORES[brief.evidence];
  const clarity = clamp(
    25 +
      Math.min(ideaWords, 18) * 2.2 +
      Math.min(goalWords, 10) * 3.2 +
      Math.min(signals.size, 5) * 3,
    0,
    100,
  );
  const capacity = clamp(brief.hours_per_week * 5, 0, 100);
  const deadlineFitScore = deadlineFit(brief.deadline_days);
  const scopeDrag = SCOPE_FACTORS[brief.scope] * 15;

  const feasibility = clamp(
    48 +
      brief.confidence * 7 +
      capacity * 0.16 +
      deadlineFitScore * 0.2 +
      -scopeDrag +
      evidence * 0.08,
    0,
    100,
  );
  const momentum = clamp(
    20 +
      brief.confidence * 9 +
      Math.min(brief.hours_per_week, 12) * 4 +
      Math.min(signals.size, 5) * 4 +
      -Math.max(0, SCOPE_FACTORS[brief.scope] - 1) * 8 +
      evidence * 0.12,
    0,
    100,
  );
  const risk = clamp(
    100 -
      feasibility +
      SCOPE_FACTORS[brief.scope] * 11 +
      Math.max(0, 21 - brief.deadline_days) * 1.5 +
      (100 - evidence) * 0.18,
    0,
    100,
  );
  const riskToleranceAdjustment = (RISK_FACTORS[brief.risk_appetite] - 2) * 2;
  const score = pyRound(
    clamp(
      clarity * 0.22 +
        feasibility * 0.28 +
        momentum * 0.2 +
        evidence * 0.14 +
        (100 - risk) * 0.16 +
        riskToleranceAdjustment,
      0,
      100,
    ),
  );

  const metrics = {
    clarity: pyRound(clarity),
    feasibility: pyRound(feasibility),
    momentum: pyRound(momentum),
    evidence,
    risk: pyRound(risk),
  };

  return [score, metrics, signals];
}

function coercePayload(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProjectInputError("Request body must be a JSON object.");
  }

  const idea = cleanText(payload.idea, 320);
  let goal = cleanText(payload.goal, 220);
  if (!idea) {
    throw new ProjectInputError("Add a project idea before scoring.");
  }
  if (!goal) {
    goal = "Ship a usable first version.";
  }

  let scope = String(payload.scope ?? "focused")
    .trim()
    .toLowerCase();
  let riskAppetite = String(payload.riskAppetite ?? "medium")
    .trim()
    .toLowerCase();
  let evidence = String(payload.evidence ?? "idea")
    .trim()
    .toLowerCase();
  if (!(scope in SCOPE_FACTORS)) scope = "focused";
  if (!(riskAppetite in RISK_FACTORS)) riskAppetite = "medium";
  if (!(evidence in EVIDENCE_SCORES)) evidence = "idea";

  return {
    idea,
    goal,
    deadline_days: coerceInt(payload.deadlineDays, 21, 1, 180),
    hours_per_week: coerceInt(payload.hoursPerWeek, 8, 1, 60),
    confidence: coerceInt(payload.confidence, 3, 1, 5),
    scope,
    risk_appetite: riskAppetite,
    evidence,
  };
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return "";
  const text = String(value)
    .replace(/\0/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  return text.slice(0, maxLength).trim();
}

function coerceInt(value, fallback, minimum, maximum) {
  let number;
  if (value === null || value === undefined || value === "") {
    number = fallback;
  } else {
    const parsed = Number(value);
    number = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
  return Math.max(minimum, Math.min(maximum, number));
}

function wordCount(text) {
  return text.split(" ").filter(Boolean).length;
}

function signalHits(text) {
  const tokens = new Set(text.toLowerCase().match(/[a-z0-9]+/g) || []);
  const hits = new Set();
  for (const word of SIGNAL_WORDS) {
    if (tokens.has(word)) hits.add(word);
  }
  return hits;
}

function deadlineFit(days) {
  if (days <= 7) return 34;
  if (days <= 21) return 72;
  if (days <= 60) return 88;
  return 76;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Python 3 round() for non-negative numbers: ties round to even. */
function pyRound(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const integer = Math.floor(abs);
  const fraction = abs - integer;
  if (fraction > 0.5) return sign * (integer + 1);
  if (fraction < 0.5) return sign * integer;
  return sign * (integer % 2 === 0 ? integer : integer + 1);
}

function replaceBrief(brief, patch) {
  return { ...brief, ...patch };
}

function hasAny(set, values) {
  for (const value of values) {
    if (set.has(value)) return true;
  }
  return false;
}

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function verdictFor(score) {
  if (score >= 78) return "Green light";
  if (score >= 58) return "Promising, trim scope";
  if (score >= 42) return "Prototype carefully";
  return "Reshape before building";
}

function summaryFor(brief, score) {
  let stance;
  if (score >= 78) stance = "This has enough clarity and momentum for a first build.";
  else if (score >= 58) stance = "This can work if the first version stays narrow.";
  else if (score >= 42) stance = "This needs a learning prototype before a full build.";
  else stance = "This needs a smaller promise and a sharper outcome.";
  const goal = brief.goal.replace(/\.+$/, "");
  return `${stance} The first release target is "${goal}". Plan on about ${brief.hours_per_week} hours per week over ${brief.deadline_days} days.`;
}

function nextSteps(brief, score, signals) {
  const steps = [
    "Write a one-sentence user promise and pin it above the build list.",
    "Choose one workflow that proves the idea without needing every feature.",
    `Reserve the first ${Math.min(brief.hours_per_week, 4)} hours for a clickable happy path.`,
  ];
  if (score < 58) {
    steps.splice(1, 0, "Cut the first version until it can be tested in one focused session.");
  }
  if (signals.has("data") || signals.has("dashboard")) {
    steps.push("Define three metrics that would make the dashboard worth opening twice.");
  }
  if (signals.has("api") || signals.has("automate")) {
    steps.push("Document the API boundary before wiring background automation.");
  }
  return steps.slice(0, 5);
}

function risksFor(brief, risk) {
  const risks = [];
  if (brief.evidence === "idea") {
    risks.push(
      "Score is assumption-heavy; collect one external signal before expanding the build.",
    );
  }
  if (SCOPE_FACTORS[brief.scope] >= 3) {
    risks.push("Scope is ambitious; freeze the first release around one user journey.");
  }
  if (brief.deadline_days <= 14) {
    risks.push("Timeline is tight; defer polish until the core loop works end to end.");
  }
  if (brief.confidence <= 2) {
    risks.push("Confidence is low; validate with a throwaway prototype before committing.");
  }
  if (risk <= 42) {
    risks.push("No major risk spikes detected; keep checking assumptions weekly.");
  }
  if (!risks.length) {
    risks.push("Main risk is unknown demand; test the promise with one real user or scenario.");
  }
  return risks.slice(0, 4);
}

function timelineFor(brief) {
  return [
    {
      label: "Day 1",
      action: "Define the user, success signal, and what the first version will not do.",
    },
    {
      label: "First build block",
      action: `Spend ${Math.min(brief.hours_per_week, 6)} hours on the smallest working flow.`,
    },
    {
      label: "Midpoint",
      action: "Test with real input, remove confusing steps, and update the score.",
    },
    {
      label: "Ship window",
      action: "Publish a demo, capture feedback, and choose the next single improvement.",
    },
  ];
}

function smallestExperiment(brief, signals) {
  let build;
  let test;
  let success;
  if (hasAny(signals, ["dashboard", "data"])) {
    build = "Use one realistic dataset and one decision-focused dashboard view.";
    test = "Give it to three target users without explaining the interface.";
    success = "At least two users identify the right next action within 60 seconds.";
  } else if (hasAny(signals, ["api", "automate"])) {
    build = "Automate one narrow input-to-output path with a visible manual fallback.";
    test = "Run ten representative cases, including two deliberate failure cases.";
    success = "Eight normal cases complete correctly and every failure is recoverable.";
  } else {
    build = "Create the smallest end-to-end version that delivers the core promise once.";
    test = "Put it in front of three people who match the intended user.";
    success = "Two people complete the core workflow without step-by-step help.";
  }

  if (brief.deadline_days <= 7) {
    build = `Time-box one day: ${build[0].toLowerCase()}${build.slice(1)}`;
  }

  return { build, test, success };
}

function questionsFor(brief, signals) {
  const questions = [
    "Who is the first specific user, and what are they doing immediately before this?",
    "What evidence would make you stop, narrow, or change direction?",
  ];
  if (hasAny(signals, ["api", "data", "automate"])) {
    questions.splice(1, 0, "Which data source or integration is most likely to fail first?");
  } else if (brief.confidence <= 2) {
    questions.splice(
      1,
      0,
      "Which assumption is causing the low confidence, and can it be tested today?",
    );
  } else {
    questions.splice(1, 0, "What is the one outcome the first release must improve?");
  }
  if (brief.scope === "ambitious") {
    questions.push("Which entire feature family can be removed from the first release?");
  }
  if (brief.evidence === "idea") {
    questions.splice(1, 0, "What is the fastest external signal that would challenge this idea?");
  }
  return questions.slice(0, 4);
}

function highestImpactMoves(brief, currentScore) {
  const candidates = [];

  if (brief.evidence === "idea") {
    candidates.push([
      "evidence",
      "Get one external signal",
      "Show the promise to five target users and record which problem they recognize without prompting.",
      "Evidence",
      "1-3 days",
      replaceBrief(brief, { evidence: "signals" }),
    ]);
  } else if (brief.evidence === "signals") {
    candidates.push([
      "evidence",
      "Observe real use",
      "Put one working path in front of three target users and capture what they actually complete.",
      "Evidence",
      "3-5 days",
      replaceBrief(brief, { evidence: "users" }),
    ]);
  }

  if (brief.scope !== "tiny") {
    const narrowerScope = brief.scope === "ambitious" ? "focused" : "tiny";
    candidates.push([
      "scope",
      "Reduce to one workflow",
      "Remove one complete feature family and keep a single input-to-outcome path for release one.",
      "Feasibility",
      "30 minutes",
      replaceBrief(brief, { scope: narrowerScope }),
    ]);
  }

  if (brief.hours_per_week < 12) {
    const targetHours = Math.min(12, brief.hours_per_week + 4);
    candidates.push([
      "capacity",
      `Protect ${targetHours} hours a week`,
      "Reserve the extra capacity on the calendar before adding another feature or dependency.",
      "Momentum",
      "10 minutes",
      replaceBrief(brief, { hours_per_week: targetHours }),
    ]);
  }

  if (brief.deadline_days <= 21) {
    const targetDays = Math.max(30, brief.deadline_days + 14);
    candidates.push([
      "deadline",
      `Move the decision window to ${targetDays} days`,
      "Use the additional time for one build-test-revise loop, not for expanding scope.",
      "Risk",
      "5 minutes",
      replaceBrief(brief, { deadline_days: targetDays }),
    ]);
  }

  if (brief.confidence < 5) {
    candidates.push([
      "confidence",
      "Resolve the biggest unknown",
      "Run one focused test that would move confidence up by a single level before committing the full build.",
      "Momentum",
      "1 day",
      replaceBrief(brief, { confidence: brief.confidence + 1 }),
    ]);
  }

  const moves = candidates.map(([id, title, action, metric, effort, projectedBrief]) => {
    const [projectedScore] = scoreBrief(projectedBrief);
    return {
      id,
      title,
      action,
      metric,
      effort,
      projectedScore,
      delta: projectedScore - currentScore,
    };
  });

  moves.sort((a, b) => b.delta - a.delta || cmpStr(a.id, b.id));
  return moves.slice(0, 3);
}

function stopConditions(brief, metrics) {
  const conditions = [
    "Pause if two consecutive tests miss the smallest experiment's success signal.",
    "Reshape the project if the core workflow still needs explanation after three user sessions.",
  ];
  if (brief.evidence === "idea") {
    conditions.unshift(
      "Do not expand scope until at least one target user confirms the problem exists.",
    );
  } else if (metrics.risk >= 60) {
    conditions.unshift(
      "Stop the build if the highest-risk dependency fails in two representative cases.",
    );
  } else {
    conditions.unshift(
      "Re-score before adding any feature that does not strengthen the release goal.",
    );
  }
  return conditions.slice(0, 3);
}

function scenarioVariants(brief, currentScore) {
  const variants = [];

  let leanBrief = replaceBrief(brief, { scope: "tiny" });
  if (brief.deadline_days <= 14) {
    leanBrief = replaceBrief(leanBrief, { deadline_days: 21 });
  }
  variants.push([
    "lean-launch",
    "Lean launch",
    "Shows the score if release one becomes a single tiny workflow.",
    leanBrief,
    scenarioChanges(brief, leanBrief),
  ]);

  const evidenceStep = brief.evidence === "idea" ? "signals" : "users";
  const proofBrief = replaceBrief(brief, {
    evidence: evidenceStep,
    confidence: Math.min(5, brief.confidence + 1),
    hours_per_week: Math.max(brief.hours_per_week, Math.min(12, brief.hours_per_week + 2)),
  });
  variants.push([
    "proof-sprint",
    "Proof sprint",
    "Shows the score if this week is used to earn stronger evidence before expanding.",
    proofBrief,
    scenarioChanges(brief, proofBrief),
  ]);

  const driftBrief = replaceBrief(brief, {
    scope: "ambitious",
    deadline_days: Math.min(brief.deadline_days, 14),
    confidence: Math.max(1, brief.confidence - 1),
  });
  variants.push([
    "scope-drift",
    "Scope drift",
    "Shows the penalty if the build grows while the decision window tightens.",
    driftBrief,
    scenarioChanges(brief, driftBrief),
  ]);

  return variants.map(([id, label, rationale, projectedBrief, changes]) => {
    const [projectedScore, projectedMetrics] = scoreBrief(projectedBrief);
    const delta = projectedScore - currentScore;
    return {
      id,
      label,
      score: projectedScore,
      delta,
      verdict: verdictFor(projectedScore),
      rationale,
      changes: changes.length ? changes : ["Keep the current controls unchanged."],
      risk: projectedMetrics.risk,
    };
  });
}

function scenarioChanges(current, projected) {
  const changes = [];
  if (current.scope !== projected.scope) {
    changes.push(`Scope: ${current.scope} -> ${projected.scope}`);
  }
  if (current.evidence !== projected.evidence) {
    changes.push(`Evidence: ${current.evidence} -> ${projected.evidence}`);
  }
  if (current.confidence !== projected.confidence) {
    changes.push(`Confidence: ${current.confidence} -> ${projected.confidence}`);
  }
  if (current.hours_per_week !== projected.hours_per_week) {
    changes.push(`Hours/week: ${current.hours_per_week} -> ${projected.hours_per_week}`);
  }
  if (current.deadline_days !== projected.deadline_days) {
    changes.push(`Deadline: ${current.deadline_days} -> ${projected.deadline_days} days`);
  }
  return changes;
}

function allocateWeekHours(weeklyHours) {
  if (weeklyHours < 4) {
    const allocation = [0, 0, 0, 0];
    for (let index = 0; index < weeklyHours; index += 1) {
      allocation[index] = 1;
    }
    return allocation;
  }

  const allocation = [
    Math.min(2, Math.max(1, pyRound(weeklyHours * 0.16))),
    Math.max(1, pyRound(weeklyHours * 0.48)),
    Math.max(1, pyRound(weeklyHours * 0.24)),
    1,
  ];
  const priority = [1, 2, 0, 3];
  let difference = weeklyHours - allocation.reduce((sum, hours) => sum + hours, 0);
  while (difference > 0) {
    for (const index of priority) {
      allocation[index] += 1;
      difference -= 1;
      if (difference === 0) break;
    }
  }
  while (difference < 0) {
    for (const index of priority) {
      if (allocation[index] > 1) {
        allocation[index] -= 1;
        difference += 1;
      }
      if (difference === 0) break;
    }
  }
  return allocation;
}

function thisWeekPlan(brief, metrics, signals) {
  const weeklyHours = Math.max(1, Math.min(brief.hours_per_week, 18));
  const [framingHours, buildHours, testHours, decideHours] = allocateWeekHours(weeklyHours);

  let focus;
  let checkpoint;
  if (metrics.evidence < 60) {
    focus = "Find proof before adding surface area";
    checkpoint =
      "End the week with one external signal that either confirms or weakens the promise.";
  } else if (metrics.risk >= 60) {
    focus = "Retire the riskiest assumption";
    checkpoint =
      "End the week knowing whether the fragile dependency works in representative cases.";
  } else if (brief.scope === "ambitious") {
    focus = "Compress scope into one path";
    checkpoint = "End the week with one removed feature family and one complete release path.";
  } else {
    focus = "Ship one visible learning loop";
    checkpoint = "End the week with a tested happy path and one clear next decision.";
  }

  let buildAction = "Build the smallest end-to-end happy path.";
  let testAction = "Test with three target users or representative scenarios.";
  if (hasAny(signals, ["api", "automate"])) {
    buildAction = "Wire one input-to-output automation path with a manual fallback.";
    testAction = "Run ten cases, including two failures, and record recovery steps.";
  } else if (hasAny(signals, ["dashboard", "data"])) {
    buildAction = "Build one decision-focused dashboard view with realistic data.";
    testAction = "Ask three users what next action the dashboard suggests.";
  }

  return {
    focus,
    availableHours: weeklyHours,
    checkpoint,
    blocks: [
      {
        label: "Frame",
        hours: framingHours,
        action: "Write the user promise, success signal, and non-goals.",
      },
      { label: "Build", hours: buildHours, action: buildAction },
      { label: "Test", hours: testHours, action: testAction },
      {
        label: "Decide",
        hours: decideHours,
        action: "Re-score, compare against the baseline, and choose one next move.",
      },
    ],
  };
}

function recommendedLever(brief, metrics) {
  const comparable = {
    clarity: metrics.clarity,
    feasibility: metrics.feasibility,
    momentum: metrics.momentum,
    evidence: metrics.evidence,
    risk: 100 - metrics.risk,
  };
  let weakest = null;
  let weakestValue = Infinity;
  for (const [name, value] of Object.entries(comparable)) {
    if (value < weakestValue) {
      weakest = name;
      weakestValue = value;
    }
  }

  if (brief.scope === "ambitious" && metrics.feasibility < 75) {
    weakest = "feasibility";
  } else if (brief.deadline_days <= 14 && metrics.risk >= 45) {
    weakest = "risk";
  }

  const levers = {
    clarity: {
      metric: "Clarity",
      title: "Make the promise measurable",
      action: "Rewrite the release goal as one observable user outcome with a number or time limit.",
      rationale: "A sharper finish line improves prioritization before any code changes.",
    },
    feasibility: {
      metric: "Feasibility",
      title: "Remove one feature family",
      action:
        "Move one complete feature group out of the first release and keep one end-to-end workflow.",
      rationale: "Scope reduction is the fastest way to make the current time and capacity credible.",
    },
    momentum: {
      metric: "Momentum",
      title: "Book the first build block",
      action: `Schedule one uninterrupted ${Math.min(brief.hours_per_week, 4)}-hour block and finish a visible happy path.`,
      rationale:
        "A concrete build block converts confidence into evidence and makes the next decision easier.",
    },
    evidence: {
      metric: "Evidence",
      title: "Get one external signal",
      action: "Show the promise or prototype to one target user and record what they actually try to do.",
      rationale: "External behavior is more trustworthy than adding detail to the project description.",
    },
    risk: {
      metric: "Risk",
      title: "Test the most fragile assumption",
      action:
        "Name the assumption most likely to invalidate the project and test it before expanding scope.",
      rationale: "Reducing one unknown is more valuable than polishing several known parts.",
    },
  };
  return levers[weakest];
}

function evidenceGrade(evidence) {
  const grades = {
    idea: {
      label: "Early estimate",
      detail: "This score is driven mostly by assumptions and planning inputs.",
    },
    signals: {
      label: "Directional",
      detail: "Some external interest exists, but user behavior is not yet proven.",
    },
    users: {
      label: "Evidence-backed",
      detail: "Observed user behavior makes this score more dependable.",
    },
  };
  return grades[evidence];
}

function scoreRange(score, evidence) {
  const margin = EVIDENCE_MARGINS[evidence];
  return {
    low: Math.max(0, score - margin),
    high: Math.min(100, score + margin),
    margin,
  };
}

function goNoGo(brief, score, metrics) {
  let decision;
  let reason;
  if (score < NO_GO_THRESHOLD) {
    decision = "NO-GO";
    reason =
      "The score is below the reshape line. Narrow the promise and re-score before spending another build week.";
  } else if (brief.evidence === "idea" || score < GO_THRESHOLD) {
    decision = "CONDITIONAL";
    if (brief.evidence === "idea") {
      reason =
        "Do not commit a full build yet. Collect one external signal and re-score before expanding scope.";
    } else {
      reason =
        "The brief can proceed as a time-boxed prototype, but only if the first week stays on one workflow.";
    }
  } else {
    decision = "GO";
    reason = "Clarity, capacity, and evidence are strong enough to ship a narrow first version this cycle.";
  }

  if (decision !== "NO-GO" && metrics.risk >= 70 && brief.deadline_days <= 14) {
    decision = "CONDITIONAL";
    reason =
      "Risk is high and the deadline is tight. Prove the fragile assumption before treating this as a go.";
  }

  return {
    decision,
    reason,
    thresholds: { go: GO_THRESHOLD, noGo: NO_GO_THRESHOLD },
  };
}

function killCriteria(brief, metrics) {
  const criteria = [
    "Kill this shape if the smallest experiment fails twice with the same user type.",
    "Kill this shape if no target user will spend 15 minutes on a prototype in the next two weeks.",
  ];
  if (brief.evidence === "idea") {
    criteria.unshift(
      "Kill this idea if five target conversations produce zero unprompted problem recognition.",
    );
  }
  if (brief.scope === "ambitious") {
    criteria.push("Kill the current shape if a one-workflow slice cannot be described in one sentence.");
  }
  if (brief.deadline_days <= 14) {
    criteria.push("Kill the current deadline if the happy path is not testable within seven days.");
  }
  if (metrics.risk >= 60) {
    criteria.push(
      "Kill the build if the highest-risk dependency cannot be demonstrated once this week.",
    );
  }
  const unique = [];
  const seen = new Set();
  for (const item of criteria) {
    if (seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
  }
  return unique.slice(0, 4);
}

function sensitivityTable(brief, currentScore) {
  const candidates = [];

  const scopeIndex = SCOPE_ORDER.indexOf(brief.scope);
  if (scopeIndex > 0) {
    const narrower = SCOPE_ORDER[scopeIndex - 1];
    candidates.push(["scope", "narrower", brief.scope, narrower, replaceBrief(brief, { scope: narrower })]);
  }
  if (scopeIndex < SCOPE_ORDER.length - 1) {
    const wider = SCOPE_ORDER[scopeIndex + 1];
    candidates.push(["scope", "wider", brief.scope, wider, replaceBrief(brief, { scope: wider })]);
  }

  const moreHours = Math.min(60, brief.hours_per_week + 4);
  const fewerHours = Math.max(1, brief.hours_per_week - 4);
  if (moreHours !== brief.hours_per_week) {
    candidates.push([
      "hoursPerWeek",
      "more-capacity",
      String(brief.hours_per_week),
      String(moreHours),
      replaceBrief(brief, { hours_per_week: moreHours }),
    ]);
  }
  if (fewerHours !== brief.hours_per_week) {
    candidates.push([
      "hoursPerWeek",
      "less-capacity",
      String(brief.hours_per_week),
      String(fewerHours),
      replaceBrief(brief, { hours_per_week: fewerHours }),
    ]);
  }

  const longer = Math.min(180, brief.deadline_days + 14);
  const shorter = Math.max(1, brief.deadline_days - 14);
  if (longer !== brief.deadline_days) {
    candidates.push([
      "deadlineDays",
      "more-time",
      String(brief.deadline_days),
      String(longer),
      replaceBrief(brief, { deadline_days: longer }),
    ]);
  }
  if (shorter !== brief.deadline_days) {
    candidates.push([
      "deadlineDays",
      "less-time",
      String(brief.deadline_days),
      String(shorter),
      replaceBrief(brief, { deadline_days: shorter }),
    ]);
  }

  const evidenceIndex = EVIDENCE_ORDER.indexOf(brief.evidence);
  if (evidenceIndex < EVIDENCE_ORDER.length - 1) {
    const stronger = EVIDENCE_ORDER[evidenceIndex + 1];
    candidates.push([
      "evidence",
      "stronger",
      brief.evidence,
      stronger,
      replaceBrief(brief, { evidence: stronger }),
    ]);
  }
  if (evidenceIndex > 0) {
    const weaker = EVIDENCE_ORDER[evidenceIndex - 1];
    candidates.push([
      "evidence",
      "weaker",
      brief.evidence,
      weaker,
      replaceBrief(brief, { evidence: weaker }),
    ]);
  }

  if (brief.confidence < 5) {
    candidates.push([
      "confidence",
      "higher",
      String(brief.confidence),
      String(brief.confidence + 1),
      replaceBrief(brief, { confidence: brief.confidence + 1 }),
    ]);
  }
  if (brief.confidence > 1) {
    candidates.push([
      "confidence",
      "lower",
      String(brief.confidence),
      String(brief.confidence - 1),
      replaceBrief(brief, { confidence: brief.confidence - 1 }),
    ]);
  }

  const rows = candidates.map(([input, direction, from, to, projectedBrief]) => {
    const [projectedScore] = scoreBrief(projectedBrief);
    return {
      input,
      direction,
      from,
      to,
      score: projectedScore,
      delta: projectedScore - currentScore,
    };
  });
  rows.sort(
    (a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) || cmpStr(a.input, b.input) || cmpStr(a.direction, b.direction),
  );
  return rows;
}

function decisionSnapshot(brief) {
  const [score, metrics] = scoreBrief(brief);
  return [score, goNoGo(brief, score, metrics).decision];
}

function evidenceLadder(brief, currentScore) {
  return EVIDENCE_ORDER.map((evidence) => {
    const projected = replaceBrief(brief, { evidence });
    const [score, decision] = decisionSnapshot(projected);
    return {
      evidence,
      label: evidenceGrade(evidence).label,
      score,
      delta: score - currentScore,
      decision,
      verdict: verdictFor(score),
      current: evidence === brief.evidence,
    };
  });
}

function flipPoints(brief, currentScore, metrics) {
  const currentDecision = goNoGo(brief, currentScore, metrics).decision;
  const points = [];

  const hoursFlip = nearestNumericFlip(brief, currentDecision, {
    field: "hours_per_week",
    inputName: "hoursPerWeek",
    values: range(1, 61),
    currentValue: brief.hours_per_week,
  });
  if (hoursFlip) points.push(hoursFlip);

  const deadlineFlip = nearestNumericFlip(brief, currentDecision, {
    field: "deadline_days",
    inputName: "deadlineDays",
    values: range(1, 181),
    currentValue: brief.deadline_days,
  });
  if (deadlineFlip) points.push(deadlineFlip);

  for (const [field, inputName, options, currentValue] of [
    ["scope", "scope", SCOPE_ORDER, brief.scope],
    ["evidence", "evidence", EVIDENCE_ORDER, brief.evidence],
    ["confidence", "confidence", [1, 2, 3, 4, 5], brief.confidence],
  ]) {
    const flip = nearestOptionFlip(brief, currentDecision, {
      field,
      inputName,
      options,
      currentValue,
    });
    if (flip) points.push(flip);
  }

  points.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || cmpStr(a.input, b.input));
  return points;
}

function nearestNumericFlip(brief, currentDecision, { field, inputName, values, currentValue }) {
  let best = null;
  let bestDistance = null;
  for (const value of values) {
    if (value === currentValue) continue;
    const [score, decision] = decisionSnapshot(replaceBrief(brief, { [field]: value }));
    if (decision === currentDecision) continue;
    const distance = Math.abs(value - currentValue);
    if (bestDistance === null || distance < bestDistance) {
      bestDistance = distance;
      best = {
        input: inputName,
        from: String(currentValue),
        to: String(value),
        score,
        delta: score - scoreBrief(brief)[0],
        decision,
        currentDecision,
      };
    }
  }
  return best;
}

function nearestOptionFlip(brief, currentDecision, { field, inputName, options, currentValue }) {
  const currentScore = scoreBrief(brief)[0];
  let best = null;
  for (const option of options) {
    if (option === currentValue) continue;
    const [score, decision] = decisionSnapshot(replaceBrief(brief, { [field]: option }));
    if (decision === currentDecision) continue;
    const candidate = {
      input: inputName,
      from: String(currentValue),
      to: String(option),
      score,
      delta: score - currentScore,
      decision,
      currentDecision,
    };
    if (best === null || Math.abs(candidate.delta) < Math.abs(best.delta)) {
      best = candidate;
    }
  }
  return best;
}

function range(start, end) {
  const values = [];
  for (let value = start; value < end; value += 1) values.push(value);
  return values;
}
