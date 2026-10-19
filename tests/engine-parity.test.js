import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyseProject, analyseSlate } from "../static/engine.js";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(fixtureDir, "golden-engine.json"), "utf8"));
const v91 = JSON.parse(readFileSync(join(fixtureDir, "golden-v91.json"), "utf8"));

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

test("omitted mutedSignals keeps the engine 9.0 numeric score", () => {
  const payload = fixtures[0].payload;
  const omitted = analyseProject(payload);
  const empty = analyseProject({ ...payload, mutedSignals: [] });
  const asString = analyseProject({ ...payload, mutedSignals: "api" });
  const unknown = analyseProject({ ...payload, mutedSignals: ["nope"] });

  assert.equal(omitted.score, fixtures[0].result.score);
  assert.equal(empty.score, omitted.score);
  assert.equal(asString.score, omitted.score);
  assert.equal(unknown.score, omitted.score);
  assert.deepEqual(empty.metrics, omitted.metrics);
  assert.equal(empty.verdict, omitted.verdict);
  assert.equal(empty.goNoGo.decision, omitted.goNoGo.decision);
});

test("muted signal matches the Python oracle", () => {
  const result = analyseProject(v91.mute.payload);
  assert.equal(result.score, v91.mute.score);
  assert.equal(result.verdict, v91.mute.verdict);
  assert.equal(result.goNoGo.decision, v91.mute.decision);
  assert.deepEqual(result.metrics, v91.mute.metrics);
  assert.deepEqual(result.signals, v91.mute.signals);
  assert.deepEqual(result.assumptions, v91.mute.assumptions);
  assert.equal(result.signals.includes("ship"), false);
  assert.equal(
    result.assumptions.some((row) => row.source === "ship" && row.direction === "muted"),
    true,
  );
});

for (const slateCase of v91.slates) {
  test(`slate parity: ${slateCase.name}`, () => {
    const actual = analyseSlate(slateCase.payload);
    assert.equal(actual.modelVersion, slateCase.expect.modelVersion);
    assert.equal(actual.hoursPerWeek, slateCase.expect.hoursPerWeek);
    assert.equal(actual.totalAssigned, slateCase.expect.totalAssigned);
    assert.equal(actual.items.length, slateCase.expect.items.length);
    actual.items.forEach((item, index) => {
      const expected = slateCase.expect.items[index];
      assert.equal(item.rank, expected.rank);
      assert.equal(item.label, expected.label);
      assert.equal(item.hours, expected.hours);
      assert.equal(item.brief.idea, expected.brief.idea);
      assert.equal(item.brief.scope, expected.brief.scope);
      assert.equal(item.brief.confidence, expected.brief.confidence);
      assert.deepEqual(item.brief.mutedSignals, expected.brief.mutedSignals);
      assert.equal(item.result.score, expected.score);
      assert.equal(item.result.verdict, expected.verdict);
      assert.equal(item.result.goNoGo.decision, expected.decision);
      assert.deepEqual(item.result.metrics, expected.metrics);
      assert.deepEqual(item.result.signals, expected.signals);
    });
  });
}
