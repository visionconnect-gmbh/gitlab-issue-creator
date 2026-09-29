# Changelog

All notable changes to this project are documented here, in the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style.

`scripts/bump-version.js` moves the `[Unreleased]` section into a dated
`[x.y.z]` section on release. `scripts/publish.js` renders that section to
the ATN-safe HTML pasted into the add-on's release notes — see the allowed
tag list documented in `scripts/utils/changelog.js`.

Versions below v5.3.0 predate this file and are not recorded here; the
v5.3.0–v7.1.1 entries are backfilled verbatim from the existing
[addons.thunderbird.net listing history](https://addons.thunderbird.net/thunderbird/addon/gitlab-issue-creator/versions/).

## [Unreleased]

### Added
- Nested-quote and attribution-line handling in email parsing

### Changed
- Replaced `getCache` with `getSetting` for watermark configuration

## [7.1.1] - 2026-05-19

### Added
- Assignee loading settings integration with improved error handling in message processing
- Prefix-based caching mechanism with new utility functions
- Jest configuration and comprehensive unit tests for email handling and GitLab integration
- Automated changelog generation in the publish script with improved error handling

### Changed
- Replaced `getCache` with `getSetting` for watermark configuration
- Updated documentation: terminology changed from "Ticket" to "Issue" for GitLab consistency
- Enhanced settings descriptions, added localization notes and message flow details

### Release
- Patch version v7.1.1
- Minor version v7.1.0
- Major version v7.0.0

## [6.2.4] - 2026-03-04

### Added
- Reset functionality for the add-on
- Updated UI elements and improved localization
- Comprehensive JSDoc comments for better code documentation and maintainability

### Changed
- Refactored cache handling to use persistent settings for toggles and GitLab options

### Fixed
- General stability improvements included in patch releases v6.2.3 and v6.2.4

## [6.2.2] - 2025-10-09

### Added
- Always allowing setting of GitLab settings, even with cache disabled

### Fixed
- Popup now requests project data first and displays it asynchronously once fetched, preventing delays when projects are not yet cached
- Removed usage of wrong old `CREATE_GITLAB_ISSUE` key to correct one
- Added missing imports in some files

## [6.2.0] - 2025-09-26

### Added
- New error messages for popup handling (EN/DE)
- `removeForwardedMessage` for cleaner email parsing

### Changed
- Refined assignee loading and popup initialization
- Updated build packaging and bumped rollup to 4.52.2

### Fixed
- Improved forwarded message detection in email parser
- More reliable popup validation

## [6.0.1] - 2025-09-15

### Fixed
- Corrected cache key for assignee loading to use the proper key

## [6.0.0] - 2025-09-15

### Changed
- Refactored caching mechanism: replaced `localStorage` with `browser.storage.local` for improved reliability
- Updated project structure and utility functions for better maintainability
- Refactored build versioning process: removed deprecated scripts, updated `.gitignore`, and added JWT-based publishing
- Refined build scripts to exclude additional patterns and enhance file management
- Adjusted toggle visibility position and improved code formatting for readability
- Updated installation instructions in README files for clarity

### Added
- New watermark feature for easier filtering and identification of issues
- Watermark option in settings, including localization entries and updated options UI
- Cache management options in settings, including new localization keys for alerts and labels
- New `.gitlab-ci.yml` for deployment testing

### Fixed
- Corrected path to `Enums` in `background.js`

> **Important:** Due to the cache refactor, your saved GitLab settings (URL and personal access token) need to be re-entered after updating!

## [5.4.0] - 2025-08-14

_No release notes recorded on ATN for this version._

## [5.3.1] - 2025-07-28

_No release notes recorded on ATN for this version._

## [5.3.0] - 2025-07-26

_No release notes recorded on ATN for this version._
