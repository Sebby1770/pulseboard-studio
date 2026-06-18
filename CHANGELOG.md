# Changelog

All notable changes to PulseBoard Studio are documented here.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning.

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

[0.2.0]: https://github.com/Sebby1770/pulseboard-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sebby1770/pulseboard-studio/commits/51a84c8
