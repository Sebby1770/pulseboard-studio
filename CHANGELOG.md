# Changelog

All notable changes to PulseBoard Studio are documented here.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning.

## [0.5.0] - 2026-06-20

### Added

- Evidence-based score ranges with wider uncertainty for idea-only projects and tighter ranges for observed-user evidence.
- Automatic scenario comparison after repeat analyses, including overall and per-metric deltas.
- Risk-aware comparison semantics where lower risk is correctly shown as an improvement.
- Likely score ranges in copied and downloaded decision memos.

### Changed

- Updated the scoring API model version to `5.0` and the application to `0.5.0`.
- History restoration now compares the selected snapshot with another recent scored scenario when available.

### Fixed

- Stored results from earlier releases receive compatible uncertainty ranges based on their evidence metric.
- Resetting score history now clears any stale scenario comparison from the current view.

### Security

- Scenario comparison only processes finite numeric metrics from validated stored results.

## [0.4.0] - 2026-06-20

### Added

- Validation evidence input with idea-only, external-signal, and observed-user levels.
- Evidence as a first-class score metric and best-lever recommendation target.
- Score-confidence labels explaining whether a result is early, directional, or evidence-backed.
- Evidence context in downloadable and copyable decision memos.

### Changed

- Capped word-count contributions so verbose descriptions cannot keep inflating clarity.
- Risk tolerance now adjusts decision fit slightly without changing objective feasibility or risk metrics.
- Positive metrics use teal bars, evidence uses amber, and risk uses coral for clearer semantics.
- Updated the scoring model to `4.0` and the application to `0.4.0`.

### Fixed

- Removed the previous behavior where choosing a bold risk appetite made the project appear objectively safer.
- Older drafts and history snapshots now receive a safe `idea` evidence default when restored.
- Stored v0.3 results gain compatible evidence metrics and score-confidence labels.

### Security

- Evidence values are allow-listed in both Python request handling and browser persistence parsing.

## [0.3.0] - 2026-06-19

### Added

- A tailored best-lever recommendation that explains the most useful way to improve each score.
- Automatic local draft saving and recovery for unfinished project briefs.
- Node unit tests for history migration, draft parsing, score deltas, formatting, and Markdown exports.
- Explicit accessible form errors and draft-save status announcements.
- Scoring model version metadata in API responses.

### Changed

- Decision memos now include the best lever and the complete execution timeline.
- Risk metrics now state that lower values are better.
- Browser JavaScript now uses a shared ES module so pure behavior can be tested without a DOM.
- Updated the application version to `0.3.0`.

### Fixed

- Older v1 history entries now migrate into the current history store instead of disappearing.
- Stored v0.2 results receive compatible recommendation defaults when restored.
- Download URLs are revoked after the browser begins the file transfer instead of immediately.

### Security

- Malformed local draft and history data is rejected before it reaches the UI.
- Empty history states now use DOM text APIs instead of HTML injection.

## [0.2.0] - 2026-06-19

### Added

- Smallest useful experiment guidance with build, test, and success criteria.
- Assumption questions tailored to project scope and detected technical signals.
- Copyable and downloadable Markdown decision memos.
- Full timeline rendering in the browser instead of leaving API data unused.
- Complete history snapshots that restore the original brief and scored result.
- Score deltas between recent analyses.
- Visible confidence value and detected project-signal chips.
- GitHub release notes and an in-app link to the changelog.

### Changed

- Improved summary grammar and made first-release goals easier to scan.
- Tightened signal detection to whole words to avoid false positives such as matching `data` inside `metadata`.
- Expanded responsive layouts for the new experiment, timeline, and memo controls.
- Updated the application version to `0.2.0`.

### Security

- Kept history rendering on DOM `textContent` to prevent stored markup injection.
- Added `object-src 'none'` to the Content Security Policy.
- Continued enforcing the 16 KB API request-body limit and dependency-free runtime.

## [0.1.0] - 2026-06-16

### Added

- Initial Python scoring engine and standard-library development server.
- JavaScript project brief form, scorecard, risks, next steps, and local history.
- Vercel Python serverless function and static deployment configuration.
- Unit tests and GitHub Actions CI.

[0.5.0]: https://github.com/Sebby1770/pulseboard-studio/releases/tag/v0.5.0
[0.4.0]: https://github.com/Sebby1770/pulseboard-studio/releases/tag/v0.4.0
[0.3.0]: https://github.com/Sebby1770/pulseboard-studio/releases/tag/v0.3.0
[0.2.0]: https://github.com/Sebby1770/pulseboard-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sebby1770/pulseboard-studio/commits/51a84c8
