/**
 * @fileoverview A deliberately small Markdown-subset parser for the preview
 * pane only. It is NOT a CommonMark implementation and will diverge from
 * GitLab's renderer on edge cases: that trade-off is intentional. If the
 * preview ever needs to match GitLab exactly, drop the preview rather than
 * grow this parser.
 *
 * Supports: headings, paragraphs, blockquotes, bulleted/numbered lists,
 * fenced code blocks, bold, italic, inline code, links, images.
 * Everything else (tables, raw HTML, footnotes, ...) renders as plain text.
 *
 * No DOM: produces a plain Block[] tree that `preview.js` renders.
 */

const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE_LINE = /^>\s?/;
const UL_LINE = /^[-*]\s+/;
const OL_LINE = /^\d+\.\s+/;
const FENCE_OPEN = /^```(\w*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
// The one HTML tag this parser recognizes, since it's the one the app's own
// transformToMarkdown() emits (for forced line breaks), not a general HTML
// allowlist. Every other "<...>" stays literal text (see the test for
// "<script>" staying literal).
const BR_TAG = /^<br\s*\/?>/i;

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * @param {string} markdown
 * @returns {Array<object>} Block[]
 */
export function parseMarkdown(markdown) {
  const lines = normalizeNewlines(markdown ?? "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = line.match(FENCE_OPEN);
    if (fence) {
      i++;
      const codeLines = [];
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence, or just stop if the input ended first
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        inline: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (QUOTE_LINE.test(line)) {
      const quoteLines = [];
      while (i < lines.length && QUOTE_LINE.test(lines[i])) {
        quoteLines.push(lines[i].replace(QUOTE_LINE, ""));
        i++;
      }
      blocks.push({ type: "quote", inline: parseInline(quoteLines.join(" ")) });
      continue;
    }

    if (UL_LINE.test(line)) {
      const items = [];
      while (i < lines.length && UL_LINE.test(lines[i])) {
        items.push(parseInline(lines[i].replace(UL_LINE, "")));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (OL_LINE.test(line)) {
      const items = [];
      while (i < lines.length && OL_LINE.test(lines[i])) {
        items.push(parseInline(lines[i].replace(OL_LINE, "")));
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !QUOTE_LINE.test(lines[i]) &&
      !UL_LINE.test(lines[i]) &&
      !OL_LINE.test(lines[i]) &&
      !FENCE_OPEN.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", inline: parseInline(paraLines.join(" ")) });
  }

  return blocks;
}

/**
 * Parses a single line/run of text into inline nodes: text, bold, italic,
 * code, link, image. Unterminated markers (no matching closing marker) are
 * left as literal text rather than silently consumed.
 *
 * @param {string} str
 * @returns {Array<object>}
 */
function parseInline(str) {
  const nodes = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf) {
      nodes.push({ type: "text", value: buf });
      buf = "";
    }
  };

  while (i < str.length) {
    const ch = str[i];

    if (ch === "<") {
      const brMatch = BR_TAG.exec(str.slice(i));
      if (brMatch) {
        flush();
        nodes.push({ type: "break" });
        i += brMatch[0].length;
        continue;
      }
    }

    if (ch === "`") {
      const end = str.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        nodes.push({ type: "code", value: str.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "!" && str[i + 1] === "[") {
      const m = matchLinkLike(str, i + 1);
      if (m) {
        flush();
        const href = isSafeUrl(m.url) ? m.url : null;
        nodes.push({ type: "image", alt: m.label, href });
        i = m.end;
        continue;
      }
    }

    if (ch === "[") {
      const m = matchLinkLike(str, i);
      if (m) {
        flush();
        const href = isSafeUrl(m.url) ? m.url : null;
        nodes.push({ type: "link", href, children: parseInline(m.label) });
        i = m.end;
        continue;
      }
    }

    if (str.startsWith("**", i) || str.startsWith("__", i)) {
      const marker = str.slice(i, i + 2);
      const end = str.indexOf(marker, i + 2);
      if (end !== -1) {
        flush();
        nodes.push({ type: "bold", children: parseInline(str.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" || ch === "_") {
      const end = str.indexOf(ch, i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        nodes.push({ type: "italic", children: parseInline(str.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return nodes;
}

/**
 * `str[start]` must be `[`. Matches `[label](url)` starting there.
 * @returns {{ label: string, url: string, end: number } | null}
 */
function matchLinkLike(str, start) {
  const closeBracket = str.indexOf("]", start);
  if (closeBracket === -1 || str[closeBracket + 1] !== "(") return null;
  const closeParen = str.indexOf(")", closeBracket + 2);
  if (closeParen === -1) return null;
  return {
    label: str.slice(start + 1, closeBracket),
    url: str.slice(closeBracket + 2, closeParen),
    end: closeParen + 1,
  };
}

/**
 * URL scheme allowlist for rendered links/images. Anything else (notably
 * `javascript:` and `data:`) is rejected and the renderer falls back to
 * plain text instead of an anchor/image.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  if (!url) return false;
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return true;
  if (trimmed.startsWith("/")) return true; // GitLab-relative, e.g. /uploads/...
  return false;
}
