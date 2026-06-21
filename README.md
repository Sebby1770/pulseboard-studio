# PulseBoard Studio

PulseBoard Studio is a small Python and JavaScript app for scoring project ideas before you commit a week to them.

The browser UI collects a project brief, calls a Python API, and renders a score, risks, and a practical next-step plan. It is designed to run locally with the Python standard library and to deploy cleanly on Vercel as static files plus a Python serverless function.

Version 0.6 adds portable scenario links, stricter restored-input normalization, and comparison context in decision memos. See [CHANGELOG.md](CHANGELOG.md) for release history.

After an analysis, use **Share link** to copy a URL containing the project brief. Opening that link restores the scenario inputs and runs no untrusted result data; the recipient can analyze it against the current Python scoring model.

Shared briefs appear in the URL and may be retained in browser history or server logs. Do not include passwords, API keys, customer records, or other secrets.

## Stack

- JavaScript, HTML, and CSS for the browser app
- Python for the scoring engine, local server, and Vercel API route
- No runtime dependencies
- Python and JavaScript unit tests
- GitHub Actions CI
- Vercel-ready `api/score.py` and `vercel.json`
- Shareable, URL-encoded scenarios with allow-listed inputs

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
