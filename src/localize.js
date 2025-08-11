import { LocalizeKeys } from "./Enums";

/**
 * Replaces all text nodes within elements matching a selector using a replacer function.
 * Efficiently traverses using TreeWalker to avoid recursive overhead.
 */
function localizeTextContent(selector, replacer) {
  const elements = document.querySelectorAll(selector);
  for (const el of elements) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const original = node.nodeValue;
      if (!original || !original.trim()) continue;
      const replaced = replacer(original);
      if (replaced !== original) {
        node.nodeValue = replaced;
      }
    }
  }
}

/**
 * Applies localization to attributes based on a "data-i18n-attr" attribute format: "attr1:key1; attr2:key2"
 */
function localizeAttributes(selector, i18n) {
  const elements = document.querySelectorAll(selector);
  for (const el of elements) {
    const mappings = el.getAttribute("data-i18n-attr")?.split(";") ?? [];
    for (const mapping of mappings) {
      const [attr, key] = mapping.split(":").map((s) => s.trim());
      if (!attr || !key) continue;
      const message = i18n.getMessage(key);
      // Only set attribute if translation is non-empty string
      if (message) el.setAttribute(attr, message);
    }
  }
}

/**
 * Localizes the HTML page by replacing placeholder text and attributes using browser.i18n.
 */
export function localizeHtmlPage() {
  const i18n = browser.i18n;

  const replacer = (text) =>
    text.replace(/__MSG_(\w+)__/g, (_, key) =>
      i18n.getMessage(key) ||
      i18n.getMessage(LocalizeKeys.FALLBACK.NO_TRANSLATION) ||
      ""
    );

  localizeTextContent("[data-message=localize]", replacer);
  localizeAttributes("[data-i18n-attr]", i18n);
}
