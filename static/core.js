export const DEFAULT_GOAL = "Ship a usable first version.";
export const HISTORY_LIMIT = 6;

const EVIDENCE_LABELS = {
  idea: "Idea only",
  signals: "External signals",
  users: "Observed users",
};

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

export function normalizePayload(payload = {}) {
  return {
    idea: typeof payload.idea === "string" ? payload.idea : "",
    goal: typeof payload.goal === "string" ? payload.goal : "",
    deadlineDays: Number.isFinite(payload.deadlineDays) ? payload.deadlineDays : 21,
    hoursPerWeek: Number.isFinite(payload.hoursPerWeek) ? payload.hoursPerWeek : 8,
    confidence: Number.isFinite(payload.confidence) ? payload.confidence : 3,
    scope: ["tiny", "focused", "ambitious"].includes(payload.scope) ? payload.scope : "focused",
    riskAppetite: ["low", "medium", "high"].includes(payload.riskAppetite)
      ? payload.riskAppetite
      : "medium",
    evidence: ["idea", "signals", "users"].includes(payload.evidence) ? payload.evidence : "idea",
  };
}

export function buildMemo(payload, result) {
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
  return `# PulseBoard Decision Memo

## ${result.verdict} - ${result.score}/100

**Idea:** ${normalizedPayload.idea}

**First release goal:** ${normalizedPayload.goal || DEFAULT_GOAL}

**Validation evidence:** ${EVIDENCE_LABELS[normalizedPayload.evidence]}

**Score confidence:** ${evidenceGrade.label} - ${evidenceGrade.detail}

**Likely score range:** ${scoreRange.low}-${scoreRange.high}

${result.summary}

## Best Lever

**${lever.title}** (${lever.metric})

${lever.action}

${lever.rationale}

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

## Questions To Answer

${questionRows}
`;
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
