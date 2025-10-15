import { LocalizeKeys, CacheKeys, MessageTypes, Popup_MessageTypes } from "../../../utils/Enums.js";
import { displayLocalizedNotification, getAddonVersion } from "../../../utils/utils.js";
import { getCache } from "../../../utils/cache.js";
import { uploadAttachmentToGitLab } from "../../../gitlab/gitlab.js";
import {
  easyMDE,
  messageData,
  selectedProjectId,
  selectedAssigneeId,
  issueEndDate as selectedIssueEndDate,
  selectedAttachments,
  elements,
} from "../popupState.js";
import { createAttachmentList, showButtonLoadingState } from "../ui.js";
import { generateBaseDescription } from "./descriptionHandler.js";

/** Handles the click event on the attachment button.
 * Displays the attachment selector backdrop and creates the attachment list.
 */
export function handleAttachmentButtonClick() {
  elements.attachmentSelectorBackdrop.style.display = "flex";
  createAttachmentList(messageData?.attachments || []);
}

/** Handles the click event on the create issue button.
 * Validates the selected project and prepares the issue description.
 * Sends a message to create the issue and shows a loading state.
 */
export async function handleCreateButtonClick() {
  if (!selectedProjectId) {
    return displayLocalizedNotification(
      LocalizeKeys.NOTIFICATION.NO_PROJECT_SELECTED
    );
  }

  try {
    const description = await createTicketDescription();
    await sendCreateIssueMessage(description);
    showButtonLoadingState();
  } catch (error) {
    console.error("Ticket creation failed:", error);
  }
}

/** Generates the issue description including attachments and watermark if enabled.
 * @returns {Promise<string>} The complete issue description.
 */
async function createTicketDescription() {
  let description = easyMDE.value().trim() || generateBaseDescription();

  // Always strip out the internal [attachments] preview block if present
  description = description.replace(
    /\n*\[attachments\][\s\S]*?\[\/attachments\]\s*/m,
    ""
  );

  if (selectedAttachments.length > 0) {
    const ticketAttachmentsTitle =
      browser.i18n.getMessage(LocalizeKeys.ISSUE.ATTACHMENTS_TITLE) ||
      "Attachments";

    description += `\n\n**${ticketAttachmentsTitle}:**\n\n`;
    description += await generateAttachmentsMarkdown(selectedAttachments);
  }

  if (await getCache(CacheKeys.ENABLE_WATERMARK, undefined, true)) {
    const WATERMARK = `created with gitlab-issue-creator (${await getAddonVersion()})`;
    description += `\n\n<!-- ${WATERMARK} -->`;
  }

  return description.trim();
}

/** Generates the Markdown for the selected attachments.
 * Uploads each attachment to GitLab and formats the links in Markdown.
 * @returns {Promise<string>} The Markdown string for the attachments.
 */
async function generateAttachmentsMarkdown() {
  const lines = [];

  for (const attachment of selectedAttachments) {
    try {
      const file = await getAttachmentFileOrNotify(attachment);
      if (!file) {
        console.warn(`Attachment file ${attachment.name} not found`);
        continue; // skip instead of throwing
      }

      const uploadResult = await uploadAttachmentOrNotify(file, attachment.name);

      if (uploadResult?.markdown) {
        // Use bullet list formatting for cleaner Markdown
        lines.push(`- **${attachment.name}**\n\n  ${uploadResult.markdown}`);
      }
    } catch (err) {
      console.error(`Failed to handle attachment ${attachment.name}:`, err);
    }
  }

  return lines.join("\n\n");
}

/** Retrieves the attachment file or displays a notification if not found.
 * @param {Object} attachment - The attachment object.
 * @returns {Promise<File|null>} The attachment file or null if not found.
 */
async function getAttachmentFileOrNotify(attachment) {
  try {
    const file = await getAttachmentFile(
      messageData?.id || -1,
      attachment.partName || attachment.name
    );
    if (!(file instanceof File)) {
      displayLocalizedNotification(
        LocalizeKeys.NOTIFICATION.ATTACHMENT_NOT_FOUND
      );
      return null;
    }
    return file;
  } catch (error) {
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.GENERIC_ERROR);
    return null;
  }
}

/** Uploads the attachment to GitLab or displays a notification on failure.
 * @param {File} file - The attachment file to upload.
 * @param {string} attachmentName - The name of the attachment for error messages.
 * @returns {Promise<Object>} The upload result from GitLab.
 */
async function uploadAttachmentOrNotify(file, attachmentName) {
  try {
    return await uploadAttachmentToGitLab(selectedProjectId, file);
  } catch (error) {
    console.error(`Error uploading attachment ${attachmentName}:`, error);
    displayLocalizedNotification(
      LocalizeKeys.NOTIFICATION.UPLOAD_ATTACHMENT_ERROR
    );
    throw error;
  }
}

/** Sends a message to the background script to create a GitLab issue.
 * @param {string} description - The complete issue description.
 * @returns {Promise<any>} The response from the background script.
 */
function sendCreateIssueMessage(description) {
  return browser.runtime.sendMessage({
    type: Popup_MessageTypes.CREATE_GITLAB_ISSUE,
    projectId: selectedProjectId,
    assignee: selectedAssigneeId || null,
    endDate: selectedIssueEndDate,
    title: elements.issueTitle.value,
    description,
  });
}

/** Retrieves the attachment file from the message by ID and part name.
 * @param {number} messageId - The ID of the message containing the attachment.
 * @param {string} partName - The part name of the attachment to retrieve.
 * @returns {Promise<File|null>} The attachment file or null if not found.
 */
export async function getAttachmentFile(messageId, partName) {
  if(!messageId || messageId === -1) return null;

  return await browser.messages.getAttachmentFile(messageId, partName);
}
