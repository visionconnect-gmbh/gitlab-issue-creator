export async function localizeHtmlPage() {
  // Localize inner text
  document.querySelectorAll("[data-message=localize]").forEach((obj) => {
    const valStrH = obj.innerHTML.toString();
    const valNewH = valStrH.replace(
      /__MSG_(\w+)__/g,
      (_, v1) => browser.i18n.getMessage(v1) || ""
    );
    if (valNewH !== valStrH) obj.textContent = valNewH;
  });

  // Localize attributes
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const mappings = el.getAttribute("data-i18n-attr").split(";");
    mappings.forEach((pair) => {
      const [attr, msgKey] = pair.split(":").map((s) => s.trim());
      if (attr && msgKey) {
        const msg = browser.i18n.getMessage(msgKey);
        if (msg) el.setAttribute(attr, msg);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", localizeHtmlPage);
