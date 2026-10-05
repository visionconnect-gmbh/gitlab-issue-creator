/** @jest-environment jsdom */
import { getCaretCoordinates } from "../src/popup/logic/editor/caretCoords.js";

// jsdom has no real layout engine, so offsetTop/offsetLeft/lineHeight are
// all 0 here; this only verifies the mirror-div mechanics run cleanly
// (built, measured, and cleaned up) without throwing, not pixel-perfect
// placement — that's a manual/visual concern, not a unit-testable one.
describe("getCaretCoordinates", () => {
  function makeTextarea(value) {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.value = value;
    return textarea;
  }

  it("returns numeric top/left/height without throwing", () => {
    const textarea = makeTextarea("hello @world");
    textarea.setSelectionRange(6, 6);

    const coords = getCaretCoordinates(textarea);

    expect(typeof coords.top).toBe("number");
    expect(typeof coords.left).toBe("number");
    expect(typeof coords.height).toBe("number");
    expect(Number.isNaN(coords.top)).toBe(false);
    expect(Number.isNaN(coords.left)).toBe(false);
  });

  it("defaults to the current selectionEnd when no position is given", () => {
    const textarea = makeTextarea("hello world");
    textarea.setSelectionRange(5, 5);

    expect(() => getCaretCoordinates(textarea)).not.toThrow();
  });

  it("accepts an explicit position, independent of the current selection", () => {
    const textarea = makeTextarea("hello world");
    textarea.setSelectionRange(0, 0);

    expect(() => getCaretCoordinates(textarea, 11)).not.toThrow();
  });

  it("removes its mirror element from the DOM after measuring", () => {
    const textarea = makeTextarea("hello world");
    const before = document.body.children.length;

    getCaretCoordinates(textarea, 5);

    expect(document.body.children.length).toBe(before);
  });

  it("falls back to a positive height even when computed line-height is unavailable", () => {
    const textarea = makeTextarea("x");
    const coords = getCaretCoordinates(textarea, 1);
    expect(coords.height).toBeGreaterThan(0);
  });
});
