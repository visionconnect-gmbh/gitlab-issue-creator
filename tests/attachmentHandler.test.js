/**
 * @fileoverview Unit tests for src/email/handler/attachmentHandler.js
 */

import {
  findAttachmentParts,
  ALLOWED_ATTACHMENT_TYPES,
} from "../src/email/handler/attachmentHandler.js";

describe("ALLOWED_ATTACHMENT_TYPES", () => {
  test("includes common document and image types", () => {
    expect(ALLOWED_ATTACHMENT_TYPES).toContain("application/pdf");
    expect(ALLOWED_ATTACHMENT_TYPES).toContain("image/jpeg");
    expect(ALLOWED_ATTACHMENT_TYPES).toContain("image/png");
  });
});

describe("findAttachmentParts", () => {
  test("returns empty array for empty parts", () => {
    expect(findAttachmentParts([])).toEqual([]);
  });

  test("finds a top-level attachment", () => {
    const parts = [
      {
        contentType: "application/pdf",
        name: "invoice.pdf",
        size: 1234,
        partName: "2",
      },
    ];
    const attachments = findAttachmentParts(parts);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe("invoice.pdf");
    expect(attachments[0].contentType).toBe("application/pdf");
  });

  test("ignores parts with disallowed content types", () => {
    const parts = [
      { contentType: "text/html", name: "page.html", size: 100, partName: "1" },
      { contentType: "image/png", name: "logo.png", size: 200, partName: "2" },
    ];
    const attachments = findAttachmentParts(parts);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe("logo.png");
  });

  test("ignores parts without a name", () => {
    const parts = [
      { contentType: "application/pdf", name: undefined, size: 100, partName: "1" },
    ];
    expect(findAttachmentParts(parts)).toHaveLength(0);
  });

  test("recursively finds nested attachments", () => {
    const parts = [
      {
        contentType: "multipart/mixed",
        parts: [
          { contentType: "text/plain", body: "hello", name: undefined },
          { contentType: "image/jpeg", name: "photo.jpg", size: 5000, partName: "1.2" },
        ],
      },
    ];
    const attachments = findAttachmentParts(parts);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe("photo.jpg");
  });

  test("returns correct shape for each attachment", () => {
    const parts = [
      { contentType: "image/png", name: "img.png", size: 42, partName: "3" },
    ];
    const [att] = findAttachmentParts(parts);
    expect(att).toMatchObject({
      name: "img.png",
      contentType: "image/png",
      size: 42,
      partName: "3",
    });
  });
});
