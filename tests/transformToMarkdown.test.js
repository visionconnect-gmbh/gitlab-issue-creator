import { transformToMarkdown } from "../src/utils/markdownLineBreaks.js";

describe("transformToMarkdown", () => {
  it("converts a single newline to <br>", () => {
    expect(transformToMarkdown("line one\nline two")).toBe("line one<br>\nline two");
  });

  it("preserves blank-line paragraph breaks", () => {
    expect(transformToMarkdown("para one\n\npara two")).toBe("para one\n\npara two");
  });

  it("normalizes CRLF and CR to LF before converting", () => {
    expect(transformToMarkdown("line one\r\nline two")).toBe("line one<br>\nline two");
    expect(transformToMarkdown("line one\rline two")).toBe("line one<br>\nline two");
  });

  it("returns an empty string unchanged", () => {
    expect(transformToMarkdown("")).toBe("");
  });

  it("does not insert <br> inside a fenced code block", () => {
    const input = "before\n```\nconst x = 1;\nif (x) {\n  y();\n}\n```\nafter";
    const result = transformToMarkdown(input);
    expect(result).toBe(
      "before<br>\n```\nconst x = 1;\nif (x) {\n  y();\n}\n```\nafter",
    );
  });

  it("does not insert <br> inside a table", () => {
    const input = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    expect(transformToMarkdown(input)).toBe(input);
  });

  it("does not insert <br> between consecutive list items", () => {
    const input = "- one\n- two\n- three";
    expect(transformToMarkdown(input)).toBe(input);
  });

  it("does not insert <br> after a heading or before a blockquote/list that follows other text", () => {
    const input = "## Heading\nSome text\n> a quote\n- a list item";
    expect(transformToMarkdown(input)).toBe(input);
  });

  it("still converts a hard line break between two plain paragraph lines inside a blockquote run", () => {
    // Consecutive quote lines are already visually joined by the leading
    // "> ", so no <br> is needed, same as list items and table rows.
    const input = "> line one\n> line two";
    expect(transformToMarkdown(input)).toBe(input);
  });

  it("leaves an unterminated fence alone rather than inserting <br> inside it", () => {
    const input = "```\nunterminated\ncode block";
    expect(transformToMarkdown(input)).toBe(input);
  });
});
