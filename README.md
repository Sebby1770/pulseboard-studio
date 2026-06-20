# PulseBoard Studio

PulseBoard Studio is a small Python and JavaScript app for scoring project ideas before you commit a week to them.

The browser UI collects a project brief, calls a Python API, and renders a score, risks, and a practical next-step plan. It is designed to run locally with the Python standard library and to deploy cleanly on Vercel as static files plus a Python serverless function.

Version 0.4 adds evidence-aware scoring, score-confidence labels, corrected risk semantics, and capped wording-based clarity gains. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Stack

- JavaScript, HTML, and CSS for the browser app
- Python for the scoring engine, local server, and Vercel API route
- No runtime dependencies
- Python and JavaScript unit tests
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
  "riskAppetite": "medium",
  "evidence": "signals"
}
```

The response includes a score, evidence grade, verdict, metrics, risks, recommendation, and timeline.
