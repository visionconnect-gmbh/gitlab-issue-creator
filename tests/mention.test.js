import {
  findActiveMentionQuery,
  filterMentionCandidates,
  formatMentionLabel,
} from "../src/popup/logic/editor/mention.js";

describe("findActiveMentionQuery", () => {
  it("finds an active query right after '@'", () => {
    expect(findActiveMentionQuery("hey @jan", 8)).toEqual({ start: 4, end: 8, query: "jan" });
  });

  it("finds an empty query for a bare '@'", () => {
    expect(findActiveMentionQuery("hey @", 5)).toEqual({ start: 4, end: 5, query: "" });
  });

  it("returns null when the caret isn't inside any token (after a space)", () => {
    expect(findActiveMentionQuery("hey @jan ", 9)).toBeNull();
  });

  it("returns null for a word that doesn't start with '@', e.g. an email address", () => {
    expect(findActiveMentionQuery("contact jane@example.com", 25)).toBeNull();
  });

  it("returns null when the query contains a disallowed character", () => {
    expect(findActiveMentionQuery("hey @jan@doe", 12)).toBeNull();
  });

  it("allows '.', '-', and '_' in the query", () => {
    expect(findActiveMentionQuery("@jane.doe-ish_one", 17)).toEqual({
      start: 0,
      end: 17,
      query: "jane.doe-ish_one",
    });
  });

  it("finds the token at the start of the text, with no preceding whitespace", () => {
    expect(findActiveMentionQuery("@bob", 4)).toEqual({ start: 0, end: 4, query: "bob" });
  });

  it("re-evaluates from the caret position, not the end of the text", () => {
    // caret sits inside "@jan", with more text after it
    expect(findActiveMentionQuery("@jane end", 4)).toEqual({ start: 0, end: 4, query: "jan" });
  });
});

describe("filterMentionCandidates", () => {
  const CANDIDATES = [
    { id: 1, username: "jane.doe", name: "Jane Doe" },
    { id: 2, username: "janet.roe", name: "Janet Roe" },
    { id: 3, username: "bob", name: "Bob Jansen" },
    { id: 4, username: "alice", name: "Alice" },
  ];

  it("returns everything (capped at the limit) for an empty query", () => {
    expect(filterMentionCandidates(CANDIDATES, "", 2)).toEqual(CANDIDATES.slice(0, 2));
  });

  it("ranks username/name prefix matches above substring matches", () => {
    const result = filterMentionCandidates(CANDIDATES, "jan");
    expect(result.map((c) => c.username)).toEqual(["jane.doe", "janet.roe", "bob"]);
  });

  it("matches case-insensitively", () => {
    // "janet" also starts with "jane", so both are legitimate prefix matches.
    const result = filterMentionCandidates(CANDIDATES, "JANE");
    expect(result.map((c) => c.username)).toEqual(["jane.doe", "janet.roe"]);
  });

  it("caps results at the given limit", () => {
    expect(filterMentionCandidates(CANDIDATES, "a", 1)).toHaveLength(1);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterMentionCandidates(CANDIDATES, "zzz")).toEqual([]);
  });

  it("tolerates candidates with no display name", () => {
    const noName = [{ id: 5, username: "ghost" }];
    expect(filterMentionCandidates(noName, "gho")).toEqual(noName);
  });
});

describe("formatMentionLabel", () => {
  it("includes both name and username when a name is present", () => {
    expect(formatMentionLabel({ username: "jane.doe", name: "Jane Doe" })).toBe(
      "Jane Doe (@jane.doe)",
    );
  });

  it("falls back to just the username when there is no name", () => {
    expect(formatMentionLabel({ username: "ghost" })).toBe("@ghost");
  });
});
