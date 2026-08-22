import {
  HISTORY_LIMIT,
  baselineControlState,
  buildMemo,
  buildShareUrl,
  compareResults,
  createHistoryEntry,
  migrateHistory,
  normalizePayload,
  parseBaseline,
  parseDraft,
  parseHistory,
  parseShareUrl,
  serializeBaseline,
  serializeDraft,
  titleCase,
} from "./core.js";
import { MODEL_VERSION, ProjectInputError, analyseProject } from "./engine.js";

const form = document.querySelector("#projectForm");
const apiStatus = document.querySelector("#apiStatus");
const verdict = document.querySelector("#verdict");
const summary = document.querySelector("#summary");
const evidenceNote = document.querySelector("#evidenceNote");
const scoreRange = document.querySelector("#scoreRange");
const scoreRing = document.querySelector("#scoreRing");
const scoreValue = document.querySelector("#scoreValue");
const resultPanel = document.querySelector(".result-panel");
const modelVersion = document.querySelector("#modelVersion");
const metricGrid = document.querySelector("#metricGrid");
const signalRow = document.querySelector("#signalRow");
const nextSteps = document.querySelector("#nextSteps");
const risks = document.querySelector("#risks");
const stopConditions = document.querySelector("#stopConditions");
const killCriteria = document.querySelector("#killCriteria");
const goNoGo = document.querySelector("#goNoGo");
const goNoGoReason = document.querySelector("#goNoGoReason");
const sensitivitySection = document.querySelector("#sensitivitySection");
const sensitivityList = document.querySelector("#sensitivityList");
const ladderSection = document.querySelector("#ladderSection");
const ladderList = document.querySelector("#ladderList");
const flipSection = document.querySelector("#flipSection");
const flipList = document.querySelector("#flipList");
const timeline = document.querySelector("#timeline");
const questions = document.querySelector("#questions");
const experimentSection = document.querySelector("#experimentSection");
const experimentGrid = document.querySelector("#experimentGrid");
const primaryResults = document.querySelector("#primaryResults");
const secondaryResults = document.querySelector("#secondaryResults");
const leverSection = document.querySelector("#leverSection");
const impactSection = document.querySelector("#impactSection");
const impactList = document.querySelector("#impactList");
const scenarioSection = document.querySelector("#scenarioSection");
const scenarioGrid = document.querySelector("#scenarioGrid");
const weekPlanSection = document.querySelector("#weekPlanSection");
const weekPlanFocus = document.querySelector("#weekPlanFocus");
const weekPlanMeta = document.querySelector("#weekPlanMeta");
const weekPlanGrid = document.querySelector("#weekPlanGrid");
const weekCheckpoint = document.querySelector("#weekCheckpoint");
const leverMetric = document.querySelector("#leverMetric");
const leverTitle = document.querySelector("#leverTitle");
const leverAction = document.querySelector("#leverAction");
const leverRationale = document.querySelector("#leverRationale");
const comparisonSection = document.querySelector("#comparisonSection");
const comparisonTitle = document.querySelector("#comparisonTitle");
const comparisonContext = document.querySelector("#comparisonContext");
const comparisonScore = document.querySelector("#comparisonScore");
const comparisonGrid = document.querySelector("#comparisonGrid");
const historyList = document.querySelector("#historyList");
const sampleButton = document.querySelector("#sampleButton");
const sampleChips = document.querySelector("#sampleChips");
const clearButton = document.querySelector("#clearButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const confidence = document.querySelector("#confidence");
const confidenceValue = document.querySelector("#confidenceValue");
const copyMemoButton = document.querySelector("#copyMemoButton");
const downloadMemoButton = document.querySelector("#downloadMemoButton");
const downloadJsonButton = document.querySelector("#downloadJsonButton");
const shareLinkButton = document.querySelector("#shareLinkButton");
const undoButton = document.querySelector("#undoButton");
const baselineButton = document.querySelector("#baselineButton");
const draftStatus = document.querySelector("#draftStatus");
const formError = document.querySelector("#formError");
const themeToggle = document.querySelector("#themeToggle");
const resultTabs = document.querySelector("#resultTabs");
const tabList = document.querySelector("#tabList");
const emptyCta = document.querySelector("#emptyCta");
const emptySampleButton = document.querySelector("#emptySampleButton");
const scoreMix = document.querySelector("#scoreMix");
const scoreMixCopy = document.querySelector("#scoreMixCopy");
const scoreMixBars = document.querySelector("#scoreMixBars");
const historySpark = document.querySelector("#historySpark");
const toast = document.querySelector("#toast");
const primaryAction = form.querySelector(".primary-action");

const HISTORY_KEY = "pulseboard.history.v2";
const LEGACY_HISTORY_KEY = "pulseboard.history.v1";
const DRAFT_KEY = "pulseboard.draft.v1";
const BASELINE_KEY = "pulseboard.baseline.v1";
const THEME_KEY = "pulseboard.theme.v1";
const TAB_KEY = "pulseboard.tab.v1";
const TABS = ["plan", "moves", "sensitivity", "evidence"];
const EVIDENCE_ORDER = ["idea", "signals", "users"];
const SCORE_WEIGHTS = {
  clarity: 0.22,
  feasibility: 0.28,
  momentum: 0.2,
  evidence: 0.14,
  risk: 0.16,
};

const SAMPLE_BRIEFS = {
  saas: {
    idea: "A lightweight customer dashboard that tracks API uptime, usage spikes, support notes, and launch blockers for small SaaS teams.",
    goal: "Ship a demo that shows live health signals and one weekly action list.",
    deadlineDays: 21,
    hoursPerWeek: 8,
    confidence: 4,
    scope: "focused",
    riskAppetite: "medium",
    evidence: "signals",
  },
  api: {
    idea: "Automate one customer onboarding workflow from an API webhook to a review queue with a manual fallback.",
    goal: "Ship a reliable input-to-output path that operators can recover when a case fails.",
    deadlineDays: 14,
    hoursPerWeek: 6,
    confidence: 3,
    scope: "focused",
    riskAppetite: "medium",
    evidence: "idea",
  },
  learn: {
    idea: "A tiny prototype that helps a new team learn how users ship weekly status updates.",
    goal: "Learn whether one user will complete a status update without training.",
    deadlineDays: 7,
    hoursPerWeek: 4,
    confidence: 2,
    scope: "tiny",
    riskAppetite: "low",
    evidence: "idea",
  },
  platform: {
    idea: "Build a platform with an API, dashboard, automation, and analytics for every customer workflow.",
    goal: "Launch the complete platform.",
    deadlineDays: 21,
    hoursPerWeek: 4,
    confidence: 2,
    scope: "ambitious",
    riskAppetite: "high",
    evidence: "idea",
  },
};

let lastAnalysis = null;
let draftTimer = null;
let toastTimer = null;
let engineMode = "on-device";
let usedOnDevice = false;
let scoring = false;
const undoStack = [];

function apiUrl(path = "api/score") {
  return new URL(path, document.baseURI).toString();
}

function engineStatusLabel() {
  const source = usedOnDevice || engineMode !== "api" ? "on-device" : "API";
  return `Engine ${MODEL_VERSION} · ${source}`;
}

function formPayload() {
  const data = new FormData(form);
  return normalizePayload({
    idea: data.get("idea"),
    goal: data.get("goal"),
    deadlineDays: Number(data.get("deadlineDays")),
    hoursPerWeek: Number(data.get("hoursPerWeek")),
    confidence: Number(data.get("confidence")),
    scope: data.get("scope"),
    riskAppetite: data.get("riskAppetite"),
    evidence: data.get("evidence"),
  });
}

async function scoreProject(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    let response;
    try {
      response = await fetch(apiUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      usedOnDevice = true;
      return analyseProject(payload);
    }

    const raw = await response.text();
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      if (!response.ok) {
        usedOnDevice = true;
        return analyseProject(payload);
      }
      throw new Error("Scoring API did not return JSON.");
    }

    if (response.status >= 400 && response.status < 500) {
      throw new Error(result.error || "Scoring failed.");
    }
    if (!response.ok) {
      usedOnDevice = true;
      return analyseProject(payload);
    }
    usedOnDevice = false;
    engineMode = "api";
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function checkApi() {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    const response = await fetch(apiUrl(), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    window.clearTimeout(timeout);
    const raw = await response.text();
    const status = JSON.parse(raw);
    if (!response.ok || !status.modelVersion) throw new Error("offline");
    engineMode = "api";
    usedOnDevice = false;
    modelVersion.textContent = `Engine ${status.modelVersion}`;
    setStatus(`Engine ${status.modelVersion} · API`, "ok");
  } catch {
    engineMode = "on-device";
    usedOnDevice = true;
    modelVersion.textContent = `Engine ${MODEL_VERSION}`;
    setStatus(`Engine ${MODEL_VERSION} · on-device`, "ok");
  }
}

function renderResult(result) {
  resultPanel.dataset.ready = "true";
  resultTabs.hidden = false;
  if (emptyCta) emptyCta.hidden = true;
  modelVersion.textContent = `Engine ${result.modelVersion || MODEL_VERSION}`;
  verdict.textContent = result.verdict;
  if (result.goNoGo) {
    goNoGo.textContent = result.goNoGo.decision;
    goNoGo.hidden = false;
    goNoGo.dataset.decision = result.goNoGo.decision;
    goNoGoReason.textContent = result.goNoGo.reason;
    goNoGoReason.hidden = false;
  } else {
    goNoGo.textContent = "";
    goNoGo.hidden = true;
    delete goNoGo.dataset.decision;
    goNoGoReason.textContent = "";
    goNoGoReason.hidden = true;
  }
  summary.textContent = result.summary;
  evidenceNote.textContent = `${result.evidenceGrade.label}: ${result.evidenceGrade.detail}`;
  evidenceNote.hidden = false;
  scoreValue.textContent = result.score;
  scoreRange.textContent = `Likely range ${result.scoreRange.low}-${result.scoreRange.high} (+/- ${result.scoreRange.margin})`;
  scoreRange.hidden = false;
  scoreRing.style.setProperty("--score", result.score);

  signalRow.replaceChildren(
    ...result.signals.map((signal) => {
      const chip = document.createElement("span");
      chip.textContent = signal;
      return chip;
    }),
  );

  metricGrid.replaceChildren(
    ...Object.entries(result.metrics).map(([name, value]) => {
      const item = document.createElement("div");
      item.className = "metric";
      item.dataset.metric = name;
      const label = document.createElement("span");
      const number = document.createElement("strong");
      const meter = document.createElement("div");
      const bar = document.createElement("i");
      label.textContent = name === "risk" ? "Risk (lower is better)" : titleCase(name);
      number.textContent = value;
      meter.className = "meter";
      bar.style.width = `${value}%`;
      meter.append(bar);
      item.append(label, number, meter);
      return item;
    }),
  );

  const lever = result.recommendedLever;
  leverMetric.textContent = lever.metric;
  leverTitle.textContent = lever.title;
  leverAction.textContent = lever.action;
  leverRationale.textContent = lever.rationale;
  leverSection.hidden = false;

  renderScoreMix(result);
  renderImpactMoves(result.highestImpactMoves || []);
  renderScenarioVariants(result.scenarioVariants || []);
  renderSensitivity(result.sensitivityTable || []);
  renderEvidenceLadder(result.evidenceLadder || []);
  renderFlipPoints(result.flipPoints || []);
  renderWeekPlan(result.thisWeekPlan);
  nextSteps.replaceChildren(...result.nextSteps.map((step) => listItem(step)));
  risks.replaceChildren(...result.risks.map((risk) => listItem(risk)));
  stopConditions.replaceChildren(
    ...(result.stopConditions || []).map((condition) => listItem(condition)),
  );
  killCriteria.replaceChildren(...(result.killCriteria || []).map((item) => listItem(item)));
  questions.replaceChildren(...result.questions.map((question) => listItem(question)));
  timeline.replaceChildren(
    ...result.timeline.map((item) => {
      const row = document.createElement("li");
      const label = document.createElement("strong");
      const action = document.createElement("span");
      label.textContent = item.label;
      action.textContent = item.action;
      row.append(label, action);
      return row;
    }),
  );

  const experimentLabels = { build: "Build", test: "Test", success: "Success signal" };
  experimentGrid.replaceChildren(
    ...Object.entries(result.smallestExperiment).map(([key, value]) => {
      const item = document.createElement("div");
      const label = document.createElement("strong");
      const detail = document.createElement("span");
      label.textContent = experimentLabels[key];
      detail.textContent = value;
      item.append(label, detail);
      return item;
    }),
  );
  experimentSection.hidden = false;
  primaryResults.hidden = false;
  secondaryResults.hidden = false;
  copyMemoButton.disabled = false;
  downloadMemoButton.disabled = false;
  downloadJsonButton.disabled = false;
  shareLinkButton.disabled = false;
  updateUndoButton();
  updateBaselineButton(result);
}

function renderScoreMix(result) {
  if (!result?.metrics || !scoreMix) {
    return;
  }
  const parts = Object.entries(SCORE_WEIGHTS).map(([name, weight]) => {
    const raw = Number(result.metrics[name]) || 0;
    const value = name === "risk" ? 100 - raw : raw;
    return {
      name,
      weight,
      value,
      contribution: value * weight,
    };
  });
  const total = parts.reduce((sum, part) => sum + part.contribution, 0);
  const top = parts.slice().sort((a, b) => b.contribution - a.contribution)[0];
  scoreMixCopy.textContent =
    `Weighted mix is ${Math.round(total)}. Strongest term: ${titleCase(top.name)} ` +
    `(${Math.round(top.weight * 100)}% × ${Math.round(top.value)}).`;
  scoreMixBars.replaceChildren(
    ...parts.map((part) => {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const bar = document.createElement("i");
      const number = document.createElement("strong");
      label.textContent = `${titleCase(part.name)} ${Math.round(part.weight * 100)}%`;
      bar.style.width = `${Math.max(4, part.value)}%`;
      number.textContent = `${part.contribution.toFixed(1)}`;
      row.append(label, bar, number);
      return row;
    }),
  );
  scoreMix.hidden = false;
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function updateUndoButton() {
  undoButton.disabled = undoStack.length === 0;
}

function renderHistorySpark(history) {
  if (!historySpark) return;
  if (history.length < 2) {
    historySpark.hidden = true;
    return;
  }
  historySpark.hidden = false;
  const scores = history.map((entry) => entry.score).reverse();
  const width = historySpark.width;
  const height = historySpark.height;
  const context = historySpark.getContext("2d");
  const style = getComputedStyle(document.documentElement);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = style.getPropertyValue("--teal").trim() || "#009f93";
  context.lineWidth = 2;
  context.beginPath();
  scores.forEach((score, index) => {
    const x = (index / (scores.length - 1)) * (width - 8) + 4;
    const y = height - 6 - (score / 100) * (height - 12);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function renderScenarioVariants(variants) {
  scenarioGrid.replaceChildren(
    ...variants.map((variant) => {
      const item = document.createElement("button");
      const label = document.createElement("span");
      const score = document.createElement("strong");
      const verdictText = document.createElement("em");
      const detail = document.createElement("span");
      const changes = document.createElement("span");

      item.type = "button";
      item.className = "scenario-card";
      item.dataset.delta = variant.delta > 0 ? "up" : variant.delta < 0 ? "down" : "flat";
      item.setAttribute("aria-label", `Apply scenario ${variant.label}`);
      label.textContent = variant.label;
      score.textContent = `${variant.delta > 0 ? "+" : ""}${variant.delta}`;
      verdictText.textContent = `${variant.score}/100 - ${variant.verdict}`;
      detail.className = "detail";
      detail.textContent = variant.rationale;
      changes.className = "scenario-changes";
      changes.replaceChildren(
        ...variant.changes.map((change) => {
          const line = document.createElement("span");
          line.textContent = change;
          return line;
        }),
      );
      item.append(label, score, verdictText, detail, changes);
      item.addEventListener("click", () => {
        applyAndAnalyze(patchFromChanges(formPayload(), variant.changes));
      });
      return item;
    }),
  );
  scenarioSection.hidden = !variants.length;
}

function renderSensitivity(rows) {
  if (!rows.length) {
    sensitivitySection.hidden = true;
    sensitivityList.replaceChildren();
    return;
  }

  sensitivityList.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("button");
      const label = document.createElement("span");
      const score = document.createElement("strong");
      const detail = document.createElement("span");
      const sign = row.delta > 0 ? "+" : "";
      item.type = "button";
      item.className = "sensitivity-row";
      item.dataset.delta = row.delta > 0 ? "up" : row.delta < 0 ? "down" : "flat";
      item.setAttribute("aria-label", `Apply ${row.input} ${row.direction}`);
      label.textContent = `${row.input} ${row.direction}`;
      score.textContent = `${sign}${row.delta}`;
      detail.className = "detail";
      detail.textContent = `${row.from} -> ${row.to} lands at ${row.score}/100`;
      item.append(label, score, detail);
      item.addEventListener("click", () => {
        applyAndAnalyze(patchFromField(formPayload(), row.input, row.to));
      });
      return item;
    }),
  );
  sensitivitySection.hidden = false;
}

function renderEvidenceLadder(rungs) {
  if (!rungs.length) {
    ladderSection.hidden = true;
    ladderList.replaceChildren();
    return;
  }

  ladderList.replaceChildren(
    ...rungs.map((rung) => {
      const item = document.createElement("button");
      const label = document.createElement("span");
      const score = document.createElement("strong");
      const decision = document.createElement("em");
      item.type = "button";
      item.className = "ladder-rung";
      if (rung.current) item.dataset.current = "true";
      item.dataset.decision = rung.decision;
      item.setAttribute("aria-label", `Set evidence to ${rung.evidence}`);
      label.textContent = rung.label;
      score.textContent = `${rung.score}/100`;
      decision.textContent = rung.decision;
      item.append(label, score, decision);
      item.addEventListener("click", () => {
        applyAndAnalyze({ ...formPayload(), evidence: rung.evidence });
      });
      return item;
    }),
  );
  ladderSection.hidden = false;
}

function renderFlipPoints(points) {
  if (!points.length) {
    flipSection.hidden = true;
    flipList.replaceChildren();
    return;
  }

  flipList.replaceChildren(
    ...points.map((point) => {
      const item = document.createElement("button");
      const label = document.createElement("span");
      const score = document.createElement("strong");
      const detail = document.createElement("span");
      const sign = point.delta > 0 ? "+" : "";
      item.type = "button";
      item.className = "flip-row";
      item.dataset.decision = point.decision;
      item.setAttribute("aria-label", `Apply flip on ${point.input}`);
      label.textContent = point.input;
      score.textContent = point.decision;
      detail.className = "detail";
      detail.textContent = `${point.from} -> ${point.to} (${sign}${point.delta} to ${point.score}/100)`;
      item.append(label, score, detail);
      item.addEventListener("click", () => {
        applyAndAnalyze(patchFromField(formPayload(), point.input, point.to));
      });
      return item;
    }),
  );
  flipSection.hidden = false;
}

function renderWeekPlan(plan) {
  if (!plan?.blocks?.length) {
    weekPlanSection.hidden = true;
    weekPlanGrid.replaceChildren();
    weekPlanFocus.textContent = "";
    weekPlanMeta.textContent = "";
    weekCheckpoint.textContent = "";
    return;
  }

  weekPlanFocus.textContent = plan.focus;
  weekPlanMeta.textContent = `${plan.availableHours} ${plan.availableHours === 1 ? "hour" : "hours"}`;
  weekCheckpoint.textContent = plan.checkpoint;
  weekPlanGrid.replaceChildren(
    ...plan.blocks.map((block) => {
      const item = document.createElement("article");
      const label = document.createElement("strong");
      const hours = document.createElement("span");
      const action = document.createElement("p");
      item.className = "week-block";
      label.textContent = block.label;
      hours.textContent = `${block.hours}h`;
      action.textContent = block.action;
      item.append(label, hours, action);
      return item;
    }),
  );
  weekPlanSection.hidden = false;
}

function renderImpactMoves(moves) {
  impactList.replaceChildren(
    ...moves.map((move, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "impact-item";
      item.setAttribute("aria-label", `Apply move ${move.title}`);
      const rank = document.createElement("span");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const action = document.createElement("span");
      const meta = document.createElement("span");
      const score = document.createElement("div");
      const delta = document.createElement("strong");
      const projected = document.createElement("small");

      rank.className = "impact-rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      copy.className = "impact-copy";
      title.textContent = move.title;
      action.className = "impact-action";
      action.textContent = move.action;
      meta.className = "impact-meta";
      meta.textContent = `${move.metric} · ${move.effort}`;
      score.className = "impact-score";
      delta.textContent = move.delta > 0 ? `+${move.delta}` : String(move.delta);
      projected.textContent = `to ${move.projectedScore}`;

      copy.append(title, action, meta);
      score.append(delta, projected);
      item.append(rank, copy, score);
      item.addEventListener("click", () => {
        applyAndAnalyze(patchFromMove(formPayload(), move.id));
      });
      return item;
    }),
  );
  impactSection.hidden = !moves.length;
}

function renderComparison(previous, current, context = "") {
  if (context === "Pinned baseline" && resultsMatch(previous, current)) previous = null;
  const comparison = compareResults(previous, current);
  if (!comparison) {
    comparisonSection.hidden = true;
    comparisonGrid.replaceChildren();
    comparisonContext.textContent = "";
    comparisonContext.hidden = true;
    return null;
  }

  const titles = {
    improved: "This scenario is stronger",
    worsened: "This scenario needs more work",
    stable: "The overall score is unchanged",
  };
  comparisonTitle.textContent = titles[comparison.status];
  comparisonContext.textContent = context;
  comparisonContext.hidden = !context;
  comparisonScore.textContent = `${comparison.scoreDelta > 0 ? "+" : ""}${comparison.scoreDelta}`;
  comparisonScore.dataset.status = comparison.status;
  comparisonGrid.replaceChildren(
    ...comparison.metrics.map((metric) => {
      const item = document.createElement("div");
      const label = document.createElement("span");
      const delta = document.createElement("strong");
      const status = document.createElement("small");
      item.dataset.status = metric.status;
      label.textContent = metric.name === "risk" ? "Risk" : titleCase(metric.name);
      delta.textContent = metric.delta === 0 ? "0" : `${metric.delta > 0 ? "+" : ""}${metric.delta}`;
      status.textContent = titleCase(metric.status);
      item.append(label, delta, status);
      return item;
    }),
  );
  comparisonSection.hidden = false;
  comparison.context = context;
  return comparison;
}

function listItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function setStatus(message, state = "idle") {
  apiStatus.textContent = message;
  apiStatus.dataset.state = state;
}

function saveHistory(payload, result) {
  const history = loadHistory();
  const entry = createHistoryEntry(payload, result, history);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, HISTORY_LIMIT)));
  renderHistory();
}

function loadHistory() {
  const currentRaw = localStorage.getItem(HISTORY_KEY);
  const history = migrateHistory(currentRaw, localStorage.getItem(LEGACY_HISTORY_KEY));
  if (!parseHistory(currentRaw).length && history.length) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  }
  return history;
}

function loadBaseline() {
  return parseBaseline(localStorage.getItem(BASELINE_KEY));
}

function comparisonTarget(fallbackResult) {
  const baseline = loadBaseline();
  if (baseline) return { result: baseline.result, context: "Pinned baseline" };
  return fallbackResult
    ? { result: fallbackResult, context: "Previous score" }
    : { result: null, context: "" };
}

function updateBaselineButton(result) {
  const baseline = loadBaseline();
  const state = baselineControlState(baseline, result);
  baselineButton.textContent = state.label;
  baselineButton.disabled = state.disabled;
  if (result) baselineButton.dataset.state = state.isCurrent ? "set" : "ready";
  else delete baselineButton.dataset.state;
}

function resultsMatch(previous, current) {
  const comparison = compareResults(previous, current);
  return Boolean(
    comparison &&
      comparison.scoreDelta === 0 &&
      comparison.metrics.every((metric) => metric.delta === 0),
  );
}

function renderHistory() {
  const history = loadHistory();
  renderHistorySpark(history);
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No scores yet. Analyze a brief to build a trail.";
    historyList.replaceChildren(empty);
    return;
  }
  historyList.replaceChildren(
    ...history.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      const score = document.createElement("span");
      const verdictText = document.createElement("strong");
      const idea = document.createElement("small");
      const delta = document.createElement("em");
      score.textContent = entry.score;
      verdictText.textContent = entry.verdict;
      idea.textContent = entry.idea;
      if (Number.isFinite(entry.delta) && entry.delta !== 0) {
        delta.textContent = `${entry.delta > 0 ? "+" : ""}${entry.delta}`;
        delta.dataset.direction = entry.delta > 0 ? "up" : "down";
      }
      button.append(score, verdictText, idea, delta);
      button.addEventListener("click", () => restoreHistoryEntry(entry, history));
      return button;
    }),
  );
}

async function restoreHistoryEntry(entry, history) {
  if (!(entry.payload && entry.result)) {
    form.idea.value = entry.idea;
    form.idea.focus();
    return;
  }

  applyPayload(entry.payload);
  saveDraft(entry.payload, "Draft restored");
  const fallbackResult = history.find(
    (candidate) => candidate.id !== entry.id && candidate.result,
  )?.result;
  const target = comparisonTarget(fallbackResult);
  let result = entry.result;
  const stale = entry.result.modelVersion !== MODEL_VERSION;
  if (stale) {
    try {
      result = await scoreProject(entry.payload);
    } catch {
      result = entry.result;
    }
  }
  renderResult(result);
  const comparison = renderComparison(target.result, result, target.context);
  lastAnalysis = { payload: entry.payload, result, comparison };
  setStatus(stale && result !== entry.result ? engineStatusLabel() : "Snapshot restored", "ok");
  form.idea.focus();
}

function applyPayload(payload) {
  const normalized = normalizePayload(payload);
  form.idea.value = normalized.idea;
  form.goal.value = normalized.goal;
  form.deadlineDays.value = normalized.deadlineDays;
  form.hoursPerWeek.value = normalized.hoursPerWeek;
  form.confidence.value = normalized.confidence;
  confidenceValue.textContent = normalized.confidence;
  form.querySelector(`[name="scope"][value="${normalized.scope}"]`).checked = true;
  form.querySelector(`[name="riskAppetite"][value="${normalized.riskAppetite}"]`).checked = true;
  form.querySelector(`[name="evidence"][value="${normalized.evidence}"]`).checked = true;
}

function patchFromMove(payload, moveId) {
  const next = { ...payload };
  if (moveId === "evidence") {
    const index = EVIDENCE_ORDER.indexOf(next.evidence);
    next.evidence = EVIDENCE_ORDER[Math.min(EVIDENCE_ORDER.length - 1, index + 1)];
  } else if (moveId === "scope") {
    next.scope = next.scope === "ambitious" ? "focused" : "tiny";
  } else if (moveId === "capacity") {
    next.hoursPerWeek = Math.min(12, next.hoursPerWeek + 4);
  } else if (moveId === "deadline") {
    next.deadlineDays = Math.max(30, next.deadlineDays + 14);
  } else if (moveId === "confidence") {
    next.confidence = Math.min(5, next.confidence + 1);
  }
  return next;
}

function patchFromField(payload, input, to) {
  const next = { ...payload };
  if (input === "hoursPerWeek" || input === "deadlineDays" || input === "confidence") {
    next[input] = Number(to);
  } else if (input === "evidence" || input === "scope") {
    next[input] = to;
  }
  return next;
}

function patchFromChanges(payload, changes) {
  const next = { ...payload };
  for (const change of changes) {
    const scope = /^Scope: \S+ -> (\S+)$/.exec(change);
    const evidence = /^Evidence: \S+ -> (\S+)$/.exec(change);
    const confidenceMatch = /^Confidence: \S+ -> (\S+)$/.exec(change);
    const hours = /^Hours\/week: \S+ -> (\S+)$/.exec(change);
    const deadline = /^Deadline: \S+ -> (\S+) days$/.exec(change);
    if (scope) next.scope = scope[1];
    if (evidence) next.evidence = evidence[1];
    if (confidenceMatch) next.confidence = Number(confidenceMatch[1]);
    if (hours) next.hoursPerWeek = Number(hours[1]);
    if (deadline) next.deadlineDays = Number(deadline[1]);
  }
  return next;
}

async function runAnalysis(payload) {
  if (scoring) return null;
  const previousResult = loadHistory().find((entry) => entry.result)?.result;
  const target = comparisonTarget(previousResult);
  setFormError("");
  setStatus("Scoring", "busy");
  scoring = true;
  primaryAction.disabled = true;
  primaryAction.classList.add("is-scoring");
  try {
    const result = await scoreProject(payload);
    renderResult(result);
    const comparison = renderComparison(target.result, result, target.context);
    lastAnalysis = { payload, result, comparison };
    saveHistory(payload, result);
    saveDraft(payload);
    setStatus(engineStatusLabel(), "ok");
    return result;
  } catch (error) {
    const timedOut = error.name === "AbortError";
    const message = error.message || "Scoring failed.";
    setStatus(timedOut ? "Timed out" : engineStatusLabel(), timedOut ? "error" : "ok");
    summary.textContent = message;
    setFormError(message);
    if (error instanceof ProjectInputError || !payload.idea.trim()) form.idea.focus();
    return null;
  } finally {
    scoring = false;
    primaryAction.disabled = false;
    primaryAction.classList.remove("is-scoring");
  }
}

async function applyAndAnalyze(payload, statusMessage) {
  if (lastAnalysis?.payload) {
    undoStack.push({
      payload: lastAnalysis.payload,
      result: lastAnalysis.result,
      comparison: lastAnalysis.comparison,
    });
    updateUndoButton();
  }
  const normalized = normalizePayload(payload);
  applyPayload(normalized);
  saveDraft(normalized);
  const result = await runAnalysis(normalized);
  if (result && statusMessage) {
    setStatus(statusMessage, "ok");
    showToast(statusMessage);
  }
}

function restoreUndo() {
  const previous = undoStack.pop();
  updateUndoButton();
  if (!previous) return;
  applyPayload(previous.payload);
  renderResult(previous.result);
  const fallback = loadHistory().find(
    (entry) => entry.result && entry.payload?.idea !== previous.payload.idea,
  )?.result;
  const target = comparisonTarget(fallback);
  const comparison = renderComparison(target.result, previous.result, target.context);
  lastAnalysis = { payload: previous.payload, result: previous.result, comparison };
  saveDraft(previous.payload, "Undid last apply");
  setStatus("Undid last apply", "ok");
  showToast("Undid last apply");
}

function selectTab(id) {
  if (!TABS.includes(id)) return;
  for (const tab of TABS) {
    const button = document.querySelector(`#tab-${tab}`);
    const panel = document.querySelector(`#panel-${tab}`);
    const selected = tab === id;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
  }
  localStorage.setItem(TAB_KEY, id);
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "Light" : "Dark";
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
  );
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    applyTheme(stored);
    return;
  }
  applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAnalysis(formPayload());
});

form.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    form.requestSubmit();
  }
});

sampleButton.addEventListener("click", () => {
  applyAndAnalyze(SAMPLE_BRIEFS.saas);
});

sampleChips.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sample]");
  if (!button) return;
  const sample = SAMPLE_BRIEFS[button.dataset.sample];
  if (sample) applyAndAnalyze(sample);
});

clearButton.addEventListener("click", () => {
  form.reset();
  metricGrid.replaceChildren();
  nextSteps.replaceChildren();
  risks.replaceChildren();
  stopConditions.replaceChildren();
  killCriteria.replaceChildren();
  goNoGo.textContent = "";
  goNoGo.hidden = true;
  delete goNoGo.dataset.decision;
  goNoGoReason.textContent = "";
  goNoGoReason.hidden = true;
  sensitivityList.replaceChildren();
  sensitivitySection.hidden = true;
  ladderList.replaceChildren();
  ladderSection.hidden = true;
  flipList.replaceChildren();
  flipSection.hidden = true;
  verdict.textContent = "Ready when you are";
  summary.textContent =
    "Add a project idea and PulseBoard will score clarity, feasibility, momentum, evidence, and risk.";
  evidenceNote.textContent = "";
  evidenceNote.hidden = true;
  scoreValue.textContent = "--";
  scoreRange.textContent = "";
  scoreRange.hidden = true;
  scoreRing.style.setProperty("--score", 0);
  signalRow.replaceChildren();
  timeline.replaceChildren();
  questions.replaceChildren();
  impactList.replaceChildren();
  impactSection.hidden = true;
  scenarioGrid.replaceChildren();
  scenarioSection.hidden = true;
  weekPlanGrid.replaceChildren();
  weekPlanSection.hidden = true;
  weekPlanFocus.textContent = "";
  weekPlanMeta.textContent = "";
  weekCheckpoint.textContent = "";
  experimentGrid.replaceChildren();
  experimentSection.hidden = true;
  leverSection.hidden = true;
  comparisonSection.hidden = true;
  comparisonGrid.replaceChildren();
  comparisonContext.textContent = "";
  comparisonContext.hidden = true;
  primaryResults.hidden = true;
  secondaryResults.hidden = true;
  resultTabs.hidden = true;
  if (emptyCta) emptyCta.hidden = false;
  if (scoreMix) scoreMix.hidden = true;
  scoreMixBars?.replaceChildren();
  undoStack.length = 0;
  updateUndoButton();
  selectTab("plan");
  copyMemoButton.disabled = true;
  downloadMemoButton.disabled = true;
  downloadJsonButton.disabled = true;
  shareLinkButton.disabled = true;
  delete resultPanel.dataset.ready;
  confidenceValue.textContent = confidence.value;
  lastAnalysis = null;
  updateBaselineButton(null);
  localStorage.removeItem(DRAFT_KEY);
  window.history.replaceState(null, "", window.location.pathname);
  draftStatus.textContent = "";
  setFormError("");
  setStatus(engineStatusLabel(), "ok");
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(BASELINE_KEY);
  renderComparison(null, null);
  if (lastAnalysis) lastAnalysis.comparison = null;
  updateBaselineButton(lastAnalysis?.result);
  renderHistory();
});

confidence.addEventListener("input", () => {
  confidenceValue.textContent = confidence.value;
});

form.addEventListener("input", scheduleDraftSave);
form.addEventListener("change", scheduleDraftSave);

copyMemoButton.addEventListener("click", async () => {
  if (!lastAnalysis) return;
  try {
    await navigator.clipboard.writeText(
      buildMemo(lastAnalysis.payload, lastAnalysis.result, lastAnalysis.comparison),
    );
    setStatus("Memo copied", "ok");
    showToast("Memo copied");
  } catch {
    setStatus("Copy unavailable", "error");
  }
});

downloadMemoButton.addEventListener("click", () => {
  if (!lastAnalysis) return;
  const blob = new Blob(
    [buildMemo(lastAnalysis.payload, lastAnalysis.result, lastAnalysis.comparison)],
    {
      type: "text/markdown;charset=utf-8",
    },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pulseboard-decision-memo.md";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("Memo downloaded", "ok");
  showToast("Memo downloaded");
});

downloadJsonButton.addEventListener("click", () => {
  if (!lastAnalysis) return;
  const blob = new Blob(
    [
      JSON.stringify(
        {
          payload: lastAnalysis.payload,
          result: lastAnalysis.result,
          comparison: lastAnalysis.comparison,
        },
        null,
        2,
      ),
    ],
    { type: "application/json;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pulseboard-decision.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("JSON downloaded", "ok");
  showToast("JSON downloaded");
});

undoButton.addEventListener("click", restoreUndo);
emptySampleButton?.addEventListener("click", () => {
  applyAndAnalyze(SAMPLE_BRIEFS.saas, "SaaS sample scored");
});

shareLinkButton.addEventListener("click", async () => {
  if (!lastAnalysis) return;
  try {
    const url = buildShareUrl(lastAnalysis.payload, window.location.href);
    await navigator.clipboard.writeText(url);
    setStatus("Share link copied", "ok");
    showToast("Share link copied");
  } catch {
    setStatus("Share unavailable", "error");
  }
});

baselineButton.addEventListener("click", () => {
  if (!lastAnalysis) return;
  localStorage.setItem(
    BASELINE_KEY,
    serializeBaseline(lastAnalysis.payload, lastAnalysis.result),
  );
  renderComparison(null, null);
  lastAnalysis.comparison = null;
  updateBaselineButton(lastAnalysis.result);
  setStatus("Baseline set", "ok");
});

tabList.addEventListener("click", (event) => {
  const button = event.target.closest("[role='tab']");
  if (!button) return;
  selectTab(button.id.replace("tab-", ""));
});

tabList.addEventListener("keydown", (event) => {
  const current = TABS.indexOf(document.activeElement?.id?.replace("tab-", "") || "");
  if (current < 0) return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(current + offset + TABS.length) % TABS.length];
    selectTab(next);
    document.querySelector(`#tab-${next}`).focus();
  }
});

themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

function scheduleDraftSave() {
  window.clearTimeout(draftTimer);
  draftStatus.textContent = "Saving draft";
  draftTimer = window.setTimeout(() => saveDraft(formPayload()), 250);
}

function saveDraft(payload, message = "Draft saved") {
  if (!payload.idea.trim() && !payload.goal.trim()) {
    localStorage.removeItem(DRAFT_KEY);
    draftStatus.textContent = "";
    return;
  }
  localStorage.setItem(DRAFT_KEY, serializeDraft(payload));
  draftStatus.textContent = message;
}

function restoreDraft() {
  const draft = parseDraft(localStorage.getItem(DRAFT_KEY));
  if (!draft) return;
  applyPayload(draft);
  draftStatus.textContent = "Draft restored";
}

function restoreSharedScenario() {
  const shared = parseShareUrl(window.location.href);
  if (!shared) return null;
  applyPayload(shared);
  saveDraft(shared, "Shared brief loaded");
  window.history.replaceState(null, "", buildShareUrl(shared, window.location.href));
  return shared;
}

function setFormError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

window.addEventListener("keydown", (event) => {
  if (isTypingField(event.target)) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    restoreUndo();
    return;
  }
  if (["1", "2", "3", "4"].includes(event.key) && resultPanel.dataset.ready === "true") {
    selectTab(TABS[Number(event.key) - 1]);
  }
});

function isTypingField(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

initTheme();
const storedTab = localStorage.getItem(TAB_KEY);
selectTab(TABS.includes(storedTab) ? storedTab : "plan");
const sharedBrief = restoreSharedScenario();
if (!sharedBrief) restoreDraft();
renderHistory();
checkApi().then(() => {
  if (!sharedBrief) return;
  applyAndAnalyze(sharedBrief, "Shared brief loaded");
});
