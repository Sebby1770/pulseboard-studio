export const DEFAULT_GOAL = "Ship a usable first version.";
export const HISTORY_LIMIT = 6;

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
    result: entry.result ? withResultDefaults(entry.result) : entry.result,
  }));
}

export function createHistoryEntry(payload, result, history, options = {}) {
  const previousScore = history[0]?.score;
  return {
    id: options.id || globalThis.crypto?.randomUUID?.() || `history-${Date.now()}`,
    idea: payload.idea,
    score: result.score,
    verdict: result.verdict,
    delta: Number.isFinite(previousScore) ? result.score - previousScore : null,
    payload,
    result,
    createdAt: options.createdAt || new Date().toISOString(),
  };
}

export function serializeDraft(payload) {
  return JSON.stringify({ version: 1, payload });
}

export function parseDraft(raw) {
  try {
    const parsed = JSON.parse(raw || "null");
    if (parsed?.version !== 1 || !isDraftPayload(parsed.payload)) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export function buildMemo(payload, result) {
  const lever = result.recommendedLever || DEFAULT_LEVER;
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

**Idea:** ${payload.idea}

**First release goal:** ${payload.goal || DEFAULT_GOAL}

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
    recommendedLever: result.recommendedLever || DEFAULT_LEVER,
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
      ["low", "medium", "high"].includes(payload.riskAppetite),
  );
}
