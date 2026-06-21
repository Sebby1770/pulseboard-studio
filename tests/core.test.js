import test from "node:test";
import assert from "node:assert/strict";

import {
  baselineControlState,
  buildMemo,
  buildShareUrl,
  compareResults,
  createHistoryEntry,
  migrateHistory,
  normalizePayload,
  parseBaseline,
  parseDraft,
  parseShareUrl,
  serializeBaseline,
  serializeDraft,
  titleCase,
} from "../static/core.js";

const payload = {
  idea: "A project readiness dashboard.",
  goal: "Ship one useful workflow.",
  deadlineDays: 21,
  hoursPerWeek: 8,
  confidence: 4,
  scope: "focused",
  riskAppetite: "medium",
  evidence: "signals",
};

const result = {
  score: 82,
  scoreRange: { low: 75, high: 89, margin: 7 },
  verdict: "Green light",
  summary: "The project is ready for a focused first build.",
  metrics: { clarity: 84, feasibility: 78, momentum: 86, evidence: 60, risk: 35 },
  evidenceGrade: {
    label: "Directional",
    detail: "Some external interest exists, but user behavior is not yet proven.",
  },
  recommendedLever: {
    metric: "Feasibility",
    title: "Remove one feature family",
    action: "Keep one complete workflow.",
    rationale: "A narrower release is easier to validate.",
  },
  smallestExperiment: {
    build: "Build one dashboard view.",
    test: "Test it with three users.",
    success: "Two users find the next action.",
  },
  timeline: [
    { label: "Day 1", action: "Define the success signal." },
    { label: "Ship window", action: "Publish the demo." },
  ],
  nextSteps: ["Write the promise.", "Build the happy path."],
  risks: ["Demand is still unproven."],
  questions: ["Who is the first user?"],
};

test("titleCase formats camel-case metric names", () => {
  assert.equal(titleCase("deliveryRisk"), "Delivery Risk");
});

test("history entries include a score delta", () => {
  const entry = createHistoryEntry(payload, result, [{ score: 70 }], {
    id: "test-id",
    createdAt: "2026-06-19T00:00:00.000Z",
  });

  assert.equal(entry.delta, 12);
  assert.equal(entry.id, "test-id");
  assert.deepEqual(entry.payload, payload);
});

test("legacy history is migrated without losing the score", () => {
  const legacy = JSON.stringify([
    {
      id: "legacy-id",
      idea: "A legacy project.",
      score: 64,
      verdict: "Promising, trim scope",
      createdAt: "2026-06-16T00:00:00.000Z",
    },
  ]);

  const migrated = migrateHistory(null, legacy);

  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].score, 64);
  assert.equal(migrated[0].migrated, true);
});

test("v0.3 snapshots receive evidence defaults when restored", () => {
  const oldPayload = { ...payload };
  delete oldPayload.evidence;
  const oldResult = { ...result, metrics: { ...result.metrics } };
  delete oldResult.metrics.evidence;
  delete oldResult.evidenceGrade;
  delete oldResult.scoreRange;

  const restored = migrateHistory(
    JSON.stringify([
      {
        id: "v03-id",
        idea: oldPayload.idea,
        score: oldResult.score,
        verdict: oldResult.verdict,
        payload: oldPayload,
        result: oldResult,
      },
    ]),
    null,
  );

  assert.equal(restored[0].payload.evidence, "idea");
  assert.equal(restored[0].result.metrics.evidence, 20);
  assert.equal(restored[0].result.evidenceGrade.label, "Early estimate");
  assert.equal(restored[0].result.scoreRange.margin, 12);
});

test("scenario comparison treats lower risk as an improvement", () => {
  const previous = {
    score: 70,
    metrics: { clarity: 80, feasibility: 70, momentum: 75, evidence: 20, risk: 70 },
  };
  const comparison = compareResults(previous, result);
  const risk = comparison.metrics.find((metric) => metric.name === "risk");

  assert.equal(comparison.scoreDelta, 12);
  assert.equal(comparison.status, "improved");
  assert.equal(risk.delta, -35);
  assert.equal(risk.status, "improved");
});

test("drafts round-trip and malformed drafts are ignored", () => {
  assert.deepEqual(parseDraft(serializeDraft(payload)), payload);
  assert.equal(parseDraft('{"version":3}'), null);
  assert.equal(parseDraft("not json"), null);
});

test("v1 drafts gain the safe idea-only evidence default", () => {
  const oldPayload = { ...payload };
  delete oldPayload.evidence;
  const migrated = parseDraft(JSON.stringify({ version: 1, payload: oldPayload }));

  assert.equal(migrated.evidence, "idea");
});

test("payload normalization preserves valid evidence and defaults missing evidence", () => {
  assert.equal(normalizePayload(payload).evidence, "signals");
  assert.equal(normalizePayload({ ...payload, evidence: undefined }).evidence, "idea");
});

test("share links keep normalized scenario inputs in the URL fragment", () => {
  const url = buildShareUrl(payload, "https://example.com/studio?old=value#results");
  const parsed = parseShareUrl(url);
  const sharedUrl = new URL(url);
  const fragment = new URLSearchParams(sharedUrl.hash.slice(1));

  assert.deepEqual(parsed, payload);
  assert.equal(fragment.get("v"), "2");
  assert.equal(fragment.get("idea"), payload.idea);
  assert.equal(sharedUrl.search, "");
});

test("v0.6 query-string share links remain compatible", () => {
  const legacyUrl = new URL("https://example.com/studio");
  legacyUrl.searchParams.set("v", "1");
  legacyUrl.searchParams.set("idea", payload.idea);
  legacyUrl.searchParams.set("goal", payload.goal);
  legacyUrl.searchParams.set("deadline", String(payload.deadlineDays));
  legacyUrl.searchParams.set("hours", String(payload.hoursPerWeek));
  legacyUrl.searchParams.set("confidence", String(payload.confidence));
  legacyUrl.searchParams.set("scope", payload.scope);
  legacyUrl.searchParams.set("risk", payload.riskAppetite);
  legacyUrl.searchParams.set("evidence", payload.evidence);

  assert.deepEqual(parseShareUrl(legacyUrl), payload);
});

test("shared inputs are allow-listed, clamped, and stripped of null bytes", () => {
  const url = new URL("https://example.com/studio");
  url.searchParams.set("idea", `\0${"x".repeat(400)}`);
  url.searchParams.set("goal", " safe goal \0");
  url.searchParams.set("deadline", "9999");
  url.searchParams.set("hours", "-4");
  url.searchParams.set("confidence", "99");
  url.searchParams.set("scope", "everything");
  url.searchParams.set("risk", "reckless");
  url.searchParams.set("evidence", "invented");

  const parsed = parseShareUrl(url);

  assert.equal(parsed.idea.length, 320);
  assert.equal(parsed.idea.includes("\0"), false);
  assert.equal(parsed.goal, "safe goal");
  assert.equal(parsed.deadlineDays, 180);
  assert.equal(parsed.hoursPerWeek, 1);
  assert.equal(parsed.confidence, 5);
  assert.equal(parsed.scope, "focused");
  assert.equal(parsed.riskAppetite, "medium");
  assert.equal(parsed.evidence, "idea");
  assert.equal(parseShareUrl("https://example.com/studio?idea="), null);
  assert.equal(parseShareUrl("javascript:alert(1)"), null);
});

test("baselines store only normalized inputs and comparable metrics", () => {
  const baseline = parseBaseline(serializeBaseline(payload, result));

  assert.deepEqual(baseline.payload, payload);
  assert.deepEqual(baseline.result, {
    score: 82,
    metrics: { clarity: 84, feasibility: 78, momentum: 86, evidence: 60, risk: 35 },
  });
  assert.equal(baseline.result.summary, undefined);
});

test("malformed or out-of-range baselines are rejected", () => {
  const invalid = JSON.stringify({
    version: 1,
    payload,
    result: { score: 82, metrics: { ...result.metrics, risk: 900 } },
  });

  assert.equal(parseBaseline(invalid), null);
  assert.equal(parseBaseline("not json"), null);
});

test("baseline controls reset cleanly when stored state is removed", () => {
  const baseline = parseBaseline(serializeBaseline(payload, result));

  assert.deepEqual(baselineControlState(baseline, result), {
    label: "Baseline set",
    disabled: true,
    isCurrent: true,
  });
  assert.deepEqual(baselineControlState(null, null), {
    label: "Set baseline",
    disabled: true,
    isCurrent: false,
  });
});

test("decision memo includes the lever and execution timeline", () => {
  const memo = buildMemo(payload, result);

  assert.match(memo, /## Best Lever/);
  assert.match(memo, /Remove one feature family/);
  assert.match(memo, /\*\*Validation evidence:\*\* External signals/);
  assert.match(memo, /\*\*Score confidence:\*\* Directional/);
  assert.match(memo, /\*\*Likely score range:\*\* 75-89/);
  assert.match(memo, /## Timeline/);
  assert.match(memo, /\*\*Day 1:\*\* Define the success signal\./);
});

test("decision memo carries scenario comparison context", () => {
  const previous = {
    score: 70,
    metrics: { clarity: 80, feasibility: 70, momentum: 75, evidence: 20, risk: 70 },
  };
  const comparison = compareResults(previous, result);
  comparison.context = "Pinned baseline";
  const memo = buildMemo(payload, result, comparison);

  assert.match(memo, /## Scenario Comparison/);
  assert.match(memo, /\*\*Compared with:\*\* Pinned baseline/);
  assert.match(memo, /Overall score: \+12 \(Improved\)/);
  assert.match(memo, /Risk: -35 \(Improved; lower is better\)/);
});
