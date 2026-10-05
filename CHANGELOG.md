# Changelog

All notable changes to this project are documented here, in the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style.

`scripts/bump-version.js` moves the `[Unreleased]` section into a dated
`[x.y.z]` section on release. `scripts/publish.js` renders that section to
the ATN-safe HTML pasted into the add-on's release notes: see the allowed
tag list documented in `scripts/utils/changelog.js`.

Versions below v5.3.0 predate this file and are not recorded here; the
v5.3.0–v7.1.1 entries are backfilled verbatim from the existing
[addons.thunderbird.net listing history](https://addons.thunderbird.net/thunderbird/addon/gitlab-issue-creator/versions/).

## [Unreleased]

### Added

- The description editor can now mention GitLab users inline: typing `@`
  opens a caret-anchored autocomplete filtered against the selected
  project's members (the same list already loaded for the assignee
  select), navigable with the arrow keys/Enter/Escape; an "@" toolbar
  button inserts the trigger for discoverability
- Issues can now be created with GitLab labels: a "Labels" button next to
  "Attachments" opens a searchable multiselect of the selected project's
  labels (fetched, cached, and revalidated the same way assignees already
  are), and the chosen labels are applied to the issue on creation
- Email attachments can now be placed anywhere in the description instead
  of always landing in a fixed block at the end: checking one still adds it
  at the end by default, but it can then be dragged from the picker to any
  position in the text, including moving an already-placed one elsewhere
- The attachment picker gained a search field to filter a long attachment
  list by name
- Email parsing now recognizes Portuguese, Italian, Dutch, Polish, and
  Russian in addition to French, Spanish, German, and English;
  forward-trigger phrases, header labels, attribution verbs, connectors,
  and valediction closings for every supported language are centralized in
  the new `src/email/locales/emailLocales.js`
- Project search now also queries GitLab itself (not just the locally
  cached project list), so a project can be found by typing its name even
  if it isn't among the most recently active ones
- The project last used for a created issue is now remembered (most recent
  10), so it stays available even if it falls out of the cached list of
  most-recently-active projects
- The description editor's image button now uploads a local image file
  directly (native file picker) instead of only linking to an
  already-hosted URL. It is inserted as a placeholder immediately if no
  project is selected yet, then uploaded to GitLab and swapped in
  automatically once one is, sharing the same upload pipeline as email
  attachments
- Email attachments now upload to GitLab as soon as they're checked in the
  attachment selector, instead of waiting until issue creation
- Removing an image from the description, unchecking an attachment, or
  switching the selected project now deletes the corresponding
  already-uploaded file from the GitLab instance instead of leaving it
  orphaned (best-effort: requires GitLab 17.2+ and the Maintainer/Owner
  role to delete, so a lower-privileged token may leave orphans with a
  one-time notification)
- Replaced the project search field's native `<datalist>` with an
  accessible combobox (arrow-key navigation, Enter to select, Escape to
  close/clear) and a visible "selected project" indicator, fixing a bug
  where the assignee list would flicker and refetch on every keystroke

### Changed

- The attachment picker and the new label picker now share one modal
  component, rather than each needing its own backdrop/list/search
  implementation
- Email attachments now follow the same upload/placeholder/delete
  lifecycle as locally-picked images internally, which is what makes
  dragging one to a specific position in the description possible
- GitLab project and assignee data now renders from cache immediately when
  the popup opens and revalidates in the background using HTTP conditional
  requests (`ETag`/`If-None-Match`), instead of waiting on a network
  request on every open: a self-hosted instance with 1,100+ projects
  previously had to fetch every page of its project list (12 requests,
  ~1.3 MB) before the popup became usable; it now fetches only the 100
  most-recently-active projects, with the rest reachable via search
- GitLab requests now time out (15s) and retry transient failures
  (429/5xx/network errors) with backoff, honoring the `Retry-After` header
- A background project/assignee refresh no longer resets the project
  search field's typed term, its filtered suggestions, or the currently
  selected project
- The background script now keeps already-fetched projects and assignees
  in memory for as long as Thunderbird is open, instead of discarding them
  every time the popup closes and re-fetching on the next open
- Date/author parsing now handles year-first numeric dates and
  Spanish/Portuguese "de"-grammar textual dates correctly, as part of
  centralizing locale handling for email parsing
- Replaced the EasyMDE (CodeMirror 5) description editor with an in-house
  Markdown toolbar built on a plain `<textarea>`, with the same toolbar layout,
  `Ctrl+B`/`Ctrl+I`/`Ctrl+K` shortcuts, and a Markdown preview, but ~340 KB
  smaller, themed for dark mode, and with working toolbar icons (the old
  ones silently failed to render, because EasyMDE referenced a Font Awesome icon
  font the add-on never shipped)
- Editor toolbar icons (link, image, preview, fullscreen, quote, lists) are
  inline SVG instead of emoji, for consistent rendering across platforms
- Removed the Rollup build step; the add-on now ships its hand-written ES
  modules directly, with no bundling or minification
- The plain-text vs. HTML parse selection now prefers whichever recovered
  more *usable* conversation entries, not just more raw entries

### Fixed

- Fixed project member lists silently truncating at 20 members for any
  project with more; assignee loading now follows GitLab's pagination
- Fixed dates like "01.10.2026" being misread as January 10 instead of
  October 1, and surname particles (e.g. "van", "de") being dropped from
  names extracted from email headers
- Fixed a GitLab session timeout (401 response) discarding an in-progress
  issue title/description by closing the popup outright: the popup now
  stays open and shows the Options page instead
- Fixed a failed assignee load being cached as "no assignees found",
  masking a transient GitLab error as a project that genuinely has no
  members
- Fixed a notification-click listener being registered again for every
  issue created in a session instead of once
- Fixed a duplicate settings read on popup startup, and the current-user
  lookup unnecessarily blocking the project list from loading
- Fixed email parsing fragmenting a nested-forward HTML email into dozens
  of empty/duplicate conversation entries: a blank line inside a quoted
  HTML paragraph lost its quote-depth marker, forcing a premature message
  boundary at every paragraph break
- Fixed a compact `Am ... schrieb ...:` attribution line hard-wrapped
  across two physical lines (some mail clients do this) being invisible to
  the parser, leaking the nested message into its parent and leaving it
  unattributed
- Fixed a stray `!DOCTYPE html>`/HTML comment leaking into the parsed
  message text when the source HTML began with a doctype declaration
- Fixed German/English valediction closings ("Mit freundlichen Grüßen",
  "Beste Grüße", ...) never being recognized as a signature, leaving the
  sender's closing and company-footer block attached to every quoted
  message at every nesting depth
- Fixed a forward chain represented as nested content within one quote
  level (e.g. Apple Mail forwarding a forward) only rendering one level
  deep: the deepest message's content was silently dropped, and its
  innermost header incorrectly shadowing the next, genuinely separate
  quoted message's own attribution
- Fixed textual header dates ("25. September 2026 um 15:37:51 MESZ",
  "Dienstag, 22. September 2026 16:22") displaying raw/unparsed or losing
  their time entirely instead of reformatting to the same `DD.MM.YYYY,
  HH:MM` style used for every other date, including German month names
  ("Dezember", "Januar", ...) the platform `Date` parser doesn't understand
  on its own
- Fixed paragraph breaks (blank lines) being deleted entirely instead of
  collapsed to one, destroying paragraph structure in every parsed message
- Fixed `transformToMarkdown` inserting `<br>` inside fenced code blocks,
  tables, and list items in the generated issue description
- Fixed the description editor's live preview silently merging consecutive
  lines into one instead of matching the line breaks GitLab will actually
  render in the created issue
- Fixed the editor's link-URL prompt being permanently visible with a
  non-functional Cancel button
- Fixed the editor's Preview toggle adding a second panel instead of
  replacing the textarea
- Fixed the description textarea scrolling internally instead of growing
  the popup window: the whole popup now scrolls as one
- Fixed `npm run build:dev` silently doing nothing (the locale-merge
  script's entry point was never invoked when run directly)
- Fixed `_locales/*/json` source files leaking into the built package on
  Windows (`shouldExclude` compared against OS-native path separators)

### Removed

- Side-by-side preview mode and the CodeMirror-only keyboard shortcuts that
  had no corresponding toolbar button (`Ctrl+E`, `Ctrl+Alt+C`, `F9`, `F11`,
  `Ctrl+P`)

## [7.1.3] - 2026-09-30

- Internal updates and minor improvements.

## [7.1.2] - 2026-09-29

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
