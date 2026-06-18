const form = document.querySelector("#projectForm");
const apiStatus = document.querySelector("#apiStatus");
const verdict = document.querySelector("#verdict");
const summary = document.querySelector("#summary");
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
const historyList = document.querySelector("#historyList");
const sampleButton = document.querySelector("#sampleButton");
const clearButton = document.querySelector("#clearButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const confidence = document.querySelector("#confidence");
const confidenceValue = document.querySelector("#confidenceValue");
const copyMemoButton = document.querySelector("#copyMemoButton");
const downloadMemoButton = document.querySelector("#downloadMemoButton");

const HISTORY_KEY = "pulseboard.history.v2";
let lastAnalysis = null;

const sampleProject = {
  idea: "A lightweight customer dashboard that tracks API uptime, usage spikes, support notes, and launch blockers for small SaaS teams.",
  goal: "Ship a demo that shows live health signals and one weekly action list.",
  deadlineDays: 21,
  hoursPerWeek: 8,
  confidence: 4,
  scope: "focused",
  riskAppetite: "medium",
};

function formPayload() {
  const data = new FormData(form);
  return {
    idea: data.get("idea"),
    goal: data.get("goal"),
    deadlineDays: Number(data.get("deadlineDays")),
    hoursPerWeek: Number(data.get("hoursPerWeek")),
    confidence: Number(data.get("confidence")),
    scope: data.get("scope"),
    riskAppetite: data.get("riskAppetite"),
  };
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
  scoreValue.textContent = result.score;
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
      const label = document.createElement("span");
      const number = document.createElement("strong");
      const meter = document.createElement("div");
      const bar = document.createElement("i");
      label.textContent = titleCase(name);
      number.textContent = value;
      meter.className = "meter";
      bar.style.width = `${value}%`;
      meter.append(bar);
      item.append(label, number, meter);
      return item;
    }),
  );

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
}

function listItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function titleCase(value) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function setStatus(message, state = "idle") {
  apiStatus.textContent = message;
  apiStatus.dataset.state = state;
}

function saveHistory(payload, result) {
  const history = loadHistory();
  const previousScore = history[0]?.score;
  const entry = {
    id: crypto.randomUUID(),
    idea: payload.idea,
    score: result.score,
    verdict: result.verdict,
    delta: Number.isFinite(previousScore) ? result.score - previousScore : null,
    payload,
    result,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 6)));
  renderHistory();
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    historyList.innerHTML = '<p class="empty-state">No scores yet.</p>';
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
          applyPayload(entry.payload);
          renderResult(entry.result);
          lastAnalysis = { payload: entry.payload, result: entry.result };
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
  form.idea.value = payload.idea;
  form.goal.value = payload.goal;
  form.deadlineDays.value = payload.deadlineDays;
  form.hoursPerWeek.value = payload.hoursPerWeek;
  form.confidence.value = payload.confidence;
  confidenceValue.textContent = payload.confidence;
  form.querySelector(`[name="scope"][value="${payload.scope}"]`).checked = true;
  form.querySelector(`[name="riskAppetite"][value="${payload.riskAppetite}"]`).checked = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formPayload();
  setStatus("Scoring", "busy");
  form.querySelector(".primary-action").disabled = true;
  try {
    const result = await scoreProject(payload);
    renderResult(result);
    lastAnalysis = { payload, result };
    saveHistory(payload, result);
    setStatus("API ok", "ok");
  } catch (error) {
    setStatus(error.name === "AbortError" ? "Timed out" : "Needs API", "error");
    summary.textContent = error.message;
  } finally {
    form.querySelector(".primary-action").disabled = false;
  }
});

sampleButton.addEventListener("click", () => {
  applyPayload(sampleProject);
});

clearButton.addEventListener("click", () => {
  form.reset();
  metricGrid.replaceChildren();
  nextSteps.replaceChildren();
  risks.replaceChildren();
  verdict.textContent = "Ready when you are";
  summary.textContent = "Add a project idea and PulseBoard will score clarity, feasibility, momentum, and risk.";
  scoreValue.textContent = "--";
  scoreRing.style.setProperty("--score", 0);
  signalRow.replaceChildren();
  timeline.replaceChildren();
  questions.replaceChildren();
  experimentGrid.replaceChildren();
  experimentSection.hidden = true;
  primaryResults.hidden = true;
  secondaryResults.hidden = true;
  copyMemoButton.disabled = true;
  downloadMemoButton.disabled = true;
  confidenceValue.textContent = confidence.value;
  lastAnalysis = null;
  setStatus("API idle");
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

confidence.addEventListener("input", () => {
  confidenceValue.textContent = confidence.value;
});

copyMemoButton.addEventListener("click", async () => {
  if (!lastAnalysis) return;
  try {
    await navigator.clipboard.writeText(buildMemo(lastAnalysis.payload, lastAnalysis.result));
    setStatus("Memo copied", "ok");
  } catch {
    setStatus("Copy unavailable", "error");
  }
});

downloadMemoButton.addEventListener("click", () => {
  if (!lastAnalysis) return;
  const blob = new Blob([buildMemo(lastAnalysis.payload, lastAnalysis.result)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pulseboard-decision-memo.md";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Memo downloaded", "ok");
});

function buildMemo(payload, result) {
  const metricRows = Object.entries(result.metrics)
    .map(([name, value]) => `- ${titleCase(name)}: ${value}`)
    .join("\n");
  const steps = result.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const riskRows = result.risks.map((risk) => `- ${risk}`).join("\n");
  const questionRows = result.questions.map((question) => `- ${question}`).join("\n");
  return `# PulseBoard Decision Memo

## ${result.verdict} - ${result.score}/100

**Idea:** ${payload.idea}

**First release goal:** ${payload.goal || "Ship a usable first version."}

${result.summary}

## Scorecard

${metricRows}

## Smallest Useful Experiment

- Build: ${result.smallestExperiment.build}
- Test: ${result.smallestExperiment.test}
- Success signal: ${result.smallestExperiment.success}

## Next Steps

${steps}

## Risks

${riskRows}

## Questions To Answer

${questionRows}
`;
}

renderHistory();
