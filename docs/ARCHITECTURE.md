# PulseBoard Studio 2.0

PulseBoard is a deterministic decision console. Paste a brief and get a ship / hold / kill call, or rank up to six briefs against one weekly hour pool. Scoring is a heuristic: word counts, allow-listed enums, and a 14-word signal set. There is no model API and no account.

## Runtime

```
Browser ── score ──► POST api/score ──► analyse_project
         └─ slate ──► POST api/slate ──► analyse_slate
         └─ fallback ─► static/engine.js (same two functions)
```

Python is the oracle. `static/engine.js` is the on-device port. `npm test` checks golden parity for score, verdict, metrics, go/no-go, signals, and list lengths. It does not require `modelVersion` to match older fixtures. Share links carry inputs only.

Relative URLs (`api/score`, `static/styles.css`) work on `127.0.0.1:8787` and GitHub Pages. `server.py` serves only `index.html`, `favicon.svg`, and `static/**`.

The status chip reads `Engine 9.1 · API` or `Engine 9.1 · on-device`.

## Engine 9.1

`MODEL_VERSION` is `"9.1"`. Weights are unchanged: clarity 0.22, feasibility 0.28, momentum 0.20, evidence 0.14, inverse risk 0.16. Go is 72. No-go is 42. Idea-only briefs cannot be a full GO.

**Parity rule:** if `mutedSignals` is omitted or `[]`, the numeric score, metrics, verdict, and go/no-go decision match engine 9.0 for that brief.

`mutedSignals` is an array of signal words. Unknown tokens are ignored. A string or any non-array is treated as `[]`. Matching hits are removed before the clarity and momentum signal counts.

`assumptions` lists real contributors in a stable order:

1. `idea_words` when the idea has words (clarity, up)
2. `goal_words` when the goal has words (clarity, up)
3. each detected signal (`signal_<word>`, clarity, up, source is the word)
4. each muted word that would have matched (direction `muted`)
5. confidence, hours, deadline, scope, evidence, and risk appetite, only when they differ from the neutral baseline

The baseline is confidence 3, hours 8, deadline 21, scope focused, evidence idea, risk medium. Equal rows are omitted. Direction is `up` or `down` when that input helps or hurts the final score versus the baseline. Signal rows are always included.

## Slate

`analyse_slate({ hoursPerWeek, briefs })` accepts 1 to 6 briefs. The pool defaults to 8 and is clamped to 1..60. Empty or oversized boards raise `ProjectInputError`.

1. Score each brief with `analyse_project` (per-brief mutes apply).
2. Sort by score descending, then original index ascending.
3. `GO` starts as do, `CONDITIONAL` as park, `NO-GO` as kill at 0 hours.
4. If any GO exists, give one hour to each GO while the pool lasts. A GO that receives nothing becomes park. Leftover hours go to the highest brief that is still do.
5. If there is no GO but there is a conditional, the highest conditional becomes do and takes the whole pool.
6. If every brief is NO-GO, `totalAssigned` is 0.

`items` is that ranked order. `rank` is 1-based. Each item echoes the coerced brief plus the full score result.

## API

| Route | Body limit | Behavior |
|---|---|---|
| `GET /api/score` | — | `{ name, status, modelVersion }` |
| `POST /api/score` | 16384 | one brief |
| `GET /api/slate` | — | `{ name, status, modelVersion, route: "slate" }` |
| `POST /api/slate` | 65536 | a slate |

Vercel ships one function, `api/score.py`. It scores a slate when the path contains `slate`, or when the JSON object has a `briefs` array and no top-level `idea`. Otherwise it scores one brief.

## Browser

Brief mode is the single-brief console: samples, Plan / Moves / Sensitivity / Evidence, click-to-apply, undo, share hash, and local history. Assumption chips under the score ring toggle `mutedSignals` and re-score. Undo stores those mutes. The share fragment allow-lists `mutedSignals` as a comma list or a JSON array of known words. Unknown words are dropped. Old links still open.

Board mode edits up to six cards. **Load sample slate** fills the SaaS dashboard, the learning prototype, and the ambitious platform. **Score slate** uses `/api/slate` when the chip says API and `analyseSlate` otherwise, with the same failure fallback as a single score. Results group into Do, Park, and Kill. **Open** loads that brief into Brief mode and leaves the slate in memory. User text is set with `textContent`.

The journal key is `pulseboard.journal.v1`. A scored brief can be marked shipped, held, or killed. Each entry stores the coerced inputs, `mutedSignals`, the mark, and `savedAt`. The list is capped at 40. The calibration line re-scores every entry with the live engine and reports how many current GO calls were later shipped. Nothing in the journal is uploaded.

Print hides the form chrome and keeps the call, the reason, the three moves, and the kill criteria. The Markdown memo adds `**Slate rank:** #N · do|park|kill · Nh` when the open brief's idea and goal match the last slate.

## Out of scope

LLM scoring, accounts, weight changes, and new runtime dependencies.
