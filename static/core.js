export const DEFAULT_GOAL = "Ship a usable first version.";
export const HISTORY_LIMIT = 6;

const EVIDENCE_LABELS = {
  idea: "Idea only",
  signals: "External signals",
  users: "Observed users",
};

const COMPARISON_METRICS = ["clarity", "feasibility", "momentum", "evidence", "risk"];

const DEFAULT_LEVER = {
  metric: "Feasibility",
  title: "Keep one end-to-end workflow",
  action: "Remove one feature group from the first release and protect the core user journey.",
  rationale: "A smaller complete workflow produces better evidence than several partial features.",
};

export function titleCase(value) {
  return String(value).replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export function parseHistory(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
  } catch {
    return [];
  }
}

export function migrateHistory(currentRaw, legacyRaw) {
  const current = parseHistory(currentRaw);
  const source = current.length ? current : parseHistory(legacyRaw);
  return source.map((entry) => ({
    ...entry,
    migrated: !current.length || entry.migrated,
    payload: entry.payload ? normalizePayload(entry.payload) : entry.payload,
    result: entry.result ? withResultDefaults(entry.result) : entry.result,
  }));
}

export function createHistoryEntry(payload, result, history, options = {}) {
  const normalizedPayload = normalizePayload(payload);
  const previousScore = history[0]?.score;
  return {
    id: options.id || globalThis.crypto?.randomUUID?.() || `history-${Date.now()}`,
    idea: normalizedPayload.idea,
    score: result.score,
    verdict: result.verdict,
    delta: Number.isFinite(previousScore) ? result.score - previousScore : null,
    payload: normalizedPayload,
    result,
    createdAt: options.createdAt || new Date().toISOString(),
  };
}

export function compareResults(previous, current) {
  if (!previous?.metrics || !current?.metrics) return null;
  const metrics = Object.entries(current.metrics)
    .filter(([name, value]) => Number.isFinite(value) && Number.isFinite(previous.metrics[name]))
    .map(([name, value]) => {
      const delta = value - previous.metrics[name];
      const impact = name === "risk" ? -delta : delta;
      return {
        name,
        delta,
        status: impact > 0 ? "improved" : impact < 0 ? "worsened" : "stable",
      };
    });

  const scoreDelta = current.score - previous.score;
  return {
    scoreDelta,
    status: scoreDelta > 0 ? "improved" : scoreDelta < 0 ? "worsened" : "stable",
    metrics,
  };
}

export function baselineControlState(baseline, current) {
  const comparison = compareResults(baseline?.result, current);
  const isCurrent = Boolean(
    comparison &&
      comparison.scoreDelta === 0 &&
      comparison.metrics.every((metric) => metric.delta === 0),
  );
  return {
    label: isCurrent ? "Baseline set" : baseline ? "Update baseline" : "Set baseline",
    disabled: !current || isCurrent,
    isCurrent,
  };
}

export function serializeDraft(payload) {
  return JSON.stringify({ version: 2, payload: normalizePayload(payload) });
}

export function parseDraft(raw) {
  try {
    const parsed = JSON.parse(raw || "null");
    if (![1, 2].includes(parsed?.version) || !isDraftPayload(parsed.payload)) return null;
    return normalizePayload(parsed.payload);
  } catch {
    return null;
  }
}

export function serializeBaseline(payload, result) {
  const comparableResult = normalizeComparableResult(result);
  if (!comparableResult) throw new TypeError("Baseline results must contain valid score metrics.");
  return JSON.stringify({
    version: 1,
    payload: normalizePayload(payload),
    result: comparableResult,
  });
}

export function parseBaseline(raw) {
  try {
    const parsed = JSON.parse(raw || "null");
    const result = normalizeComparableResult(parsed?.result);
    if (parsed?.version !== 1 || !isDraftPayload(parsed.payload) || !result) return null;
    return { payload: normalizePayload(parsed.payload), result };
  } catch {
    return null;
  }
}

export function normalizePayload(payload = {}) {
  return {
    idea: cleanText(payload.idea, 320),
    goal: cleanText(payload.goal, 220),
    deadlineDays: clampInteger(payload.deadlineDays, 21, 1, 180),
    hoursPerWeek: clampInteger(payload.hoursPerWeek, 8, 1, 60),
    confidence: clampInteger(payload.confidence, 3, 1, 5),
    scope: ["tiny", "focused", "ambitious"].includes(payload.scope) ? payload.scope : "focused",
    riskAppetite: ["low", "medium", "high"].includes(payload.riskAppetite)
      ? payload.riskAppetite
      : "medium",
    evidence: ["idea", "signals", "users"].includes(payload.evidence) ? payload.evidence : "idea",
  };
}

export function buildShareUrl(payload, baseUrl) {
  const normalized = normalizePayload(payload);
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("Share links require an HTTP URL.");
  }

  url.search = "";
  const params = new URLSearchParams();
  params.set("v", "2");
  params.set("idea", normalized.idea);
  params.set("goal", normalized.goal);
  params.set("deadline", String(normalized.deadlineDays));
  params.set("hours", String(normalized.hoursPerWeek));
  params.set("confidence", String(normalized.confidence));
  params.set("scope", normalized.scope);
  params.set("risk", normalized.riskAppetite);
  params.set("evidence", normalized.evidence);
  url.hash = params.toString();
  return url.toString();
}

export function parseShareUrl(value) {
  try {
    const url = new URL(value);
    const fragmentParams = new URLSearchParams(url.hash.slice(1));
    const params = fragmentParams.has("idea") ? fragmentParams : url.searchParams;
    if (!["http:", "https:"].includes(url.protocol) || !params.has("idea")) return null;
    const payload = normalizePayload({
      idea: params.get("idea"),
      goal: params.get("goal"),
      deadlineDays: numberParam(params, "deadline"),
      hoursPerWeek: numberParam(params, "hours"),
      confidence: numberParam(params, "confidence"),
      scope: params.get("scope"),
      riskAppetite: params.get("risk"),
      evidence: params.get("evidence"),
    });
    return payload.idea ? payload : null;
  } catch {
    return null;
  }
}

export function buildMemo(payload, result, comparison = null) {
  const normalizedPayload = normalizePayload(payload);
  const lever = result.recommendedLever || DEFAULT_LEVER;
  const evidenceGrade = result.evidenceGrade || defaultEvidenceGrade();
  const scoreRange = result.scoreRange || defaultScoreRange(result);
  const metricRows = Object.entries(result.metrics)
    .map(([name, value]) => `- ${titleCase(name)}: ${value}`)
    .join("\n");
  const steps = result.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const riskRows = result.risks.map((risk) => `- ${risk}`).join("\n");
  const timelineRows = result.timeline
    .map((item) => `- **${item.label}:** ${item.action}`)
    .join("\n");
  const questionRows = result.questions.map((question) => `- ${question}`).join("\n");
  const impactBlock = buildImpactBlock(result.highestImpactMoves);
  const stopConditionsBlock = buildStopConditionsBlock(result.stopConditions);
  const comparisonBlock = buildComparisonBlock(comparison);
  return `# PulseBoard Decision Memo

## ${result.verdict} - ${result.score}/100

**Idea:** ${normalizedPayload.idea}

**First release goal:** ${normalizedPayload.goal || DEFAULT_GOAL}

**Validation evidence:** ${EVIDENCE_LABELS[normalizedPayload.evidence]}

**Score confidence:** ${evidenceGrade.label} - ${evidenceGrade.detail}

**Likely score range:** ${scoreRange.low}-${scoreRange.high}

${result.summary}

${comparisonBlock}
## Best Lever

**${lever.title}** (${lever.metric})

${lever.action}

${lever.rationale}

${impactBlock}
## Scorecard

${metricRows}

## Smallest Useful Experiment

- Build: ${result.smallestExperiment.build}
- Test: ${result.smallestExperiment.test}
- Success signal: ${result.smallestExperiment.success}

## Timeline

${timelineRows}

## Next Steps

${steps}

## Risks

${riskRows}

${stopConditionsBlock}
## Questions To Answer

${questionRows}
`;
}

function buildImpactBlock(moves = []) {
  if (!Array.isArray(moves) || !moves.length) return "";
  const rows = moves
    .map((move, index) => {
      const delta = formatDelta(move.delta);
      return `${index + 1}. **${move.title}** (${delta} to ${move.projectedScore}) - ${move.action}`;
    })
    .join("\n");
  return `## Highest-Impact Moves

${rows}

`;
}

function buildStopConditionsBlock(conditions = []) {
  if (!Array.isArray(conditions) || !conditions.length) return "";
  const rows = conditions.map((condition) => `- ${condition}`).join("\n");
  return `## Stop Conditions

${rows}

`;
}

function buildComparisonBlock(comparison) {
  if (!comparison || !Number.isFinite(comparison.scoreDelta) || !Array.isArray(comparison.metrics)) {
    return "";
  }
  const scoreDelta = formatDelta(comparison.scoreDelta);
  const context = comparison.context ? `**Compared with:** ${comparison.context}\n\n` : "";
  const rows = comparison.metrics
    .filter((metric) => Number.isFinite(metric.delta))
    .map((metric) => {
      const note = metric.name === "risk" ? "; lower is better" : "";
      return `- ${titleCase(metric.name)}: ${formatDelta(metric.delta)} (${titleCase(metric.status)}${note})`;
    })
    .join("\n");
  return `## Scenario Comparison

${context}
- Overall score: ${scoreDelta} (${titleCase(comparison.status)})
${rows}

`;
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, maxLength) : "";
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function numberParam(params, name) {
  const value = params.get(name);
  return value === null || value === "" ? undefined : Number(value);
}

function formatDelta(value) {
  return value > 0 ? `+${value}` : String(value);
}

function normalizeComparableResult(result) {
  if (!Number.isFinite(result?.score) || result.score < 0 || result.score > 100) return null;
  const metrics = {};
  for (const name of COMPARISON_METRICS) {
    const value = result.metrics?.[name];
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    metrics[name] = Math.round(value);
  }
  return { score: Math.round(result.score), metrics };
}

function isHistoryEntry(entry) {
  return Boolean(
    entry &&
      typeof entry === "object" &&
      typeof entry.idea === "string" &&
      Number.isFinite(entry.score) &&
      typeof entry.verdict === "string",
  );
}

function withResultDefaults(result) {
  return {
    ...result,
    modelVersion: result.modelVersion || "2.0",
    metrics: { ...result.metrics, evidence: result.metrics?.evidence ?? 20 },
    evidenceGrade: result.evidenceGrade || defaultEvidenceGrade(),
    scoreRange: result.scoreRange || defaultScoreRange(result),
    recommendedLever: result.recommendedLever || DEFAULT_LEVER,
    highestImpactMoves: Array.isArray(result.highestImpactMoves) ? result.highestImpactMoves : [],
    stopConditions: Array.isArray(result.stopConditions) ? result.stopConditions : [],
  };
}

function defaultScoreRange(result) {
  const evidence = result.metrics?.evidence ?? 20;
  const margin = evidence >= 80 ? 3 : evidence >= 50 ? 7 : 12;
  const score = Number.isFinite(result.score) ? result.score : 0;
  return {
    low: Math.max(0, score - margin),
    high: Math.min(100, score + margin),
    margin,
  };
}

function defaultEvidenceGrade() {
  return {
    label: "Early estimate",
    detail: "This score is driven mostly by assumptions and planning inputs.",
  };
}

function isDraftPayload(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof payload.idea === "string" &&
      typeof payload.goal === "string" &&
      Number.isFinite(payload.deadlineDays) &&
      Number.isFinite(payload.hoursPerWeek) &&
      Number.isFinite(payload.confidence) &&
      ["tiny", "focused", "ambitious"].includes(payload.scope) &&
      ["low", "medium", "high"].includes(payload.riskAppetite) &&
      (payload.evidence === undefined || ["idea", "signals", "users"].includes(payload.evidence)),
  );
}
