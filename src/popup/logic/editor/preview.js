/**
 * @fileoverview Renders a parsed Markdown Block[] (see markdown.js) into DOM
 * nodes. The only security rule that matters here: every node is built with
 * `document.createElement` and text is set via `textContent`: never
 * `innerHTML` / `insertAdjacentHTML`. Images are never loaded as `<img src>`
 * (the source Markdown can come from an email body); they render as a
 * placeholder with the alt text, which also removes the tracking-pixel
 * vector mail clients normally have to guard against separately.
 */

/**
 * @param {Array<object>} blocks
 * @param {HTMLElement} container
 */
export function renderBlocks(blocks, container) {
  container.replaceChildren();
  for (const block of blocks) {
    container.appendChild(renderBlock(block));
  }
}

function renderBlock(block) {
  switch (block.type) {
    case "heading": {
      const el = document.createElement(`h${Math.min(Math.max(block.level, 1), 6)}`);
      appendInline(el, block.inline);
      return el;
    }
    case "quote": {
      const el = document.createElement("blockquote");
      appendInline(el, block.inline);
      return el;
    }
    case "list": {
      const el = document.createElement(block.ordered ? "ol" : "ul");
      for (const item of block.items) {
        const li = document.createElement("li");
        appendInline(li, item);
        el.appendChild(li);
      }
      return el;
    }
    case "code": {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      pre.appendChild(code);
      return pre;
    }
    case "paragraph":
    default: {
      const el = document.createElement("p");
      appendInline(el, block.inline ?? []);
      return el;
    }
  }
}

function appendInline(parent, nodes) {
  for (const node of nodes) {
    parent.appendChild(renderInline(node));
  }
}

function renderInline(node) {
  switch (node.type) {
    case "text":
      return document.createTextNode(node.value);
    case "break":
      return document.createElement("br");
    case "bold": {
      const el = document.createElement("strong");
      appendInline(el, node.children);
      return el;
    }
    case "italic": {
      const el = document.createElement("em");
      appendInline(el, node.children);
      return el;
    }
    case "code": {
      const el = document.createElement("code");
      el.textContent = node.value;
      return el;
    }
    case "link": {
      if (!node.href) {
        // Unsafe/missing URL: render the label as plain text, no anchor.
        const span = document.createElement("span");
        appendInline(span, node.children);
        return span;
      }
      const a = document.createElement("a");
      a.href = node.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      appendInline(a, node.children);
      return a;
    }
    case "image": {
      const span = document.createElement("span");
      span.className = "md-image-placeholder";
      span.textContent = `[${node.alt || "image"}]`;
      if (node.href) span.title = node.href;
      return span;
    }
    default:
      return document.createTextNode("");
  }
}
