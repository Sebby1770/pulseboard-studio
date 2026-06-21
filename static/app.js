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

const form = document.querySelector("#projectForm");
const apiStatus = document.querySelector("#apiStatus");
const verdict = document.querySelector("#verdict");
const summary = document.querySelector("#summary");
const evidenceNote = document.querySelector("#evidenceNote");
const scoreRange = document.querySelector("#scoreRange");
const scoreRing = document.querySelector("#scoreRing");
const scoreValue = document.querySelector("#scoreValue");
const metricGrid = document.querySelector("#metricGrid");
const signalRow = document.querySelector("#signalRow");
const nextSteps = document.querySelector("#nextSteps");
const risks = document.querySelector("#risks");
const timeline = document.querySelector("#timeline");
const questions = document.querySelector("#questions");
const experimentSection = document.querySelector("#experimentSection");
const experimentGrid = document.querySelector("#experimentGrid");
const primaryResults = document.querySelector("#primaryResults");
const secondaryResults = document.querySelector("#secondaryResults");
const leverSection = document.querySelector("#leverSection");
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
const clearButton = document.querySelector("#clearButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const confidence = document.querySelector("#confidence");
const confidenceValue = document.querySelector("#confidenceValue");
const copyMemoButton = document.querySelector("#copyMemoButton");
const downloadMemoButton = document.querySelector("#downloadMemoButton");
const shareLinkButton = document.querySelector("#shareLinkButton");
const baselineButton = document.querySelector("#baselineButton");
const draftStatus = document.querySelector("#draftStatus");
const formError = document.querySelector("#formError");

const HISTORY_KEY = "pulseboard.history.v2";
const LEGACY_HISTORY_KEY = "pulseboard.history.v1";
const DRAFT_KEY = "pulseboard.draft.v1";
const BASELINE_KEY = "pulseboard.baseline.v1";
let lastAnalysis = null;
let draftTimer = null;

const sampleProject = {
  idea: "A lightweight customer dashboard that tracks API uptime, usage spikes, support notes, and launch blockers for small SaaS teams.",
  goal: "Ship a demo that shows live health signals and one weekly action list.",
  deadlineDays: 21,
  hoursPerWeek: 8,
  confidence: 4,
  scope: "focused",
  riskAppetite: "medium",
  evidence: "signals",
};

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
    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Scoring failed.");
    }
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderResult(result) {
  verdict.textContent = result.verdict;
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

  nextSteps.replaceChildren(...result.nextSteps.map((step) => listItem(step)));
  risks.replaceChildren(...result.risks.map((risk) => listItem(risk)));
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
  shareLinkButton.disabled = false;
  updateBaselineButton(result);
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
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No scores yet.";
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
      button.addEventListener("click", () => {
        if (entry.payload && entry.result) {
          const fallbackResult = history.find(
            (candidate) => candidate.id !== entry.id && candidate.result,
          )?.result;
          const target = comparisonTarget(fallbackResult);
          applyPayload(entry.payload);
          renderResult(entry.result);
          const comparison = renderComparison(target.result, entry.result, target.context);
          lastAnalysis = { payload: entry.payload, result: entry.result, comparison };
          saveDraft(entry.payload, "Draft restored");
          setStatus("Snapshot restored", "ok");
        } else {
          form.idea.value = entry.idea;
        }
        form.idea.focus();
      });
      return button;
    }),
  );
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formPayload();
  const previousResult = loadHistory().find((entry) => entry.result)?.result;
  const target = comparisonTarget(previousResult);
  setFormError("");
  setStatus("Scoring", "busy");
  form.querySelector(".primary-action").disabled = true;
  try {
    const result = await scoreProject(payload);
    renderResult(result);
    const comparison = renderComparison(target.result, result, target.context);
    lastAnalysis = { payload, result, comparison };
    saveHistory(payload, result);
    saveDraft(payload);
    setStatus("API ok", "ok");
  } catch (error) {
    setStatus(error.name === "AbortError" ? "Timed out" : "Needs API", "error");
    summary.textContent = error.message;
    setFormError(error.message);
    if (!payload.idea.trim()) form.idea.focus();
  } finally {
    form.querySelector(".primary-action").disabled = false;
  }
});

sampleButton.addEventListener("click", () => {
  applyPayload(sampleProject);
  saveDraft(sampleProject);
});

clearButton.addEventListener("click", () => {
  form.reset();
  metricGrid.replaceChildren();
  nextSteps.replaceChildren();
  risks.replaceChildren();
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
  experimentGrid.replaceChildren();
  experimentSection.hidden = true;
  leverSection.hidden = true;
  comparisonSection.hidden = true;
  comparisonGrid.replaceChildren();
  comparisonContext.textContent = "";
  comparisonContext.hidden = true;
  primaryResults.hidden = true;
  secondaryResults.hidden = true;
  copyMemoButton.disabled = true;
  downloadMemoButton.disabled = true;
  shareLinkButton.disabled = true;
  confidenceValue.textContent = confidence.value;
  lastAnalysis = null;
  updateBaselineButton(null);
  localStorage.removeItem(DRAFT_KEY);
  window.history.replaceState(null, "", window.location.pathname);
  draftStatus.textContent = "";
  setFormError("");
  setStatus("API idle");
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
});

shareLinkButton.addEventListener("click", async () => {
  if (!lastAnalysis) return;
  try {
    const url = buildShareUrl(lastAnalysis.payload, window.location.href);
    await navigator.clipboard.writeText(url);
    setStatus("Share link copied", "ok");
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
  if (!shared) return false;
  applyPayload(shared);
  saveDraft(shared, "Shared scenario loaded");
  window.history.replaceState(null, "", buildShareUrl(shared, window.location.href));
  setStatus("Scenario loaded", "ok");
  return true;
}

function setFormError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

if (!restoreSharedScenario()) restoreDraft();
renderHistory();
