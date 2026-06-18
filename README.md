# PulseBoard Studio

PulseBoard Studio is a small Python and JavaScript app for scoring project ideas before you commit a week to them.

The browser UI collects a project brief, calls a Python API, and renders a score, risks, and a practical next-step plan. It is designed to run locally with the Python standard library and to deploy cleanly on Vercel as static files plus a Python serverless function.

Version 0.2 adds smallest-experiment guidance, decision-memo exports, complete history snapshots, score comparisons, assumption questions, and a visible execution timeline. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Stack

- JavaScript, HTML, and CSS for the browser app
- Python for the scoring engine, local server, and Vercel API route
- No runtime dependencies
- GitHub Actions CI
- Vercel-ready `api/score.py` and `vercel.json`

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
  "riskAppetite": "medium"
}
```

The response includes a score, verdict, metrics, risks, and timeline.
