export async function localizeHtmlPage() {
  const i18n = browser.i18n;

  // Localize inner text
  const messageElements = document.querySelectorAll("[data-message=localize]");
  for (const el of messageElements) {
    const original = el.innerHTML;
    const localized = original.replace(/__MSG_(\w+)__/g, (_, key) => i18n.getMessage(key) || "");
    if (localized !== original) el.innerHTML = localized; // use innerHTML here if replacement includes markup
  }

  // Localize attributes
  const attrElements = document.querySelectorAll("[data-i18n-attr]");
  for (const el of attrElements) {
    const mappings = el.getAttribute("data-i18n-attr")?.split(";") || [];
    for (const mapping of mappings) {
      const [attr, key] = mapping.split(":").map((s) => s.trim());
      if (!attr || !key) continue;
      const msg = i18n.getMessage(key);
      if (msg !== undefined) el.setAttribute(attr, msg);
    }
  }
}
