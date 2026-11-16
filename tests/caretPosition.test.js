/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { textareaOffsetFromPoint } from "../src/popup/logic/editor/caretPosition.js";

describe("textareaOffsetFromPoint", () => {
  let textarea;

  beforeEach(() => {
    textarea = document.createElement("textarea");
    textarea.value = "hello world";
    document.body.appendChild(textarea);
  });

  afterEach(() => {
    delete document.caretPositionFromPoint;
    document.body.replaceChildren();
  });

  it("returns null when the API is unavailable", () => {
    expect(textareaOffsetFromPoint(textarea, 1, 1)).toBeNull();
  });

  it("uses the offset directly when the point resolves to the textarea", () => {
    document.caretPositionFromPoint = jest.fn(() => ({ offsetNode: textarea, offset: 5 }));
    expect(textareaOffsetFromPoint(textarea, 1, 1)).toBe(5);
    expect(document.caretPositionFromPoint).toHaveBeenCalledTimes(1);
  });

  it("falls back to an invisible but hit-testable mirror", () => {
    let mirrorStyle;
    document.caretPositionFromPoint = jest.fn(() => {
      const mirror = [...document.body.children].find((c) => c !== textarea);
      if (!mirror) return { offsetNode: document.body, offset: 0 };
      mirrorStyle = mirror.style;
      return { offsetNode: mirror.firstChild, offset: 3 };
    });
    expect(textareaOffsetFromPoint(textarea, 1, 1)).toBe(3);
    expect(mirrorStyle.opacity).toBe("0");
    expect(mirrorStyle.visibility).toBe("");
  });
});
