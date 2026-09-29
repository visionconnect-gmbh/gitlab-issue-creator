import {
  extractSection,
  escapeHtml,
  renderInlineMarkdown,
  categorizeCommits,
  renderAtnHtml,
  renderChangelogSectionHtml,
} from "../scripts/utils/changelog.js";

const ALLOWED_TAGS = ["a", "abbr", "acronym", "b", "blockquote", "code", "em", "i", "li", "ol", "strong", "ul"];

/** Returns every HTML tag name found in `html` (open or close), lowercased. */
function tagsIn(html) {
  const matches = [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)];
  return matches.map((m) => m[1].toLowerCase());
}

describe("extractSection", () => {
  const fixture = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "## [1.2.0] - 2026-01-02",
    "",
    "### Added",
    "",
    "- **Thing.** Detail.",
    "",
    "## [1.1.0] - 2026-01-01",
    "",
    "- Older entry.",
    "",
  ].join("\n");

  it("extracts a middle section", () => {
    expect(extractSection(fixture, "1.2.0")).toBe("### Added\n\n- **Thing.** Detail.");
  });

  it("extracts the last section", () => {
    expect(extractSection(fixture, "1.1.0")).toBe("- Older entry.");
  });

  it("returns null for a missing version", () => {
    expect(extractSection(fixture, "9.9.9")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes &, < and >", () => {
    expect(escapeHtml("a < b && b > c")).toBe("a &lt; b &amp;&amp; b &gt; c");
  });
});

describe("renderInlineMarkdown", () => {
  it("converts **bold**, `code` and [links](url) to allowed tags only", () => {
    const html = renderInlineMarkdown("**Fixed** the `getCache` bug, see [issue](https://example.com/1)");
    for (const tag of tagsIn(html)) {
      expect(ALLOWED_TAGS).toContain(tag);
    }
    expect(html).toContain("<strong>Fixed</strong>");
    expect(html).toContain("<code>getCache</code>");
    expect(html).toContain('<a href="https://example.com/1">issue</a>');
  });

  it("escapes raw angle brackets instead of emitting <p> or <br>", () => {
    const html = renderInlineMarkdown("a <br> tag and a <p> tag should not survive");
    expect(html).not.toMatch(/<br\b/i);
    expect(html).not.toMatch(/<p\b/i);
    expect(html).toContain("&lt;br&gt;");
    expect(html).toContain("&lt;p&gt;");
  });

  it("escapes stray ampersands and angle brackets in plain text", () => {
    const html = renderInlineMarkdown("Tom & Jerry < 5 > 3");
    expect(html).toBe("Tom &amp; Jerry &lt; 5 &gt; 3");
  });
});

describe("categorizeCommits", () => {
  it("buckets conventional-commit subjects and collects release versions", () => {
    const { buckets, releaseVersions } = categorizeCommits([
      "feat: add thing",
      "fix: correct bug",
      "refactor: tidy up",
      "chore: housekeeping",
      "Release: Patch version v7.1.2",
      "chore(release): v7.1.3",
      "some unconventional subject",
    ]);

    expect(buckets.Added).toEqual(["Add thing"]);
    expect(buckets.Fixed).toEqual(["Correct bug"]);
    expect(buckets.Changed).toEqual(["Tidy up", "Housekeeping", "Some unconventional subject"]);
    expect(releaseVersions).toEqual(["7.1.2", "7.1.3"]);
  });
});

describe("renderAtnHtml", () => {
  it("only ever emits allowed, balanced tags", () => {
    const html = renderAtnHtml(
      { Added: ["A <script> tag & stuff"], Changed: ["Something `coded`"], Fixed: [] },
      ["7.2.0"],
    );

    for (const tag of tagsIn(html)) {
      expect(ALLOWED_TAGS).toContain(tag);
    }
    // Balanced: every opening tag has a matching closing tag.
    const opens = [...html.matchAll(/<([a-z]+)(?:\s[^>]*)?>/g)].map((m) => m[1]);
    const closes = [...html.matchAll(/<\/([a-z]+)>/g)].map((m) => m[1]);
    expect(opens.sort()).toEqual(closes.sort());

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("Version v7.2.0");
  });

  it("omits empty buckets", () => {
    const html = renderAtnHtml({ Added: ["Thing"], Changed: [], Fixed: [] }, []);
    expect(html).not.toContain("Changed");
    expect(html).not.toContain("Fixed");
    expect(html).not.toContain("Release");
  });
});

describe("renderChangelogSectionHtml", () => {
  it("renders categorized bullets from a CHANGELOG.md section", () => {
    const section = "### Added\n\n- **Thing.** Detail with `code`.\n\n### Fixed\n\n- A bug < b";
    const html = renderChangelogSectionHtml(section);

    for (const tag of tagsIn(html)) {
      expect(ALLOWED_TAGS).toContain(tag);
    }
    expect(html).toContain("<strong>Added</strong>");
    expect(html).toContain("<strong>Fixed</strong>");
    expect(html).toContain("&lt;");
  });

  it("renders a flat bullet list without category headings", () => {
    const html = renderChangelogSectionHtml("- One\n- Two");
    expect(html).toBe("<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>");
  });
});
