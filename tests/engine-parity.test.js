import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyseProject } from "../static/engine.js";

const fixtures = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "golden-engine.json"), "utf8"),
);

function failField(path, expected, actual) {
  assert.fail(
    `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function assertSame(path, actual, expected) {
  if (!Object.is(actual, expected) && actual !== expected) {
    failField(path, expected, actual);
  }
}

function assertDeep(path, actual, expected) {
  if (actual === expected) return;
  if (expected === null || expected === undefined || typeof expected !== "object") {
    assertSame(path, actual, expected);
    return;
  }
  if (actual === null || actual === undefined || typeof actual !== "object") {
    failField(path, expected, actual);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      failField(path, expected, actual);
    }
    expected.forEach((item, index) => assertDeep(`${path}[${index}]`, actual[index], item));
    return;
  }
  for (const key of Object.keys(expected)) {
    assertDeep(`${path}.${key}`, actual[key], expected[key]);
  }
}

fixtures.forEach((fixture, index) => {
  const label = fixture.payload.idea.slice(0, 48);
  test(`golden fixture ${index + 1}: ${label}`, () => {
    const result = analyseProject(fixture.payload);
    const expected = fixture.result;

    assertSame("score", result.score, expected.score);
    assertSame("verdict", result.verdict, expected.verdict);
    assertDeep("metrics", result.metrics, expected.metrics);
    assertSame("goNoGo.decision", result.goNoGo?.decision, expected.goNoGo.decision);
    assertDeep(
      "signals",
      [...(result.signals || [])].sort(),
      [...expected.signals].sort(),
    );
    assertDeep("scoreRange", result.scoreRange, expected.scoreRange);
    assertSame("evidenceGrade.label", result.evidenceGrade?.label, expected.evidenceGrade.label);
    assertSame(
      "highestImpactMoves.length",
      result.highestImpactMoves?.length,
      expected.highestImpactMoves.length,
    );
    assertSame(
      "scenarioVariants.length",
      result.scenarioVariants?.length,
      expected.scenarioVariants.length,
    );
    assertSame(
      "thisWeekPlan.blocks.length",
      result.thisWeekPlan?.blocks?.length,
      expected.thisWeekPlan.blocks.length,
    );
    assertSame(
      "stopConditions.length",
      result.stopConditions?.length,
      expected.stopConditions.length,
    );
    assertSame(
      "killCriteria.length",
      result.killCriteria?.length,
      expected.killCriteria.length,
    );
    assertSame(
      "sensitivityTable.length",
      result.sensitivityTable?.length,
      expected.sensitivityTable.length,
    );
    assertSame(
      "evidenceLadder.length",
      result.evidenceLadder?.length,
      expected.evidenceLadder.length,
    );
    assertDeep("goNoGo.thresholds", result.goNoGo?.thresholds, expected.goNoGo.thresholds);
  });
});
