/**
 * @fileoverview A single reusable searchable-multiselect modal, shared by
 * the attachment picker and the label picker: both are "search, then
 * check a few items from a list," just with a different data source and
 * (for attachments only) drag-and-drop enabled per row.
 *
 * DOM-owning but configuration-driven: `open(config)` swaps in a new data
 * source and render callbacks; the modal itself knows nothing about
 * attachments or labels specifically. Only one instance exists for the
 * whole popup (there's never more than one open at a time), so this is a
 * singleton factory, not a reusable class, in the same spirit as
 * `uploadRegistry.js`'s dependency-injected factory.
 */

/**
 * @param {{ backdrop: HTMLElement, titleEl: HTMLElement, searchInput: HTMLInputElement, hintEl: HTMLElement, list: HTMLElement, closeBtn: HTMLElement, actionBtn: HTMLElement }} elements
 */
export function createPickerModal({
  backdrop,
  titleEl,
  searchInput,
  hintEl,
  list,
  closeBtn,
  actionBtn,
}) {
  /** @type {object|null} */
  let config = null;

  /** Restores the modal after a drag. Also called by `render`, because
   * re-rendering removes the source row, whose `dragend` then never fires. */
  function endDrag() {
    backdrop.classList.remove("drag-active");
  }

  function render() {
    endDrag();
    if (!config) return;

    const query = searchInput.value.trim().toLowerCase();
    const filtered = query
      ? config.items.filter((item) => config.getLabel(item).toLowerCase().includes(query))
      : config.items;

    list.replaceChildren();

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "picker-empty";
      empty.textContent = config.emptyText ?? "No results.";
      list.appendChild(empty);
      return;
    }

    for (const item of filtered) list.appendChild(buildRow(item));
  }

  function buildRow(item) {
    const row = document.createElement("div");
    row.className = "picker-item";
    row.dataset.itemId = String(config.getId(item));

    if (config.draggable) {
      row.draggable = true;
      row.addEventListener("dragstart", (e) => {
        const payload = JSON.stringify(config.getDragPayload(item));
        e.dataTransfer.setData("application/x-gitlab-attachment", payload);
        e.dataTransfer.setData("text/plain", config.getLabel(item));
        e.dataTransfer.effectAllowed = "copyMove";
        // Deferred: changing the layout inside dragstart cancels the drag in
        // some engines.
        setTimeout(() => backdrop.classList.add("drag-active"), 0);
      });
      row.addEventListener("dragend", endDrag);
    }

    if (config.getColor) {
      const swatch = document.createElement("span");
      swatch.className = "picker-item-color";
      swatch.style.backgroundColor = config.getColor(item) || "transparent";
      row.appendChild(swatch);
    }

    const checkboxId = `picker-item-${config.getId(item)}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = checkboxId;
    checkbox.checked = config.isSelected(item);
    checkbox.addEventListener("change", () => config.onToggle(item, checkbox.checked));

    const label = document.createElement("label");
    label.htmlFor = checkboxId;
    label.className = "picker-item-label";
    label.textContent = config.getLabel(item);
    label.title = config.getLabel(item);

    row.append(checkbox, label);
    return row;
  }

  /**
   * @param {object} newConfig
   * @param {string} newConfig.title
   * @param {object[]} newConfig.items
   * @param {(item: object) => string|number} newConfig.getId
   * @param {(item: object) => string} newConfig.getLabel
   * @param {(item: object) => string} [newConfig.getColor]
   * @param {(item: object) => boolean} newConfig.isSelected
   * @param {(item: object, checked: boolean) => void} newConfig.onToggle
   * @param {boolean} [newConfig.draggable]
   * @param {(item: object) => object} [newConfig.getDragPayload]
   * @param {string} [newConfig.emptyText]
   * @param {string} [newConfig.hint] - Shows a line of explanatory text between
   *   the search box and the list when set (e.g. explaining drag-and-drop).
   * @param {string} [newConfig.actionLabel] - Shows an extra header button when set.
   * @param {() => void} [newConfig.onAction]
   */
  function open(newConfig) {
    config = newConfig;
    titleEl.textContent = config.title;
    searchInput.value = "";

    actionBtn.hidden = !config.actionLabel;
    actionBtn.textContent = config.actionLabel ?? "";

    hintEl.hidden = !config.hint;
    hintEl.textContent = config.hint ?? "";

    render();
    backdrop.hidden = false;
    document.body.classList.add("modal-open"); // locks the main popup from scrolling behind it
    searchInput.focus();
  }

  function close() {
    backdrop.hidden = true;
    document.body.classList.remove("modal-open");
    config = null;
  }

  searchInput.addEventListener("input", render);
  closeBtn.addEventListener("click", close);
  actionBtn.addEventListener("click", () => config?.onAction?.());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) close();
  });

  return { open, close, refresh: render, list };
}
