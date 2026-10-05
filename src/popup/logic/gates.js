/** @fileoverview A small declarative gate registry: each feature/control
 * that should only be shown or enabled once some condition holds registers
 * itself once with `defineGate`, instead of handler code manually calling a
 * bespoke show/hide function at every place that condition could change.
 * Call `evaluateGates()` after any state change a gate's `when` might read.
 */

const gates = [];

/**
 * @param {Object} config
 * @param {HTMLElement} config.element - The gated element.
 * @param {"hidden"|"disabled"|"display"} config.mode - "hidden" toggles the
 *   `hidden` property; "disabled" toggles `disabled`; "display" toggles
 *   `style.display` for an element that can't use `hidden` directly (e.g. a
 *   flex/grid child whose own display value matters).
 * @param {() => boolean} config.when - Re-evaluated on every
 *   `evaluateGates()` call; the element is only shown/enabled while this
 *   returns true.
 * @param {string} [config.displayValue] - The `style.display` value to use
 *   when `mode` is "display" and `when()` is true. Defaults to "block".
 */
export function defineGate({ element, mode, when, displayValue = "block" }) {
  gates.push({ element, mode, when, displayValue });
}

/** Re-applies every registered gate's current condition. Safe to call
 * liberally after any state change, it's just a handful of boolean checks. */
export function evaluateGates() {
  for (const gate of gates) {
    const ok = gate.when();
    switch (gate.mode) {
      case "hidden":
        gate.element.hidden = !ok;
        break;
      case "disabled":
        gate.element.disabled = !ok;
        break;
      case "display":
        gate.element.style.display = ok ? gate.displayValue : "none";
        break;
    }
  }
}
