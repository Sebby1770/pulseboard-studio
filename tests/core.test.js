import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemo,
  buildShareUrl,
  compareResults,
  createHistoryEntry,
  migrateHistory,
  normalizePayload,
  parseDraft,
  parseShareUrl,
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

test("share links round-trip normalized scenario inputs", () => {
  const url = buildShareUrl(payload, "https://example.com/studio?old=value#results");
  const parsed = parseShareUrl(url);

  assert.deepEqual(parsed, payload);
  assert.equal(new URL(url).searchParams.get("v"), "1");
  assert.equal(new URL(url).hash, "");
  assert.equal(new URL(url).searchParams.has("old"), false);
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
  const memo = buildMemo(payload, result, compareResults(previous, result));

  assert.match(memo, /## Scenario Comparison/);
  assert.match(memo, /Overall score: \+12 \(Improved\)/);
  assert.match(memo, /Risk: -35 \(Improved; lower is better\)/);
});
