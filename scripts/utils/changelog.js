/**
 * @fileoverview Changelog handling: reads CHANGELOG.md and/or derives
 * release notes from git commits, then renders ATN-safe HTML.
 *
 * ATN sanitizes release_notes through `PurifiedTranslation`, which allows
 * only this exact tag set (verified against the add-on's own published
 * history via the ATN API):
 *
 *   a  abbr  acronym  b  blockquote  code  em  i  li  ol  strong  ul
 *
 * with attributes a[href|title|rel], abbr[title], acronym[title]. Notably
 * <p>, <br> and <h3> are NOT allowed — they get stripped/escaped by ATN,
 * which is visible in the add-on's real v7.1.1 notes (a literal "&lt;br&gt;"
 * shows up verbatim where a <br> was submitted). Every renderer here must
 * therefore only ever emit tags from that list, always balanced, and must
 * HTML-escape all text content.
 */

import { execFileSync } from "child_process";

// ---------------------------------------------------------------------------
// CHANGELOG.md section extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the body of one "## [version]" section from a Keep-a-Changelog
 * style CHANGELOG.md.
 *
 * @param {string} changelog - Full file contents.
 * @param {string} version - e.g. "7.2.0" (no leading "v").
 * @returns {string|null} The section body, trimmed, or null if not found.
 */
export function extractSection(changelog, version) {
  const header = `## [${version}]`;
  const headerIndex = changelog.indexOf(header);
  if (headerIndex === -1) return null;

  const bodyStart = changelog.indexOf("\n", headerIndex) + 1;
  const nextHeaderMatch = changelog.slice(bodyStart).match(/\n##\s+\[/);
  const bodyEnd = nextHeaderMatch
    ? bodyStart + nextHeaderMatch.index + 1
    : changelog.length;

  return changelog.slice(bodyStart, bodyEnd).trim();
}

// ---------------------------------------------------------------------------
// Commit-derived changelog (fallback when CHANGELOG.md has no section yet)
// ---------------------------------------------------------------------------

const CATEGORY_MAP = [
  { pattern: /^feat(\(.+\))?!?:/i, label: "Added" },
  { pattern: /^fix(\(.+\))?!?:/i, label: "Fixed" },
  { pattern: /^perf(\(.+\))?!?:/i, label: "Fixed" },
  { pattern: /^refactor(\(.+\))?!?:/i, label: "Changed" },
  { pattern: /^chore(\(.+\))?!?:/i, label: "Changed" },
  { pattern: /^docs(\(.+\))?!?:/i, label: "Changed" },
  { pattern: /^style(\(.+\))?!?:/i, label: "Changed" },
  { pattern: /^test(\(.+\))?!?:/i, label: "Changed" },
];

const RELEASE_SUBJECT = /^(?:Release:|chore\(release\):)\s*(?:\w+\s+version\s+)?v?(\d+\.\d+\.\d+)/i;

const stripPrefix = (s) => s.replace(/^\w+(\(.+\))?!?:\s*/, "").trim();
const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Returns commit subjects in `range` (a git revision range, e.g. "v7.1.1..HEAD").
 *
 * Uses execFileSync with an argument array (no shell) so `range` is passed
 * straight to git rather than interpolated into a shell command string.
 *
 * @param {string} range
 * @returns {string[]}
 */
export function getCommitSubjects(range) {
  const output = execFileSync("git", ["log", "--format=%s", range], { stdio: "pipe" })
    .toString()
    .trim();
  return output ? output.split("\n").filter(Boolean) : [];
}

/**
 * Groups commit subjects into Added / Changed / Fixed buckets, and
 * collects the versions named by any "Release:" / "chore(release):"
 * subjects into a separate list (these reproduce the "Release" bucket
 * seen on multi-version ATN entries, e.g. v7.1.1's notes list v7.0.0,
 * v7.1.0 and v7.1.1 together because those intermediate tags were never
 * individually published).
 *
 * @param {string[]} subjects
 * @returns {{ buckets: {Added: string[], Changed: string[], Fixed: string[]}, releaseVersions: string[] }}
 */
export function categorizeCommits(subjects) {
  const buckets = { Added: [], Changed: [], Fixed: [] };
  const releaseVersions = [];

  for (const subject of subjects) {
    const releaseMatch = subject.match(RELEASE_SUBJECT);
    if (releaseMatch) {
      releaseVersions.push(releaseMatch[1]);
      continue;
    }

    let matched = false;
    for (const { pattern, label } of CATEGORY_MAP) {
      if (pattern.test(subject)) {
        buckets[label].push(capitalise(stripPrefix(subject)));
        matched = true;
        break;
      }
    }
    if (!matched) buckets.Changed.push(capitalise(subject));
  }

  return { buckets, releaseVersions };
}

// ---------------------------------------------------------------------------
// HTML rendering (ATN-safe)
// ---------------------------------------------------------------------------

/**
 * Escapes text for safe inclusion inside ATN-sanitized HTML.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Renders a minimal, deliberately restricted Markdown subset used inside
 * a single changelog line to ATN-allowed HTML: `**bold**` -> <strong>,
 * `` `code` `` -> <code>, `[text](url)` -> <a href>. Everything else is
 * escaped. This is intentionally not a general Markdown renderer — it
 * only needs to cover what CHANGELOG.md entries actually use.
 *
 * @param {string} text
 * @returns {string}
 */
export function renderInlineMarkdown(text) {
  // Escape first, then re-introduce only the specific allowed tags so
  // markup characters inside the matched spans are never double-escaped.
  let escaped = escapeHtml(text);

  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

  return escaped;
}

/**
 * Renders Added/Changed/Fixed buckets (+ optional release versions) as
 * ATN-safe HTML, matching the format already used on the add-on's
 * existing store listing.
 *
 * @param {{Added?: string[], Changed?: string[], Fixed?: string[]}} buckets
 * @param {string[]} [releaseVersions]
 * @returns {string}
 */
export function renderAtnHtml(buckets, releaseVersions = []) {
  const sections = [];

  for (const label of ["Added", "Changed", "Fixed"]) {
    const items = buckets[label];
    if (!items || !items.length) continue;
    const lis = items.map((item) => `      <li>${renderInlineMarkdown(item)}</li>`).join("\n");
    sections.push(
      `  <li>\n    <strong>${label}</strong>\n    <ul>\n${lis}\n    </ul>\n  </li>`,
    );
  }

  if (releaseVersions.length) {
    const lis = releaseVersions
      .map((v) => `      <li>Version v${escapeHtml(v)}</li>`)
      .join("\n");
    sections.push(
      `  <li>\n    <strong>Release</strong>\n    <ul>\n${lis}\n    </ul>\n  </li>`,
    );
  }

  return `<ul>\n${sections.join("\n")}\n</ul>`;
}

/**
 * Renders a raw CHANGELOG.md section body (plain markdown bullets, with
 * optional "### Category" headings) to ATN-safe HTML.
 *
 * @param {string} sectionBody
 * @returns {string}
 */
export function renderChangelogSectionHtml(sectionBody) {
  const lines = sectionBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  let currentCategory = null;
  const categorized = {};

  for (const line of lines) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      currentCategory = heading[1].trim();
      categorized[currentCategory] = categorized[currentCategory] ?? [];
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (!bullet) continue;

    if (currentCategory) {
      categorized[currentCategory].push(bullet[1]);
    } else {
      items.push(bullet[1]);
    }
  }

  if (Object.keys(categorized).length) {
    const sections = Object.entries(categorized)
      .filter(([, entries]) => entries.length)
      .map(([label, entries]) => {
        const lis = entries.map((e) => `      <li>${renderInlineMarkdown(e)}</li>`).join("\n");
        return `  <li>\n    <strong>${escapeHtml(label)}</strong>\n    <ul>\n${lis}\n    </ul>\n  </li>`;
      });
    return `<ul>\n${sections.join("\n")}\n</ul>`;
  }

  const lis = items.map((e) => `  <li>${renderInlineMarkdown(e)}</li>`).join("\n");
  return `<ul>\n${lis}\n</ul>`;
}

/**
 * Builds the release-notes HTML for `version`, preferring an explicit
 * CHANGELOG.md section for that version and falling back to commits
 * collected since `sinceVersion` (typically the latest version already
 * published on ATN).
 *
 * @param {object} params
 * @param {string} params.version - Version being released, e.g. "7.2.0".
 * @param {string|null} params.sinceVersion - Last published version, or null.
 * @param {string|null} params.changelogContents - CHANGELOG.md contents, or null if absent.
 * @returns {string} ATN-safe HTML.
 */
export function buildReleaseNotesHtml({ version, sinceVersion, changelogContents }) {
  if (changelogContents) {
    const section = extractSection(changelogContents, version);
    if (section) return renderChangelogSectionHtml(section);
  }

  const range = sinceVersion ? `v${sinceVersion}..HEAD` : "HEAD~20..HEAD";
  const subjects = getCommitSubjects(range);
  const { buckets, releaseVersions } = categorizeCommits(subjects);
  if (!releaseVersions.includes(version)) releaseVersions.push(version);

  return renderAtnHtml(buckets, releaseVersions);
}
