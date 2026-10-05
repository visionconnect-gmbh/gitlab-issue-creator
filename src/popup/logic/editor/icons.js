/**
 * @fileoverview Tiny inline-SVG icon set for the editor toolbar, built
 * entirely via `document.createElementNS`, no `innerHTML`, consistent with
 * the rest of the project's DOM-construction discipline. Icons use
 * `stroke="currentColor"` so they follow the button's text color (and so
 * theme/dark-mode) automatically.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @param {Array<[string, Record<string, string|number>]>} elements
 *   `[tagName, attrs]` pairs; an `_text` attr sets the element's text content.
 * @returns {SVGSVGElement}
 */
export function buildIcon(elements) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("md-icon");

  for (const [tag, attrs] of elements) {
    const el = document.createElementNS(SVG_NS, tag);
    const { _text, ...rest } = attrs;
    for (const [key, value] of Object.entries(rest)) {
      el.setAttribute(key, String(value));
    }
    if (_text !== undefined) el.textContent = _text;
    svg.appendChild(el);
  }
  return svg;
}

const numeral = (x, y, text) => [
  "text",
  { x, y, "font-size": 6, stroke: "none", fill: "currentColor", _text: text },
];

export const ICONS = {
  quote: [
    ["path", { d: "M5 9c0-2.2 1.3-3.6 3-4v1.3c-1 .4-1.6 1.2-1.6 2.2H8v3.5H5V9z" }],
    ["path", { d: "M12 9c0-2.2 1.3-3.6 3-4v1.3c-1 .4-1.6 1.2-1.6 2.2H15v3.5h-3V9z" }],
  ],
  unorderedList: [
    ["circle", { cx: 3, cy: 5, r: 1, fill: "currentColor", stroke: "none" }],
    ["line", { x1: 7, y1: 5, x2: 17, y2: 5 }],
    ["circle", { cx: 3, cy: 10, r: 1, fill: "currentColor", stroke: "none" }],
    ["line", { x1: 7, y1: 10, x2: 17, y2: 10 }],
    ["circle", { cx: 3, cy: 15, r: 1, fill: "currentColor", stroke: "none" }],
    ["line", { x1: 7, y1: 15, x2: 17, y2: 15 }],
  ],
  orderedList: [
    numeral(1, 7, "1"),
    ["line", { x1: 7, y1: 5, x2: 17, y2: 5 }],
    numeral(1, 12, "2"),
    ["line", { x1: 7, y1: 10, x2: 17, y2: 10 }],
    numeral(1, 17, "3"),
    ["line", { x1: 7, y1: 15, x2: 17, y2: 15 }],
  ],
  link: [
    ["path", { d: "M8 12a3 3 0 0 0 4.2.3l2-2a3 3 0 1 0-4.2-4.2l-1 1" }],
    ["path", { d: "M12 8a3 3 0 0 0-4.2-.3l-2 2a3 3 0 1 0 4.2 4.2l1-1" }],
  ],
  image: [
    ["rect", { x: 3, y: 3, width: 14, height: 14, rx: 2 }],
    ["circle", { cx: 7.5, cy: 7.5, r: 1.3, fill: "currentColor", stroke: "none" }],
    ["path", { d: "M3 14l4.5-4.5a2 2 0 0 1 2.8 0L15 14" }],
  ],
  eye: [
    ["path", { d: "M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" }],
    ["circle", { cx: 10, cy: 10, r: 2.3 }],
  ],
  expand: [
    ["path", { d: "M7 3H3v4" }],
    ["path", { d: "M13 3h4v4" }],
    ["path", { d: "M7 17H3v-4" }],
    ["path", { d: "M13 17h4v-4" }],
  ],
  at: [
    ["circle", { cx: 10, cy: 10.5, r: 3.2 }],
    ["path", { d: "M13.2 10.5V12a2.2 2.2 0 0 0 4.4 0V10a7.6 7.6 0 1 0-3 6.1" }],
  ],
  check: [["polyline", { points: "4,10 8,14 16,5" }]],
  close: [
    ["line", { x1: 5, y1: 5, x2: 15, y2: 15 }],
    ["line", { x1: 15, y1: 5, x2: 5, y2: 15 }],
  ],
};
