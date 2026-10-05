/** @jest-environment jsdom */
import { jest } from "@jest/globals";

// popupState.js and other modules read `browser.*` at import time, but
// editor.js only needs i18n + storage, both of which the shared jest.setup.js
// browser stub (loaded by jest.config.mjs's setupFiles) already provides.

import { createEditor } from "../src/popup/logic/editor/editor.js";

function makeTextarea() {
  const wrapper = document.createElement("div");
  const textarea = document.createElement("textarea");
  wrapper.appendChild(textarea);
  document.body.appendChild(wrapper);
  return textarea;
}

function clickButton(toolbar, command) {
  toolbar.querySelector(`[data-command="${command}"]`).click();
}

/** Simulates a user picking `file` via the hidden image-upload input and
 * waits a tick for the async `change` handler to run. jsdom's `files` is
 * normally read-only, so it's overridden directly, same as every real-world
 * jsdom file-input test does. */
async function pickImageFile(container, file) {
  const input = container.querySelector(".md-image-input");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  // Let the async change handler's awaits resolve.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createEditor", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("builds a toolbar with the expected buttons", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);

    const toolbar = textarea.closest(".md-editor").querySelector(".md-toolbar");
    const ids = [...toolbar.querySelectorAll("[data-command]")].map((b) => b.dataset.command);

    expect(ids).toEqual([
      "bold",
      "italic",
      "heading",
      "quote",
      "unordered-list",
      "ordered-list",
      "link",
      "image",
      "mention",
      "preview",
      "fullscreen",
      "guide",
    ]);

    editor.destroy();
  });

  it("applies bold formatting to the current selection on click", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const toolbar = textarea.closest(".md-editor").querySelector(".md-toolbar");

    textarea.value = "hello world";
    textarea.setSelectionRange(0, 5);

    clickButton(toolbar, "bold");

    expect(editor.value()).toBe("**hello** world");
    editor.destroy();
  });

  it("Ctrl+B produces the same result as clicking the bold button", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);

    textarea.value = "hello world";
    textarea.setSelectionRange(0, 5);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(editor.value()).toBe("**hello** world");
    editor.destroy();
  });

  it("round-trips value() get/set", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);

    editor.value("some *markdown* text");
    expect(editor.value()).toBe("some *markdown* text");
    expect(textarea.value).toBe("some *markdown* text");

    editor.destroy();
  });

  it("replaces the textarea with the preview (not alongside it), and swaps back", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");
    const preview = container.querySelector(".md-preview");

    editor.value("**bold text**");
    expect(preview.hidden).toBe(true);
    expect(textarea.hidden).toBe(false);

    clickButton(toolbar, "preview");
    expect(preview.hidden).toBe(false);
    expect(textarea.hidden).toBe(true); // the textarea is replaced, not just supplemented
    expect(preview.querySelector("strong").textContent).toBe("bold text");
    expect(toolbar.querySelector('[data-command="preview"]').getAttribute("aria-pressed")).toBe("true");

    clickButton(toolbar, "preview");
    expect(preview.hidden).toBe(true);
    expect(textarea.hidden).toBe(false);
    expect(toolbar.querySelector('[data-command="preview"]').getAttribute("aria-pressed")).toBe("false");

    editor.destroy();
  });

  it("renders no <script> element and rejects unsafe link schemes in the preview", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");
    const preview = container.querySelector(".md-preview");

    editor.value(
      "before <script>alert(1)</script> after\n\n[click me](javascript:alert(1))",
    );
    clickButton(toolbar, "preview");

    expect(preview.querySelectorAll("script")).toHaveLength(0);
    expect(preview.innerHTML).not.toContain("<script>alert");

    const anchors = [...preview.querySelectorAll("a")];
    expect(anchors.every((a) => /^(https?:|mailto:)/i.test(a.href) || a.getAttribute("href") === null)).toBe(true);
    // the javascript: link must not have become a clickable anchor at all
    expect(preview.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0);

    editor.destroy();
  });

  it("detaches listeners and restores the plain textarea on destroy", () => {
    const textarea = makeTextarea();
    const parent = textarea.parentNode;
    const editor = createEditor(textarea);

    expect(parent.querySelector(".md-editor")).not.toBeNull();

    editor.destroy();

    expect(parent.querySelector(".md-editor")).toBeNull();
    expect(parent.contains(textarea)).toBe(true);
    expect(textarea.classList.contains("md-textarea")).toBe(false);
  });

  it("opens the link button's URL prompt instead of window.prompt(), and rejects an unsafe URL inline", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");
    const prompt = container.querySelector(".md-url-prompt");

    textarea.value = "see docs";
    textarea.setSelectionRange(4, 8);

    clickButton(toolbar, "link");
    expect(prompt.hidden).toBe(false);

    const input = prompt.querySelector("input");
    const confirmBtn = prompt.querySelectorAll("button")[0];

    input.value = "javascript:alert(1)";
    confirmBtn.click();

    const error = prompt.querySelector(".md-url-prompt-error");
    expect(error.hidden).toBe(false);
    expect(editor.value()).toBe("see docs"); // unchanged

    input.value = "https://example.com";
    confirmBtn.click();

    expect(prompt.hidden).toBe(true);
    expect(editor.value()).toBe("see [docs](https://example.com)");

    editor.destroy();
  });

  it("actually hides the URL prompt when its cancel button is clicked", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");
    const prompt = container.querySelector(".md-url-prompt");

    clickButton(toolbar, "link");
    expect(prompt.hidden).toBe(false);

    const cancelBtn = prompt.querySelectorAll("button")[1];
    cancelBtn.click();

    expect(prompt.hidden).toBe(true);
    editor.destroy();
  });

  it("sets an explicit pixel height on the textarea so it grows with content (the popup scrolls, not the textarea)", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);

    expect(textarea.style.height).toMatch(/^\d+px$/); // sized on construction too

    editor.value("line 1\nline 2\nline 3");
    expect(textarea.style.height).toMatch(/^\d+px$/);

    editor.destroy();
  });

  it("hands sizing over to CSS flex in fullscreen (clears the inline height) and restores it on exit", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");

    editor.value("some content");
    expect(textarea.style.height).toMatch(/^\d+px$/);

    clickButton(toolbar, "fullscreen");
    expect(container.classList.contains("md-fullscreen")).toBe(true);
    expect(textarea.style.height).toBe(""); // flex (CSS) sizes it now, not inline style

    clickButton(toolbar, "fullscreen");
    expect(container.classList.contains("md-fullscreen")).toBe(false);
    expect(textarea.style.height).toMatch(/^\d+px$/); // back to content-driven sizing

    editor.destroy();
  });

  it("re-sizes the textarea when switching back from preview, since it never grew while hidden", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");

    clickButton(toolbar, "preview"); // textarea now hidden
    editor.value("new content set while the preview was showing");

    clickButton(toolbar, "preview"); // back to edit
    expect(textarea.hidden).toBe(false);
    expect(textarea.style.height).toMatch(/^\d+px$/);

    editor.destroy();
  });

  it("previews consecutive single-line-break content as separate lines, matching what GitLab will actually render", () => {
    // Regression test: the generated description puts "**Von**: X" and
    // "**Empfangen am**: Y" on consecutive lines separated by a single \n.
    // Markdown alone would soft-wrap that into one line; the real GitLab
    // submission forces a <br> via transformToMarkdown(): the preview must
    // apply the same transform, or it misleadingly shows them joined.
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");
    const preview = container.querySelector(".md-preview");

    editor.value("**Von**: Jane Doe <jane@example.com>\n**Empfangen am**: 28.09.2026, 09:33");
    clickButton(toolbar, "preview");

    const paragraph = preview.querySelector("p");
    expect(paragraph.querySelectorAll("br")).toHaveLength(1);
    // the <br> element itself must be real DOM, not literal "<br>" text
    expect(paragraph.textContent).not.toContain("<br>");
    expect(paragraph.textContent).toContain("Von");
    expect(paragraph.textContent).toContain("Empfangen am");

    editor.destroy();
  });

  it("renders link/image/preview/fullscreen/quote as real SVG icons, not emoji text", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const toolbar = textarea.closest(".md-editor").querySelector(".md-toolbar");

    for (const command of ["link", "image", "mention", "preview", "fullscreen", "quote", "unordered-list", "ordered-list"]) {
      const button = toolbar.querySelector(`[data-command="${command}"]`);
      expect(button.querySelector("svg")).not.toBeNull();
      // no emoji/pictographic text content left in the button
      expect(/\p{Emoji_Presentation}/u.test(button.textContent)).toBe(false);
    }

    editor.destroy();
  });
});

describe("createEditor: image upload", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("clicking the image button opens the native file picker, not the URL prompt", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");
    const input = container.querySelector(".md-image-input");
    const prompt = container.querySelector(".md-url-prompt");

    const clickSpy = jest.spyOn(input, "click");
    clickButton(toolbar, "image");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(prompt.hidden).toBe(true); // unaffected, image no longer uses it

    editor.destroy();
  });

  it("calls onPickImage with the picked File, and inserts the returned markdown at the cursor", async () => {
    const textarea = makeTextarea();
    const onPickImage = jest.fn().mockResolvedValue({ markdown: "![pic.png](/uploads/abc/pic.png)" });
    const editor = createEditor(textarea, { onPickImage });
    const container = textarea.closest(".md-editor");

    editor.value("before  after");
    textarea.setSelectionRange(7, 7); // between the two spaces

    const file = new File(["data"], "pic.png", { type: "image/png" });
    await pickImageFile(container, file);

    expect(onPickImage).toHaveBeenCalledWith(file);
    expect(editor.value()).toBe("before ![pic.png](/uploads/abc/pic.png) after");

    editor.destroy();
  });

  it("disables the image button while onPickImage is in flight, and re-enables it afterward", async () => {
    const textarea = makeTextarea();
    let resolveUpload;
    const onPickImage = jest.fn(
      () => new Promise((resolve) => { resolveUpload = resolve; }),
    );
    const editor = createEditor(textarea, { onPickImage });
    const container = textarea.closest(".md-editor");
    const button = container.querySelector('[data-command="image"]');

    const input = container.querySelector(".md-image-input");
    Object.defineProperty(input, "files", {
      value: [new File(["data"], "pic.png", { type: "image/png" })],
      configurable: true,
    });
    input.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(button.disabled).toBe(true);

    resolveUpload({ markdown: "![pic.png](/uploads/abc/pic.png)" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(button.disabled).toBe(false);
    editor.destroy();
  });

  it("leaves the textarea content unchanged when onPickImage resolves null (failure: it already notified the user)", async () => {
    const textarea = makeTextarea();
    const onPickImage = jest.fn().mockResolvedValue(null);
    const editor = createEditor(textarea, { onPickImage });
    const container = textarea.closest(".md-editor");

    editor.value("unchanged content");
    const file = new File(["data"], "pic.png", { type: "image/png" });
    await pickImageFile(container, file);

    expect(editor.value()).toBe("unchanged content");
    editor.destroy();
  });

  it("does not throw when no onPickImage is configured", async () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea); // no options at all
    const container = textarea.closest(".md-editor");

    const file = new File(["data"], "pic.png", { type: "image/png" });
    await expect(pickImageFile(container, file)).resolves.not.toThrow();

    editor.destroy();
  });

  it("resets the input value after picking, so re-selecting the same file still fires change", async () => {
    const textarea = makeTextarea();
    const onPickImage = jest.fn().mockResolvedValue({ markdown: "![pic.png](/uploads/abc/pic.png)" });
    const editor = createEditor(textarea, { onPickImage });
    const container = textarea.closest(".md-editor");
    const input = container.querySelector(".md-image-input");

    const file = new File(["data"], "pic.png", { type: "image/png" });
    await pickImageFile(container, file);

    expect(input.value).toBe("");
    editor.destroy();
  });
});

describe("createEditor: inline mention autocomplete", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const MEMBERS = [
    { id: 1, username: "jane.doe", name: "Jane Doe" },
    { id: 2, username: "janet.roe", name: "Janet Roe" },
    { id: 3, username: "bob", name: "Bob Builder" },
  ];

  function mentionList(container) {
    return container.querySelector(".md-mention-list");
  }

  function type(textarea, text) {
    textarea.value += text;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("opens the dropdown with filtered, ranked matches as the user types after '@'", () => {
    const textarea = makeTextarea();
    const getMentionCandidates = () => MEMBERS;
    const editor = createEditor(textarea, { getMentionCandidates });
    const container = textarea.closest(".md-editor");

    type(textarea, "hey @jan");

    const list = mentionList(container);
    expect(list.hidden).toBe(false);
    const labels = [...list.querySelectorAll(".md-mention-item")].map((li) => li.textContent);
    expect(labels).toEqual(["Jane Doe (@jane.doe)", "Janet Roe (@janet.roe)"]);

    editor.destroy();
  });

  it("closes the dropdown once a space ends the mention token", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "@jan");
    expect(mentionList(container).hidden).toBe(false);

    type(textarea, " ");
    expect(mentionList(container).hidden).toBe(true);

    editor.destroy();
  });

  it("does not trigger mid-word, e.g. an email address", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "jane@example.com");
    expect(mentionList(container).hidden).toBe(true);

    editor.destroy();
  });

  it("shows an empty-state row instead of closing when nothing matches", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "@nobody");

    const list = mentionList(container);
    expect(list.hidden).toBe(false);
    expect(list.querySelectorAll(".md-mention-item")).toHaveLength(0);
    expect(list.querySelector(".md-mention-empty")).not.toBeNull();

    editor.destroy();
  });

  it("ArrowDown/ArrowUp move the active row, wrapping at the ends", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "@j"); // matches jane.doe, janet.roe
    const activeLabel = () => mentionList(container).querySelector(".active").textContent;
    expect(activeLabel()).toBe("Jane Doe (@jane.doe)");

    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(activeLabel()).toBe("Janet Roe (@janet.roe)");

    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(activeLabel()).toBe("Jane Doe (@jane.doe)"); // wraps

    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    expect(activeLabel()).toBe("Janet Roe (@janet.roe)"); // wraps the other way

    editor.destroy();
  });

  it("Enter accepts the active row, replacing the query with '@username ' and closing the dropdown", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "hey @jan");
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(editor.value()).toBe("hey @jane.doe ");
    expect(mentionList(container).hidden).toBe(true);

    editor.destroy();
  });

  it("clicking a row accepts it without the textarea ever losing focus", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "hey @jan");
    textarea.focus();
    const row = mentionList(container).querySelectorAll(".md-mention-item")[1]; // janet.roe
    row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(editor.value()).toBe("hey @janet.roe ");
    expect(document.activeElement).toBe(textarea);

    editor.destroy();
  });

  it("Escape closes the dropdown without changing the text", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "hey @jan");
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

    expect(editor.value()).toBe("hey @jan");
    expect(mentionList(container).hidden).toBe(true);

    editor.destroy();
  });

  it("closes on blur", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");

    type(textarea, "@jan");
    expect(mentionList(container).hidden).toBe(false);

    textarea.dispatchEvent(new Event("blur"));
    expect(mentionList(container).hidden).toBe(true);

    editor.destroy();
  });

  it("the toolbar button inserts '@' at the caret and opens the dropdown with an empty query", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea, { getMentionCandidates: () => MEMBERS });
    const container = textarea.closest(".md-editor");
    const toolbar = container.querySelector(".md-toolbar");

    editor.value("hey ");
    textarea.setSelectionRange(4, 4);
    clickButton(toolbar, "mention");

    expect(editor.value()).toBe("hey @");
    const list = mentionList(container);
    expect(list.hidden).toBe(false);
    expect(list.querySelectorAll(".md-mention-item")).toHaveLength(3); // all candidates, no query yet

    editor.destroy();
  });

  it("does not throw when no getMentionCandidates is configured", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea); // no options at all

    expect(() => type(textarea, "@jan")).not.toThrow();
    editor.destroy();
  });
});

describe("createEditor: replace()", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("swaps the first occurrence of a substring", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);

    editor.value("before ![name](pending-upload:img-1) after");
    const replaced = editor.replace(
      "![name](pending-upload:img-1)",
      "![name](/uploads/abc/name.png)",
    );

    expect(replaced).toBe(true);
    expect(editor.value()).toBe("before ![name](/uploads/abc/name.png) after");

    editor.destroy();
  });

  it("returns false and leaves the value unchanged when the search string is absent", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);

    editor.value("nothing to replace here");
    const replaced = editor.replace("![name](pending-upload:img-1)", "x");

    expect(replaced).toBe(false);
    expect(editor.value()).toBe("nothing to replace here");

    editor.destroy();
  });

  it("does not steal focus from another element", () => {
    const textarea = makeTextarea();
    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();

    const editor = createEditor(textarea);
    editor.value("sentinel-text here");

    editor.replace("sentinel-text", "resolved-text");

    expect(document.activeElement).toBe(other);
    editor.destroy();
  });

  it("shifts the caret by the length delta when the textarea is focused and the caret is after the replacement", () => {
    const textarea = makeTextarea();
    const editor = createEditor(textarea);

    editor.value("AAA short BBB");
    textarea.focus();
    const caretInB = "AAA short ".length + 1;
    textarea.setSelectionRange(caretInB, caretInB);

    editor.replace("short", "a much longer replacement");

    const delta = "a much longer replacement".length - "short".length;
    expect(textarea.selectionStart).toBe(caretInB + delta);
    editor.destroy();
  });
});

describe("createEditor: onUserInput", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("fires on a real (user-driven) input event", () => {
    const textarea = makeTextarea();
    const onUserInput = jest.fn();
    const editor = createEditor(textarea, { onUserInput });

    textarea.value = "typed by the user";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onUserInput).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it("does not fire on a programmatic value() rewrite", () => {
    const textarea = makeTextarea();
    const onUserInput = jest.fn();
    const editor = createEditor(textarea, { onUserInput });

    editor.value("regenerated description");

    expect(onUserInput).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("does not fire on a programmatic replace()", () => {
    const textarea = makeTextarea();
    const onUserInput = jest.fn();
    const editor = createEditor(textarea, { onUserInput });

    editor.value("sentinel-text here");
    editor.replace("sentinel-text", "resolved-text");

    expect(onUserInput).not.toHaveBeenCalled();
    editor.destroy();
  });
});
