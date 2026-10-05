import { parseMarkdown, isSafeUrl } from "../src/popup/logic/editor/markdown.js";

describe("parseMarkdown: block types", () => {
  it("parses a heading", () => {
    const blocks = parseMarkdown("## Title");
    expect(blocks).toEqual([
      { type: "heading", level: 2, inline: [{ type: "text", value: "Title" }] },
    ]);
  });

  it("does not parse a '#' with no following space as a heading", () => {
    const blocks = parseMarkdown("#NoSpace");
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[0].inline).toEqual([{ type: "text", value: "#NoSpace" }]);
  });

  it("parses a paragraph", () => {
    const blocks = parseMarkdown("just text");
    expect(blocks).toEqual([
      { type: "paragraph", inline: [{ type: "text", value: "just text" }] },
    ]);
  });

  it("joins wrapped paragraph lines with a space", () => {
    const blocks = parseMarkdown("line one\nline two");
    expect(blocks[0].inline).toEqual([{ type: "text", value: "line one line two" }]);
  });

  it("parses a blockquote", () => {
    const blocks = parseMarkdown("> quoted");
    expect(blocks).toEqual([
      { type: "quote", inline: [{ type: "text", value: "quoted" }] },
    ]);
  });

  it("parses an unordered list", () => {
    const blocks = parseMarkdown("- one\n- two");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", value: "one" }],
          [{ type: "text", value: "two" }],
        ],
      },
    ]);
  });

  it("parses an ordered list", () => {
    const blocks = parseMarkdown("1. one\n2. two");
    expect(blocks[0].type).toBe("list");
    expect(blocks[0].ordered).toBe(true);
  });

  it("parses a fenced code block, preserving internal content verbatim", () => {
    const blocks = parseMarkdown("```js\nconst x = 1;\nif (x) { y(); }\n```");
    expect(blocks).toEqual([{ type: "code", text: "const x = 1;\nif (x) { y(); }" }]);
  });

  it("terminates on an unterminated fence instead of looping forever", () => {
    const blocks = parseMarkdown("```\nline one\nline two");
    expect(blocks).toEqual([{ type: "code", text: "line one\nline two" }]);
  });

  it("renders a literal <br> as a line break (the one tag transformToMarkdown emits)", () => {
    const blocks = parseMarkdown("line one<br>\nline two");
    expect(blocks[0].inline).toEqual([
      { type: "text", value: "line one" },
      { type: "break" },
      { type: "text", value: " line two" },
    ]);
  });

  it("recognizes <br/> and <br /> variants case-insensitively", () => {
    for (const tag of ["<BR>", "<br/>", "<br />"]) {
      const blocks = parseMarkdown(`a${tag}b`);
      expect(blocks[0].inline.some((n) => n.type === "break")).toBe(true);
    }
  });

  it("treats a literal '<script>' in the source as plain text, not a tag", () => {
    const blocks = parseMarkdown("before <script>alert(1)</script> after");
    expect(blocks[0].inline).toEqual([
      { type: "text", value: "before <script>alert(1)</script> after" },
    ]);
  });
});

describe("parseMarkdown: inline types", () => {
  it("parses bold and italic", () => {
    const blocks = parseMarkdown("**bold** and *italic*");
    expect(blocks[0].inline).toEqual([
      { type: "bold", children: [{ type: "text", value: "bold" }] },
      { type: "text", value: " and " },
      { type: "italic", children: [{ type: "text", value: "italic" }] },
    ]);
  });

  it("parses nested emphasis", () => {
    const blocks = parseMarkdown("**a *b* c**");
    expect(blocks[0].inline).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", value: "a " },
          { type: "italic", children: [{ type: "text", value: "b" }] },
          { type: "text", value: " c" },
        ],
      },
    ]);
  });

  it("parses inline code", () => {
    const blocks = parseMarkdown("run `npm test` now");
    expect(blocks[0].inline).toEqual([
      { type: "text", value: "run " },
      { type: "code", value: "npm test" },
      { type: "text", value: " now" },
    ]);
  });

  it("parses a safe link", () => {
    const blocks = parseMarkdown("[docs](https://example.com)");
    expect(blocks[0].inline).toEqual([
      {
        type: "link",
        href: "https://example.com",
        children: [{ type: "text", value: "docs" }],
      },
    ]);
  });

  it("parses a safe image", () => {
    const blocks = parseMarkdown("![alt text](https://example.com/s.png)");
    expect(blocks[0].inline).toEqual([
      { type: "image", alt: "alt text", href: "https://example.com/s.png" },
    ]);
  });

  it("rejects a javascript: link, keeping the node but with href null", () => {
    const blocks = parseMarkdown("[click](javascript:alert(1))");
    expect(blocks[0].inline[0].type).toBe("link");
    expect(blocks[0].inline[0].href).toBeNull();
  });

  it("rejects a data: image", () => {
    const blocks = parseMarkdown("![x](data:text/html;base64,AAAA)");
    expect(blocks[0].inline[0].href).toBeNull();
  });

  it("accepts a mailto: link", () => {
    const blocks = parseMarkdown("[mail](mailto:a@b.com)");
    expect(blocks[0].inline[0].href).toBe("mailto:a@b.com");
  });

  it("accepts a GitLab-relative /uploads/ path", () => {
    const blocks = parseMarkdown("[file](/uploads/abc/file.pdf)");
    expect(blocks[0].inline[0].href).toBe("/uploads/abc/file.pdf");
  });

  it("leaves an unterminated bold marker as literal text", () => {
    const blocks = parseMarkdown("**not closed");
    expect(blocks[0].inline).toEqual([{ type: "text", value: "**not closed" }]);
  });

  it("leaves an unterminated inline code marker as literal text", () => {
    const blocks = parseMarkdown("`not closed");
    expect(blocks[0].inline).toEqual([{ type: "text", value: "`not closed" }]);
  });

  it("does not crash and terminates on pathological input", () => {
    const pathological = "*".repeat(5000) + "a".repeat(5000);
    expect(() => parseMarkdown(pathological)).not.toThrow();
  });

  it("handles empty content", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n  \n")).toEqual([]);
  });
});

describe("isSafeUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["mailto:a@b.com", true],
    ["/uploads/x/y.png", true],
    ["javascript:alert(1)", false],
    ["data:text/html;base64,AAAA", false],
    ["vbscript:msgbox(1)", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isSafeUrl(%p) -> %p", (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected);
  });
});
