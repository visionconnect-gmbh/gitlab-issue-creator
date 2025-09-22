import { LocalizeKeys, CacheKeys, MessageTypes } from "../../../utils/Enums.js";
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

export function handleAttachmentButtonClick() {
  elements.attachmentSelectorBackdrop.style.display = "flex";
  createAttachmentList(messageData?.attachments || []);
}

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

function sendCreateIssueMessage(description) {
  return browser.runtime.sendMessage({
    type: MessageTypes.CREATE_GITLAB_ISSUE,
    projectId: selectedProjectId,
    assignee: selectedAssigneeId || null,
    endDate: selectedIssueEndDate,
    title: elements.issueTitle.value,
    description,
  });
}

export async function getAttachmentFile(messageId, partName) {
  if(!messageId || messageId === -1) return null;

  return await browser.messages.getAttachmentFile(messageId, partName);
}
