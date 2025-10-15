export const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

/** Recursively finds attachment parts in the email parts structure.
 * @param {Array} parts - The array of email parts to search.
 * @returns {Array} An array of attachment objects with name, contentType, size, and partName.
 */
export function findAttachmentParts(parts) {
  const attachments = [];
  for (const part of parts) {
    if (
      part.contentType &&
      ALLOWED_ATTACHMENT_TYPES.includes(part.contentType) &&
      part.name
    ) {
      attachments.push({
        name: part.name || `Attachment ${attachments.length + 1}`,
        contentType: part.contentType,
        size: part.size,
        partName: part.partName,
      });
    }
    if (part.parts) {
      attachments.push(...findAttachmentParts(part.parts));
    }
  }
  return attachments;
}
