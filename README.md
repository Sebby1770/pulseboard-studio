# PulseBoard Studio

PulseBoard Studio is a small Python and JavaScript app for scoring project ideas before you commit a week to them.

The browser UI collects a project brief, calls a Python API, and renders a score, risks, and a practical next-step plan. It is designed to run locally with the Python standard library and to deploy cleanly on Vercel as static files plus a Python serverless function.

Version 0.7 adds private-by-default fragment links and pinned comparison baselines for deliberate what-if analysis. See [CHANGELOG.md](CHANGELOG.md) for release history.

After an analysis, use **Share link** to copy a URL containing the project brief. Scenario data lives after the URL `#`, so it is restored in the browser without being included in the initial HTTP request. The recipient can then analyze it against the current Python scoring model.

Shared briefs remain visible in the URL and may be retained in browser history. Do not include passwords, API keys, customer records, or other secrets.

Use **Set baseline** on any scored scenario to pin it. Later analyses compare against that result until the baseline is updated or score history is reset; exported memos identify when a pinned baseline was used.

## Stack

- JavaScript, HTML, and CSS for the browser app
- Python for the scoring engine, local server, and Vercel API route
- No runtime dependencies
- Python and JavaScript unit tests
- GitHub Actions CI
- Vercel-ready `api/score.py` and `vercel.json`
- Fragment-based share scenarios with allow-listed inputs and legacy-link migration
- Persistent, validated comparison baselines

## Run Locally

```bash
npm start
```

Open `http://127.0.0.1:8787`.

## Test

```bash
npm test
```

This runs a JavaScript syntax check and Python unit tests.

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

The response includes a score, likely range, evidence grade, verdict, metrics, risks, recommendation, and timeline.
