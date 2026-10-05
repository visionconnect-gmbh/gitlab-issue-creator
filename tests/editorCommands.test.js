import {
  toggleWrap,
  toggleLinePrefix,
  toggleOrderedList,
  insertLink,
  insertImage,
  insertRawText,
} from "../src/popup/logic/editor/commands.js";

/** Applies a command result to a string the way the real editor does, for
 * round-trip assertions: original.slice(0,rangeStart)+replacement+original.slice(rangeEnd) === text. */
function applies(original, result) {
  return (
    original.slice(0, result.rangeStart) +
    result.replacement +
    original.slice(result.rangeEnd) ===
    result.text
  );
}

describe("toggleWrap", () => {
  it("wraps a selected word", () => {
    const text = "hello world";
    const result = toggleWrap(text, 0, 5, "**");
    expect(result.text).toBe("**hello** world");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(7);
    expect(applies(text, result)).toBe(true);
  });

  it("inserts empty markers at a collapsed caret", () => {
    const text = "";
    const result = toggleWrap(text, 0, 0, "**");
    expect(result.text).toBe("****");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(2);
  });

  it("toggles off when markers sit immediately outside the selection", () => {
    const text = "**hello** world";
    const result = toggleWrap(text, 2, 7, "**");
    expect(result.text).toBe("hello world");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(5);
    expect(applies(text, result)).toBe(true);
  });

  it("toggles off when markers are included in the selection", () => {
    const text = "say **hello** now";
    const result = toggleWrap(text, 4, 13, "**");
    expect(result.text).toBe("say hello now");
    expect(result.selectionStart).toBe(4);
    expect(result.selectionEnd).toBe(9);
  });

  it("wraps a partial-word selection", () => {
    const text = "hello";
    const result = toggleWrap(text, 1, 4, "*"); // "ell"
    expect(result.text).toBe("h*ell*o");
  });

  it("supports nested emphasis (bold already containing italic)", () => {
    const text = "**a *b* c**";
    // italicize an additional single letter "a" inside the bold run
    const result = toggleWrap(text, 2, 3, "*");
    expect(result.text).toBe("***a* *b* c**");
    expect(applies(text, result)).toBe(true);
  });

  it("handles selection boundaries landing exactly on existing markers", () => {
    const text = "**bold**";
    const result = toggleWrap(text, 2, 6, "**");
    expect(result.text).toBe("bold");
  });

  it("handles CRLF content without throwing and preserves character count", () => {
    const text = "line one\r\nline two";
    const result = toggleWrap(text, 0, 4, "**");
    expect(result.text).toBe("**line** one\r\nline two");
    expect(applies(text, result)).toBe(true);
  });

  it("handles trailing-newline content", () => {
    const text = "hello\n";
    const result = toggleWrap(text, 0, 5, "_");
    expect(result.text).toBe("_hello_\n");
  });
});

describe("toggleLinePrefix", () => {
  it("adds a prefix to a single line", () => {
    const text = "hello";
    const result = toggleLinePrefix(text, 0, 5, "> ");
    expect(result.text).toBe("> hello");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(7);
    expect(applies(text, result)).toBe(true);
  });

  it("adds a prefix to every line in a multi-line selection", () => {
    const text = "one\ntwo\nthree";
    const result = toggleLinePrefix(text, 0, text.length, "- ");
    expect(result.text).toBe("- one\n- two\n- three");
  });

  it("removes the prefix when every selected line already has it", () => {
    const text = "- one\n- two";
    const result = toggleLinePrefix(text, 0, text.length, "- ");
    expect(result.text).toBe("one\ntwo");
  });

  it("toggles on for a line that is already prefixed, leaving it alone, when selection spans mixed lines", () => {
    const text = "- one\ntwo";
    const result = toggleLinePrefix(text, 0, text.length, "- ");
    // not all non-empty lines have the prefix -> add to the ones missing it
    expect(result.text).toBe("- one\n- two");
  });

  it("does not prefix empty lines", () => {
    const text = "one\n\ntwo";
    const result = toggleLinePrefix(text, 0, text.length, "> ");
    expect(result.text).toBe("> one\n\n> two");
  });

  it("only affects the lines covering a collapsed caret", () => {
    const text = "one\ntwo\nthree";
    const caretInTwo = 5; // inside "two"
    const result = toggleLinePrefix(text, caretInTwo, caretInTwo, "## ");
    expect(result.text).toBe("one\n## two\nthree");
  });

  it("keeps selection offsets correct after removing a prefix mid-line", () => {
    const text = "> quoted text";
    const caretInside = 10; // inside "text", after the prefix
    const result = toggleLinePrefix(text, caretInside, caretInside, "> ");
    expect(result.text).toBe("quoted text");
    expect(result.selectionStart).toBe(caretInside - 2);
    expect(result.selectionEnd).toBe(caretInside - 2);
  });
});

describe("toggleOrderedList", () => {
  it("numbers a multi-line selection sequentially", () => {
    const text = "one\ntwo\nthree";
    const result = toggleOrderedList(text, 0, text.length);
    expect(result.text).toBe("1. one\n2. two\n3. three");
    expect(applies(text, result)).toBe(true);
  });

  it("removes numbering when every line already has it", () => {
    const text = "1. one\n2. two";
    const result = toggleOrderedList(text, 0, text.length);
    expect(result.text).toBe("one\ntwo");
  });

  it("renumbers even if the original numbers were out of order", () => {
    const text = "5. one\n2. two";
    const result = toggleOrderedList(text, 0, text.length);
    expect(result.text).toBe("one\ntwo"); // all lines matched the pattern -> removed
  });

  it("does not number empty lines", () => {
    const text = "one\n\ntwo";
    const result = toggleOrderedList(text, 0, text.length);
    expect(result.text).toBe("1. one\n\n2. two");
  });
});

describe("insertLink", () => {
  it("wraps a selection as a link and selects the label", () => {
    const text = "see docs here";
    const result = insertLink(text, 4, 8, "https://example.com");
    expect(result.text).toBe("see [docs](https://example.com) here");
    expect(result.selectionStart).toBe(5);
    expect(result.selectionEnd).toBe(9);
    expect(applies(text, result)).toBe(true);
  });

  it("inserts a placeholder label at a collapsed caret", () => {
    const text = "";
    const result = insertLink(text, 0, 0, "https://example.com");
    expect(result.text).toBe("[link text](https://example.com)");
  });
});

describe("insertImage", () => {
  it("wraps a selection as an image reference", () => {
    const text = "a screenshot of the bug";
    const result = insertImage(text, 2, 12, "https://example.com/s.png");
    expect(result.text).toBe("a ![screenshot](https://example.com/s.png) of the bug");
    expect(applies(text, result)).toBe(true);
  });

  it("inserts a placeholder alt text at a collapsed caret", () => {
    const text = "";
    const result = insertImage(text, 0, 0, "https://example.com/s.png");
    expect(result.text).toBe("![image](https://example.com/s.png)");
  });
});

describe("insertRawText", () => {
  it("inserts verbatim at a collapsed caret", () => {
    const text = "before after";
    const result = insertRawText(text, 6, 6, " INSERTED");
    expect(result.text).toBe("before INSERTED after");
    expect(result.selectionStart).toBe(15);
    expect(result.selectionEnd).toBe(15);
    expect(applies(text, result)).toBe(true);
  });

  it("replaces an existing selection with the raw text", () => {
    const text = "replace THIS now";
    const result = insertRawText(text, 8, 12, "![pic](url)");
    expect(result.text).toBe("replace ![pic](url) now");
    expect(result.selectionStart).toBe(19);
    expect(result.selectionEnd).toBe(19);
  });

  it("is a no-op when raw is an empty string", () => {
    const text = "hello world";
    const result = insertRawText(text, 5, 5, "");
    expect(result.text).toBe(text);
    expect(result.selectionStart).toBe(5);
  });
});
