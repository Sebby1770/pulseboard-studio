# PulseBoard Studio

PulseBoard Studio is a deterministic decision console: paste a project brief, get a ship / hold / kill call, then click the move that changes the score.

Live site: [https://Sebby1770.github.io/pulseboard-studio/](https://Sebby1770.github.io/pulseboard-studio/)

![PulseBoard decision field](static/assets/decision-field.png)

It is inspectable on purpose. Scoring is a heuristic (word counts, allow-listed enums, a 14-word signal set). There is no API key and no model call.

Version 1.3 adds undo for applied moves, a score-mix breakdown, JSON export, and a one-click empty-state sample. Engine 9.0 is unchanged. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Dual engine

- Locally (`python3 server.py` or `npm start` on port 8787) the browser POSTs `api/score` and Python scores the brief.
- On GitHub Pages, or if the API is down, `static/engine.js` scores the same payload on-device.
- Share links still carry **inputs only**. Computed scores are always regenerated.

The status chip reports `Engine 9.0 · API` or `Engine 9.0 · on-device`. Both are valid modes.

## Formula (engine 9.0)

Weighted score, then Python 3 banker's round to 0–100:

- Clarity 22%
- Feasibility 28%
- Momentum 20%
- Evidence 14%
- Inverse risk 16%
- Small risk-appetite adjustment that does **not** move the objective metric bars

Go threshold: **72**. No-go threshold: **42**. Idea-only briefs cannot receive a full GO.

Hours default to **8** when omitted. Signal detection is whole-word only (`metadata` does not match `data`).

## Run locally

From the repo root:

```bash
npm start
```

Open `http://127.0.0.1:8787`. Assets and the API use relative URLs (`static/styles.css`, `api/score`), so the same tree also works under GitHub Pages at `/pulseboard-studio/`.

## Test

```bash
npm test
```

This syntax-checks the browser modules, runs Node tests (including JS/Python golden parity), and runs Python unit tests.

## API

`POST /api/score`

```json
{
  "idea": "A dashboard that tracks API health and launch blockers.",
  "goal": "Ship a client-ready demo.",
  "deadlineDays": 21,
  "hoursPerWeek": 8,
  "confidence": 4,
  "scope": "focused",
  "riskAppetite": "medium",
  "evidence": "signals"
}
```

The response includes a score, likely range, evidence grade, verdict, go/no-go decision, metrics, risks, recommendation, ranked highest-impact moves, scenario variants, a sensitivity table, an evidence ladder, flip points, a this-week plan, stop conditions, kill criteria, and timeline.

## Using the console

After an analysis, **Plan / Moves / Sensitivity / Evidence** keep the full engine output reachable without one long scroll. Click an impact move, scenario, sensitivity row, flip point, or ladder rung to apply that patched brief and re-score. **Undo** (or `Ctrl`/`Cmd`+`Z`) walks the last apply back. `1`–`4` switch tabs.

Use **Share link** to copy a URL containing the project brief. Scenario data lives after the URL `#`, so it is restored in the browser without being included in the initial HTTP request. Shared briefs auto-analyze against the live engine.

Shared briefs remain visible in the URL and may be retained in browser history. Do not include passwords, API keys, customer records, or other secrets.

Use **Set baseline** on any scored scenario to pin it. Later analyses compare against that result until the baseline is updated or score history is reset.

History snapshots from an older model version are re-scored on restore instead of showing a stale result next to engine 9.0.

## Stack

- JavaScript, HTML, and CSS for the browser app, including an on-device engine port
- Python for the scoring oracle, local server, and Vercel API route
- No runtime dependencies
- Python and JavaScript unit tests, including golden-fixture parity
- GitHub Actions CI and GitHub Pages
- Vercel-ready `api/score.py` and `vercel.json`
- Fragment-based share scenarios with allow-listed inputs and legacy-link migration
- Persistent, validated comparison baselines
- Strict JSON API handling, no-store API responses, static security headers, and query-stripped local access logs
