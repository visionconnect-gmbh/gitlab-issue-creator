/**
 * @fileoverview Pure logic for the inline `@`-mention autocomplete: no DOM,
 * so it's testable the same way commands.js is.
 */

/** Characters allowed in a mention query, after the `@`. Mirrors GitLab's
 * own username charset closely enough for client-side filtering purposes. */
const QUERY_CHARS = /^[A-Za-z0-9._-]*$/;

/**
 * Finds the `@word` token (if any) the caret currently sits inside, by
 * walking back to the start of the current whitespace-delimited word and
 * checking whether it starts with `@`. Returns null when the caret isn't
 * inside a mention token, e.g. mid-word (`user@domain`, since that word
 * starts with "u", not "@"), after a space, or with a non-collapsed
 * selection isn't this function's concern (callers check that separately).
 *
 * @param {string} text
 * @param {number} caret
 * @returns {{ start: number, end: number, query: string }|null}
 */
export function findActiveMentionQuery(text, caret) {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;

  if (text[start] !== "@") return null;

  const query = text.slice(start + 1, caret);
  if (!QUERY_CHARS.test(query)) return null;

  return { start, end: caret, query };
}

/**
 * Filters `candidates` (GitLab user objects, `{ id, username, name }`) by
 * `query` against username/name, case-insensitively. Prefix matches rank
 * above substring matches, same as GitLab's own autocomplete, and the
 * result is capped at `limit` since this renders as a short dropdown, not
 * a scrollable list.
 *
 * @param {Array<{id: number|string, username: string, name?: string}>} candidates
 * @param {string} query
 * @param {number} [limit=5]
 */
export function filterMentionCandidates(candidates, query, limit = 5) {
  const q = query.toLowerCase();
  if (!q) return candidates.slice(0, limit);

  const prefix = [];
  const substring = [];

  for (const candidate of candidates) {
    const username = (candidate.username || "").toLowerCase();
    const name = (candidate.name || "").toLowerCase();

    if (username.startsWith(q) || name.startsWith(q)) {
      prefix.push(candidate);
    } else if (username.includes(q) || name.includes(q)) {
      substring.push(candidate);
    }
  }

  return [...prefix, ...substring].slice(0, limit);
}

/** Renders a candidate's label the same way across the dropdown. */
export function formatMentionLabel(candidate) {
  return candidate.name ? `${candidate.name} (@${candidate.username})` : `@${candidate.username}`;
}
