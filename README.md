# PulseBoard Studio

PulseBoard Studio is a deterministic decision console: paste a project brief, get a ship / hold / kill call, then click the move that changes the score.

Live site: [https://Sebby1770.github.io/pulseboard-studio/](https://Sebby1770.github.io/pulseboard-studio/)

![PulseBoard decision field](static/assets/decision-field.png)

It is inspectable on purpose. Scoring is a heuristic (word counts, allow-listed enums, a 14-word signal set). There is no API key and no model call.

Version 2.0 adds a six-brief board, signal mutes, score assumptions, and a local journal. Engine 9.1 keeps the 9.0 numbers when `mutedSignals` is omitted. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Dual engine

- Locally (`python3 server.py` or `npm start` on port 8787) the browser POSTs `api/score` and Python scores the brief.
- On GitHub Pages, or if the API is down, `static/engine.js` scores the same payload on-device.
- Share links still carry **inputs only**. Computed scores are always regenerated.

The status chip reports `Engine 9.1 · API` or `Engine 9.1 · on-device`. Both are valid modes.

`POST api/slate` ranks up to six briefs when the chip says API. Otherwise the browser calls `analyseSlate`. If that POST fails, the board falls back on-device the same way a single brief does.

## Formula (engine 9.1)

Weighted score, then Python 3 banker's round to 0–100:

- Clarity 22%
- Feasibility 28%
- Momentum 20%
- Evidence 14%
- Inverse risk 16%
- Small risk-appetite adjustment that does **not** move the objective metric bars

Go threshold: **72**. No-go threshold: **42**. Idea-only briefs cannot receive a full GO.

Hours default to **8** when omitted. Signal detection is whole-word only (`metadata` does not match `data`).

**Parity rule:** omit `mutedSignals`, or send `[]`, and the numeric score, metrics, verdict, and go/no-go decision match engine 9.0 for that brief. Weights and thresholds did not change.

`mutedSignals` is an optional array of those 14 words. Unknown tokens are ignored. A string or any non-array is treated as `[]`. Matching hits are removed before scoring and listed on `assumptions` with direction `muted`. Detected signals stay direction `up`. Other assumption rows (confidence, hours, deadline, scope, evidence, risk appetite) appear only when the input differs from the neutral baseline: confidence 3, hours 8, deadline 21, scope focused, evidence idea, risk medium.

## Slate

`POST /api/slate` with `{ "hoursPerWeek": 8, "briefs": [ ...1 to 6 briefs... ] }`.

The pool defaults to 8 and is clamped to 1–60. Briefs are scored with the same engine, sorted by score (ties keep the original order), then labeled:

- Each `GO` gets one hour while the pool lasts. A `GO` that gets nothing becomes `park`. Leftover hours go to the highest brief that is still `do`.
- If nothing is a `GO`, the highest `CONDITIONAL` becomes `do` and takes the whole pool. The others stay `park`.
- A board of only `NO-GO` briefs assigns 0 hours.

`items` is that ranked order. `rank` starts at 1. `totalAssigned` is the sum of assigned hours.

On Vercel, `api/score.py` is the only function. A JSON body with a `briefs` array and no top-level `idea` is scored as a slate. A request path that contains `slate` is also a slate. The score body limit stays 16384 bytes. The slate body limit is 65536.

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

Optional field: `"mutedSignals": ["api", "ship"]`.

The response includes a score, likely range, evidence grade, verdict, go/no-go decision, assumptions, metrics, risks, recommendation, ranked highest-impact moves, scenario variants, a sensitivity table, an evidence ladder, flip points, a this-week plan, stop conditions, kill criteria, and timeline.

`GET /api/slate` returns `{ "name", "status", "modelVersion", "route": "slate" }`. `POST /api/slate` returns the allocation described above.

## Using the console

After an analysis, **Plan / Moves / Sensitivity / Evidence** keep the full engine output reachable without one long scroll. Click an impact move, scenario, sensitivity row, flip point, or ladder rung to apply that patched brief and re-score. **Undo** (or `Ctrl`/`Cmd`+`Z`) walks the last apply back. `1`–`4` switch tabs.

Use **Share link** to copy a URL containing the project brief. Scenario data lives after the URL `#`, so it is restored in the browser without being included in the initial HTTP request. Shared briefs auto-analyze against the live engine. `mutedSignals` may be a comma list or a JSON array of known signal words. Unknown words are ignored. Older links still open.

Shared briefs remain visible in the URL and may be retained in browser history. Do not include passwords, API keys, customer records, or other secrets.

Assumption chips under the score ring show what moved the number. A signal chip toggles that word into `mutedSignals` and re-scores. Muted chips use `aria-pressed`. Undo restores the previous mutes.

**Brief / Board** in the top bar switches modes without dropping the other view. Board holds up to six cards. **Load sample slate** fills the SaaS dashboard, the learning prototype, and the ambitious platform. **Score slate** calls `api/slate` when the status chip says API, and `analyseSlate` on device otherwise. Results group into Do, Park, and Kill. **Open** loads that brief back into the single-brief console.

**Mark shipped / Mark held / Mark killed** append a local journal entry at `pulseboard.journal.v1` (40 entries max). The calibration line re-scores those briefs with the live engine and reads like `2 of 3 GO calls were later shipped`. The journal is not sent to the server.

Print hides the form chrome and keeps the call, the reason, the three moves, and the kill criteria. The Markdown memo still exports, and it adds a slate rank line when the open brief was on the last slate.

Use **Set baseline** on any scored scenario to pin it. Later analyses compare against that result until the baseline is updated or score history is reset.

History snapshots from an older model version are re-scored on restore instead of showing a stale result next to engine 9.1.

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
