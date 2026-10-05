/** @jest-environment jsdom */
import { buildIcon, ICONS } from "../src/popup/logic/editor/icons.js";

describe("buildIcon", () => {
  it("builds an SVG element with the expected child shapes", () => {
    const svg = buildIcon(ICONS.link);
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.children).toHaveLength(ICONS.link.length);
    expect(svg.querySelectorAll("path")).toHaveLength(2);
  });

  it("uses currentColor so the icon follows the button's text color", () => {
    const svg = buildIcon(ICONS.eye);
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  it("sets text content on elements with an _text attribute, without leaking _text as an actual attribute", () => {
    const svg = buildIcon(ICONS.orderedList);
    const text = svg.querySelector("text");
    expect(text.textContent).toBe("1");
    expect(text.getAttribute("_text")).toBeNull();
  });

  it("is hidden from assistive tech (decorative; the button already has an aria-label)", () => {
    const svg = buildIcon(ICONS.quote);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(Object.keys(ICONS))("builds every defined icon (%s) without throwing", (name) => {
    expect(() => buildIcon(ICONS[name])).not.toThrow();
  });
});
