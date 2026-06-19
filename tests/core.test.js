import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemo,
  createHistoryEntry,
  migrateHistory,
  parseDraft,
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
};

const result = {
  score: 82,
  verdict: "Green light",
  summary: "The project is ready for a focused first build.",
  metrics: { clarity: 84, feasibility: 78, momentum: 86, risk: 35 },
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

test("drafts round-trip and malformed drafts are ignored", () => {
  assert.deepEqual(parseDraft(serializeDraft(payload)), payload);
  assert.equal(parseDraft('{"version":2}'), null);
  assert.equal(parseDraft("not json"), null);
});

test("decision memo includes the lever and execution timeline", () => {
  const memo = buildMemo(payload, result);

  assert.match(memo, /## Best Lever/);
  assert.match(memo, /Remove one feature family/);
  assert.match(memo, /## Timeline/);
  assert.match(memo, /\*\*Day 1:\*\* Define the success signal\./);
});
