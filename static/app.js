const form = document.querySelector("#projectForm");
const apiStatus = document.querySelector("#apiStatus");
const verdict = document.querySelector("#verdict");
const summary = document.querySelector("#summary");
const scoreRing = document.querySelector("#scoreRing");
const scoreValue = document.querySelector("#scoreValue");
const metricGrid = document.querySelector("#metricGrid");
const nextSteps = document.querySelector("#nextSteps");
const risks = document.querySelector("#risks");
const historyList = document.querySelector("#historyList");
const sampleButton = document.querySelector("#sampleButton");
const clearButton = document.querySelector("#clearButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");

const HISTORY_KEY = "pulseboard.history.v1";

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
  const entry = {
    id: crypto.randomUUID(),
    idea: payload.idea,
    score: result.score,
    verdict: result.verdict,
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
      score.textContent = entry.score;
      verdictText.textContent = entry.verdict;
      idea.textContent = entry.idea;
      button.append(score, verdictText, idea);
      button.addEventListener("click", () => {
        form.idea.value = entry.idea;
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
  setStatus("API idle");
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

renderHistory();
