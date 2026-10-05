/**
 * @fileoverview Converts an email's `text/html` body into the same
 * `>`-quoted plain-text shape `emailParser()` already understands, instead
 * of writing a second, parallel conversation-history extractor.
 *
 * Why this exists: some clients only put the full conversation history in
 * the HTML alternative: the plain-text part can contain just the new
 * reply text, with the quoted history existing solely as nested
 * `<blockquote>` elements. Quote depth from `<blockquote>` nesting is also
 * unambiguous by construction, unlike counting `>` characters in text that
 * may already have irregular depth jumps.
 *
 * This module only extracts structural TEXT: it never renders raw or
 * sanitized HTML back into the extension's own UI.
 */

/** Block-level tags whose boundaries become line breaks in the output.
 * `<li>` is handled separately (it also needs a bullet/number prefix). */
const BLOCK_TAGS = new Set(["div", "p", "tr", "pre"]);

/** Inline formatting tags converted to their Markdown equivalent, so bold
 * text and emphasis survive the HTML-to-quoted-text conversion instead of
 * being silently dropped (GitLab renders the result as Markdown). Both
 * `<strong>`/`<b>` and `<em>`/`<i>` map to the same marker as each other,
 * since Markdown doesn't distinguish semantic from presentational emphasis. */
const INLINE_MARKERS = {
  strong: "**",
  b: "**",
  em: "*",
  i: "*",
};

/** Tags introducing a list, each mapped to the bullet style `<li>` should
 * use inside it. */
const LIST_TAGS = { ul: "bullet", ol: "ordered" };

/**
 * Decodes the small set of HTML entities that actually show up in mail
 * bodies. Not a general-purpose decoder, deliberately minimal.
 *
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Converts an HTML email body into plain text with `>`-prefixed quote
 * markers matching `getQuoteLevel`'s convention (`level` adjacent `>`
 * characters, then a space, then the text), derived directly from
 * `<blockquote>` nesting depth rather than any text heuristic.
 *
 * The result can be fed straight into `emailParser()`.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToQuotedText(html) {
  if (!html || typeof html !== "string") return "";

  // Never let script/style content, or non-content markup (doctype,
  // comments, CDATA, processing instructions) leak into the extracted text.
  // The tag walker below only recognises well-formed `<tag ...>` elements:
  // a bang/question-mark construct like `<!DOCTYPE html>` fails both of its
  // alternatives, so the engine drops the lone "<" and lets the rest fall
  // through as literal text content. Stripping these first avoids that.
  const cleaned = html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<![^>]*>/g, "") // <!DOCTYPE ...>, <![CDATA[ ... ]]>
    .replace(/<\?[\s\S]*?\?>/g, ""); // <?xml ... ?>

  const lines = [];
  let currentLine = "";
  let quoteDepth = 0;
  let preDepth = 0;
  // Per-<blockquote> record of whether it counted toward `quoteDepth`, so a
  // closing tag can undo exactly what its matching opener did.
  const blockquoteStack = [];
  // Some clients (observed from real BlueMail/Thunderbird forwards) render a
  // structured "Betreff:/Von:/Datum:/An:" forward header followed by the
  // forwarded message wrapped in a <blockquote>, even though it's a forward,
  // not a quoted reply. The next <blockquote> right after such a header must
  // not count as a quote level, or the forwarded body gets `>`-prefixed and
  // `emailParser` then splits header and body into two unrelated top-level
  // messages instead of recognising the forward.
  let awaitingForwardBody = false;
  // Markers of currently-open inline tags, so a mismatched/unexpected
  // closing tag can't pop the wrong one (matched by tag name, not just
  // stack order).
  const inlineStack = [];
  // Set right after an inline marker is inserted, so the immediately
  // following text's leading whitespace is trimmed, otherwise "** Text"
  // (a space right after the opening marker) doesn't parse as Markdown
  // emphasis.
  let stripLeadingSpace = false;
  // Stack of open <ul>/<ol> lists; "ordered" lists carry their own item
  // counter so numbering restarts correctly for nested/sibling lists.
  const listStack = [];

  const flushLine = (forceBlank = false) => {
    const raw = decodeEntities(currentLine);
    const prefix = quoteDepth ? ">".repeat(quoteDepth) + " " : "";

    if (preDepth > 0) {
      // Inside <pre> (e.g. a moz-signature block), a literal "\n" IS a
      // real line break, so split on it before collapsing other whitespace,
      // or the "-- " signature marker (which must be alone on its own
      // line, trailing space included, for `getSignatureIndex` to find it)
      // gets flattened/trimmed into the rest of the signature.
      for (const sub of raw.split(/\r?\n/)) {
        const collapsed = sub.replace(/[ \t]+/g, " ");
        if (collapsed === "" && !forceBlank) continue;
        // Always include the prefix, even on a blank line: inside a
        // <blockquote>, a blank paragraph is still a quoted line (e.g. "> "),
        // not a bare "": an unprefixed blank reads downstream as "outside
        // the quote" and forces a premature message boundary. See the
        // `flushLine` docstring below for the full explanation.
        lines.push(prefix + collapsed);
      }
    } else {
      // Outside <pre>, an embedded "\n" is just how the HTML source
      // happens to be pretty-printed, not intended structure, so collapse
      // it like any other whitespace, per normal HTML rendering rules.
      const collapsed = raw.replace(/\s+/g, " ").trim();
      // A structural flush with nothing buffered (e.g. entering/leaving a
      // <blockquote>, or one block tag immediately following another) isn't
      // a real line at all: only an explicit `<br>` forces one through, so
      // tag-boundary bookkeeping never fabricates phantom blank/quoted lines
      // that downstream parsing would treat as real content or a message
      // boundary.
      if (collapsed === "" && !forceBlank) {
        currentLine = "";
        return;
      }
      // Same reasoning as the <pre> branch above: a blank line still gets
      // the current quote-depth prefix, so it stays recognisable as "still
      // inside the quote" to the downstream >-line parser.
      lines.push(prefix + collapsed);
    }
    currentLine = "";
  };

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match;
  while ((match = tagRe.exec(cleaned))) {
    const [, closing, tagNameRaw, attrs, text] = match;
    if (text !== undefined) {
      currentLine += stripLeadingSpace ? text.replace(/^[ \t\r\n]+/, "") : text;
      if (stripLeadingSpace && currentLine !== "") stripLeadingSpace = false;
      continue;
    }

    const tagName = tagNameRaw.toLowerCase();

    if (!closing) {
      if (tagName === "blockquote") {
        flushLine();
        const isForwardBody = awaitingForwardBody;
        awaitingForwardBody = false;
        blockquoteStack.push(isForwardBody);
        if (!isForwardBody) quoteDepth++;
      } else if (tagName === "br") {
        flushLine(true);
      } else if (tagName in LIST_TAGS) {
        listStack.push({ type: LIST_TAGS[tagName], count: 0 });
      } else if (tagName === "li") {
        flushLine();
        const list = listStack[listStack.length - 1];
        const indent = "  ".repeat(Math.max(0, listStack.length - 1));
        if (list?.type === "ordered") {
          list.count++;
          currentLine = `${indent}${list.count}. `;
        } else {
          currentLine = `${indent}- `;
        }
      } else if (tagName in INLINE_MARKERS) {
        currentLine += INLINE_MARKERS[tagName];
        inlineStack.push(tagName);
        stripLeadingSpace = true;
      } else if (BLOCK_TAGS.has(tagName)) {
        flushLine();
        if (tagName === "pre") preDepth++;
      }
      if (tagName === "div" && /class\s*=\s*["'][^"']*forwardheader/i.test(attrs || "")) {
        awaitingForwardBody = true;
      }
    } else if (tagName === "blockquote") {
      flushLine();
      const wasForwardBody = blockquoteStack.pop();
      if (!wasForwardBody && quoteDepth > 0) quoteDepth--;
    } else if (tagName in LIST_TAGS) {
      if (listStack[listStack.length - 1]?.type === LIST_TAGS[tagName]) listStack.pop();
    } else if (tagName === "li") {
      flushLine();
    } else if (tagName in INLINE_MARKERS) {
      // Only close if this tag was actually the one opened (a mismatched/
      // unexpected closing tag in real-world mail HTML is left alone rather
      // than corrupting an unrelated marker).
      if (inlineStack[inlineStack.length - 1] === tagName) {
        inlineStack.pop();
        currentLine = currentLine.replace(/[ \t\r\n]+$/, "") + INLINE_MARKERS[tagName];
      }
    } else if (BLOCK_TAGS.has(tagName)) {
      flushLine();
      if (tagName === "pre" && preDepth > 0) preDepth--;
    }
  }
  flushLine();

  // Collapse runs of blank lines (from empty <div><br></div> spacers etc.)
  // down to one, same as `removeEmptyLines` does further down the pipeline,
  // just without discarding blank lines entirely: a lone blank line still
  // marks a real paragraph break some downstream parsing relies on.
  return lines
    .filter((line, i, arr) => !(line.trim() === "" && arr[i - 1]?.trim() === ""))
    .join("\n")
    .trim();
}
