/** @jest-environment jsdom */
/**
 * @fileoverview Unit tests for src/popup/logic/pickerModal.js: the shared
 * searchable-multiselect modal behind both the attachment and label pickers.
 */
import { jest } from "@jest/globals";
import { createPickerModal } from "../src/popup/logic/pickerModal.js";

function buildDom() {
  document.body.innerHTML = `
    <div id="picker-backdrop" hidden>
      <div id="picker-container">
        <div class="picker-header">
          <h2 id="picker-title"></h2>
          <button id="picker-close">&times;</button>
        </div>
        <input type="search" id="picker-search" />
        <p id="picker-hint" hidden></p>
        <button id="picker-action" hidden></button>
        <div id="picker-list"></div>
      </div>
    </div>
  `;

  return {
    backdrop: document.getElementById("picker-backdrop"),
    container: document.getElementById("picker-container"),
    titleEl: document.getElementById("picker-title"),
    searchInput: document.getElementById("picker-search"),
    hintEl: document.getElementById("picker-hint"),
    list: document.getElementById("picker-list"),
    closeBtn: document.getElementById("picker-close"),
    actionBtn: document.getElementById("picker-action"),
  };
}

function rows() {
  return [...document.querySelectorAll(".picker-item")];
}

describe("pickerModal", () => {
  test("open() renders every item, titles the modal, and un-hides the backdrop", () => {
    const els = buildDom();
    const modal = createPickerModal(els);

    modal.open({
      title: "Attachments",
      items: [{ id: "1", name: "a.png" }, { id: "2", name: "b.png" }],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
    });

    expect(els.titleEl.textContent).toBe("Attachments");
    expect(els.backdrop.hidden).toBe(false);
    expect(rows()).toHaveLength(2);
  });

  test("search filters the rendered items by label, case-insensitively", () => {
    const els = buildDom();
    const modal = createPickerModal(els);

    modal.open({
      title: "Labels",
      items: [{ id: 1, name: "Bug" }, { id: 2, name: "Documentation" }],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
    });

    els.searchInput.value = "doc";
    els.searchInput.dispatchEvent(new Event("input"));

    expect(rows()).toHaveLength(1);
    expect(rows()[0].dataset.itemId).toBe("2");
  });

  test("shows emptyText when nothing matches", () => {
    const els = buildDom();
    const modal = createPickerModal(els);

    modal.open({
      title: "Labels",
      items: [{ id: 1, name: "Bug" }],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
      emptyText: "Nothing here",
    });

    els.searchInput.value = "nope";
    els.searchInput.dispatchEvent(new Event("input"));

    expect(els.list.textContent).toBe("Nothing here");
    expect(rows()).toHaveLength(0);
  });

  test("each row gets a stable data-item-id, independent of rendering order", () => {
    const els = buildDom();
    const modal = createPickerModal(els);

    modal.open({
      title: "Attachments",
      items: [{ id: "a.partName", name: "a.png" }],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
    });

    expect(rows()[0].dataset.itemId).toBe("a.partName");
  });

  test("checkbox state reflects isSelected(), and toggling calls onToggle with the item and new state", () => {
    const els = buildDom();
    const modal = createPickerModal(els);
    const onToggle = jest.fn();
    const item = { id: 1, name: "Bug" };

    modal.open({
      title: "Labels",
      items: [item],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: (i) => i.id === 1,
      onToggle,
    });

    const checkbox = rows()[0].querySelector("input[type=checkbox]");
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));

    expect(onToggle).toHaveBeenCalledWith(item, false);
  });

  test("rows are draggable only when draggable: true is configured", () => {
    const els = buildDom();
    const modal = createPickerModal(els);

    modal.open({
      title: "Labels",
      items: [{ id: 1, name: "Bug" }],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
      draggable: false,
    });
    expect(rows()[0].draggable).toBe(false);

    modal.open({
      title: "Attachments",
      items: [{ partName: "1.2", name: "a.pdf" }],
      getId: (i) => i.partName,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
      draggable: true,
      getDragPayload: (i) => ({ partName: i.partName }),
    });
    expect(rows()[0].draggable).toBe(true);
  });

  test("closes on the close button, backdrop click, and Escape", () => {
    const els = buildDom();
    const modal = createPickerModal(els);
    const openConfig = {
      title: "Labels",
      items: [],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
    };

    modal.open(openConfig);
    els.closeBtn.click();
    expect(els.backdrop.hidden).toBe(true);

    modal.open(openConfig);
    els.backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(els.backdrop.hidden).toBe(true);

    modal.open(openConfig);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(els.backdrop.hidden).toBe(true);
  });

  test("a click inside the container does not close the modal", () => {
    const els = buildDom();
    const modal = createPickerModal(els);

    modal.open({
      title: "Labels",
      items: [],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
    });

    els.container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(els.backdrop.hidden).toBe(false);
  });

  test("the action button is hidden by default and shown only when actionLabel is configured", () => {
    const els = buildDom();
    const modal = createPickerModal(els);
    const onAction = jest.fn();

    modal.open({
      title: "Labels",
      items: [],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
    });
    expect(els.actionBtn.hidden).toBe(true);

    modal.open({
      title: "Attachments",
      items: [],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
      actionLabel: "Load previews",
      onAction,
    });
    expect(els.actionBtn.hidden).toBe(false);
    expect(els.actionBtn.textContent).toBe("Load previews");

    els.actionBtn.click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test("the hint line is hidden by default and shown only when hint is configured", () => {
    const els = buildDom();
    const modal = createPickerModal(els);

    modal.open({
      title: "Labels",
      items: [],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
    });
    expect(els.hintEl.hidden).toBe(true);

    modal.open({
      title: "Attachments",
      items: [],
      getId: (i) => i.id,
      getLabel: (i) => i.name,
      isSelected: () => false,
      onToggle: jest.fn(),
      hint: "Drag an attachment onto the description to place it.",
    });
    expect(els.hintEl.hidden).toBe(false);
    expect(els.hintEl.textContent).toBe("Drag an attachment onto the description to place it.");
  });

  describe("drag in progress", () => {
    function openDraggable(els) {
      const modal = createPickerModal(els);
      modal.open({
        title: "Attachments",
        items: [{ partName: "1.2", name: "a.png" }],
        getId: (i) => i.partName,
        getLabel: (i) => i.name,
        isSelected: () => false,
        onToggle: jest.fn(),
        draggable: true,
        getDragPayload: (i) => ({ partName: i.partName }),
      });
      return modal;
    }

    function startDrag() {
      const event = new Event("dragstart", { bubbles: true });
      event.dataTransfer = { setData: jest.fn(), effectAllowed: "" };
      rows()[0].dispatchEvent(event);
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("the modal becomes click-through after dragstart and is restored on dragend", () => {
      const els = buildDom();
      openDraggable(els);

      startDrag();
      expect(els.backdrop.classList.contains("drag-active")).toBe(false);
      jest.runAllTimers();
      expect(els.backdrop.classList.contains("drag-active")).toBe(true);

      rows()[0].dispatchEvent(new Event("dragend", { bubbles: true }));
      expect(els.backdrop.classList.contains("drag-active")).toBe(false);
    });

    test("refreshing the list ends a drag whose source row was removed", () => {
      const els = buildDom();
      const modal = openDraggable(els);

      startDrag();
      jest.runAllTimers();
      modal.refresh();

      expect(els.backdrop.classList.contains("drag-active")).toBe(false);
    });
  });
});
