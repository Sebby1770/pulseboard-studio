# PulseBoard Studio — Structural Upgrade Plan (v1.2)

This document is the source of truth for the v1.2 upgrade. It is written against **origin `main` at v1.1.0 / engine 9.0**, not the older local v0.9 snapshot.

## 1. What this product is

PulseBoard is a deterministic decision console: a builder pastes a project brief, the engine scores it, and the UI returns a ship / hold / kill call plus a week plan. Scoring is a heuristic (word counts, allow-listed enums, a 14-word signal set). That is a feature, not a bug — it is inspectable, testable, and has no API key.

It is not a tracker, an LLM app, or a generic dashboard.

## 2. Current architecture (v1.1)

```
Browser  ──POST /api/score──►  pulseboard.engine.analyse_project
  index.html + static/*.js         Python 3 stdlib
  core.js = persistence / memo     server.py (local :8787)
                                   api/score.py (Vercel)
```

The Python engine is the only scorer. The browser cannot produce a score without that POST. Absolute `/static/...` and `/api/score` paths assume the site is hosted at `/`. GitHub Pages is static-only and would host the app at `/pulseboard-studio/`, so **v1.1 cannot run as a GitHub Pages website**.

The result surface is a single scroll of: score, comparison, lever, moves, scenario lab, week plan, sensitivity, evidence ladder, flip points, experiment, next steps, risks, stop conditions, kill criteria, timeline, questions. The go / no-go call exists but is a line of text under the verdict.

## 3. Target architecture (v1.2)

```
                    ┌── POST /api/score ──► Python engine (local + Vercel)
Browser ──score()───┤
                    └── on-device engine.js  (GitHub Pages + API-down fallback)
                         ▲
                         │  golden fixtures
                         └── tests/engine-parity.test.js  vs  pulseboard/engine.py
```

**Python remains the oracle.** The JavaScript engine is a line-for-line port, verified by golden payloads. Share links still carry **inputs only**. Computed scores are always regenerated.

### 3.1 Runtime selection

1. `GET api/score` (relative URL from `document.baseURI`).
2. If the API answers with `modelVersion`, use Python for scoring and show `Engine 9.0 · API`.
3. If the API is missing (GitHub Pages) or times out, use `analyseProject()` from `static/engine.js` and show `Engine 9.0 · on-device`.
4. Never fail the Analyze button on Pages.

### 3.2 Path rules (Pages + local)

All asset and API URLs are **relative** (`static/styles.css`, `api/score`). From `https://Sebby1770.github.io/pulseboard-studio/` they resolve under the repo prefix. From `http://127.0.0.1:8787/` they resolve at the server root. No leading `/`.

### 3.3 Static allow-list

`server.py` may only serve `index.html`, `favicon.svg`, and files under `static/`. `.git`, `pulseboard/`, `tests/`, `api/`, and `docs/` must 404.

## 4. Product structure (what the user actually sees)

The v1.1 result is a wall. v1.2 is a **decision-first console**.

```
┌─────────────────────────────────────────────────────────────┐
│ Hero: GO | CONDITIONAL | NO-GO   score ring   engine chip   │
│ One-sentence reason + likely range + evidence grade         │
├──────────────┬──────────────────────────────────────────────┤
│ Brief        │ [Plan] [Moves] [Sensitivity] [Evidence]      │
│ + samples    │ tab body                                     │
│ + controls   │ memo / share / baseline                      │
│              ├──────────────────────────────────────────────┤
│ History      │ recent scores (compact, not full-width)      │
└──────────────┴──────────────────────────────────────────────┘
```

| Tab | Contents |
|---|---|
| Plan | Best lever, this-week plan, smallest experiment, next steps |
| Moves | Highest-impact moves, scenario lab, risks, stop conditions, kill criteria |
| Sensitivity | Sensitivity table + flip points |
| Evidence | Evidence ladder, questions, timeline |

Every row that implies a new brief is **actionable**: click applies the patched payload and re-scores.

## 5. Key decisions

| Decision | Rationale |
|---|---|
| Dual engine, Python as oracle | GitHub Pages cannot run Python. A JS port with golden tests keeps Pages honest without abandoning the existing Vercel/local API. |
| Keep engine 9.0 formula | v1.1 tests encode the current model. v1.2 is a structural and UX leap, not a rescoring. |
| Relative URLs | Required for project Pages (`/pulseboard-studio/`). |
| Tabs, not deletion | v1.0/v1.1 analysis is valuable; it must be reachable, not dumped in one scroll. |
| Click-to-apply | Scenario lab / sensitivity / flip / ladder are posters until they mutate the brief. |
| Auto-analyze share links | Recipients currently land on a filled form and must guess to click Analyze. |
| Re-score stale history | Stored results can be engine 7.0/8.0; restoring them next to engine 9.0 is a lie unless we re-run. |
| Hours default 8 everywhere | Python `_coerce_payload` currently defaults to 6; HTML/JS use 8. Silent drift. |
| No new runtime deps | Preserve the stdlib + vanilla JS contract. Fonts are system stacks. |

## 6. Workstreams

### W1 — Engine port and parity

- Add `static/engine.js` exporting `analyseProject(payload)` and `ProjectInputError`.
- Match Python: `int()` truncation for coerce, banker's `round()` for the 0–100 score, whole-word signals, evidence margins, go 72 / no-go 42, idea-only forces `CONDITIONAL`.
- Fix Python hours default to **8**.
- Tests: dump golden JSON from Python; assert JS deep-equals on the same payloads (score, metrics, goNoGo.decision, lengths of generated lists).

### W2 — Decision-first UI

- GO/CONDITIONAL/NO-GO as the visual hero (color tokens already exist: green / yellow / coral).
- Result tabs listed above.
- Sample brief chips (SaaS dashboard, API automation, learning prototype, ambitious platform).
- Sample and shared briefs auto-score.
- Keyboard: `Ctrl/Cmd+Enter` analyzes.
- Skip link, favicon, Open Graph, `theme-color`.
- Optional dark theme via `data-theme` + `prefers-color-scheme`.
- Drop `aria-live` from the whole result panel; keep it on the status chip and form error.
- `button:disabled` cursor is `not-allowed`, not `wait`, except while scoring.
- Impact-move copy no longer concatenates `action + metric lift`.

### W3 — Local server and Pages

- Relative paths in `index.html`.
- Static allow-list + same-origin CORS (or omit CORS).
- `.github/workflows/pages.yml` publishes the repo root (`index.html` + `static/`).
- CI still runs `npm test`.
- README documents the live URL, dual engine, and formula.

### W4 — Persistence

- History restore: if `entry.result.modelVersion !==` live engine, re-score.
- Share restore: auto-analyze against the live engine.
- Keep fragment shares, allow-lists, `textContent` only.

## 7. Out of scope

- LLM scoring
- Accounts, cloud history
- Changing metric weights
- Bundlers / React / npm runtime dependencies
- Pyodide

## 8. Verification

- `npm test` green (existing unittest + node:test, plus JS/Python parity).
- `python3 -m unittest` still covers go/no-go, ladder, flip, hour allocation.
- Manual: Analyze sample on local API **and** with API blocked (engine fallback).
- GitHub Pages: Analyze works with no Python host.

## 9. Version

- Application **1.2.0**
- Scoring model **9.0** (unchanged formula)
