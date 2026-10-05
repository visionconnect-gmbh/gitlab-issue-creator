import { LocalizeKeys, CacheKeys, MessageTypes, Popup_MessageTypes } from "../../../utils/Enums.js";
import { displayLocalizedNotification, getAddonVersion } from "../../../utils/utils.js";
import { getSetting } from "../../../utils/cache.js";
import {
  editor,
  messageData,
  selectedProjectId,
  selectedAssigneeId,
  issueEndDate as selectedIssueEndDate,
  selectedLabels,
  setSelectedLabels,
  labelsCache,
  elements,
  uploadRegistry,
} from "../popupState.js";
import {
  openAttachmentPicker,
  openLabelPicker,
  showButtonLoadingState,
  hideCreateError,
} from "../ui.js";
import { generateBaseDescription } from "./descriptionHandler.js";

/** Handles the click event on the attachment button: opens the shared
 * picker modal configured for the email's attachments.
 */
export function handleAttachmentButtonClick() {
  openAttachmentPicker(messageData?.attachments || []);
}

/** Handles the click event on the labels button: opens the shared picker
 * modal configured for the committed project's labels. Does nothing
 * (rather than opening an empty picker) when no project is selected yet.
 */
export function handleLabelsButtonClick() {
  if (!selectedProjectId) {
    displayLocalizedNotification(LocalizeKeys.NOTIFICATION.NO_PROJECT_SELECTED);
    return;
  }

  const cached = labelsCache[selectedProjectId];
  const labels = cached?.labels ?? [];
  const emptyText =
    cached?.status === "error"
      ? browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.LABELS_LOAD_ERROR) ||
        "(Could not load labels; reselect the project to retry)"
      : undefined;

  openLabelPicker(labels, selectedLabels, (label, checked) => {
    setSelectedLabels(
      checked
        ? [...selectedLabels, label]
        : selectedLabels.filter((l) => l.id !== label.id),
    );
  }, emptyText);
}

/** Handles the click event on the create issue button.
 * Validates the selected project and prepares the issue description.
 * Sends a message to create the issue and shows a loading state.
 */
export async function handleCreateButtonClick() {
  hideCreateError(); // clear any previous attempt's error before this one runs

  if (!selectedProjectId) {
    return displayLocalizedNotification(
      LocalizeKeys.NOTIFICATION.NO_PROJECT_SELECTED
    );
  }

  // Run any pending/in-flight uploads (and project migrations) to
  // completion before reading the description, otherwise the issue could
  // be created with an unresolved `pending-upload:` placeholder still in it.
  await uploadRegistry.flush();
  if (uploadRegistry.hasUnresolved()) {
    return displayLocalizedNotification(
      LocalizeKeys.NOTIFICATION.UPLOAD_ATTACHMENT_ERROR
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

/** Generates the issue description, with the watermark appended if
 * enabled. Attachments need no assembly here: they're already inline in
 * the editor text (placeholder swapped for real markdown by
 * `uploadRegistry` as each upload resolves), exactly like local images.
 * @returns {Promise<string>} The complete issue description.
 */
async function createTicketDescription() {
  let description = editor.value().trim() || generateBaseDescription();

  if (await getSetting(CacheKeys.ENABLE_WATERMARK, true)) {
    const WATERMARK = `created with gitlab-issue-creator (${await getAddonVersion()})`;
    description += `\n\n<!-- ${WATERMARK} -->`;
  }

  return description.trim();
}

/** Retrieves the attachment file or displays a notification if not found.
 * @param {Object} attachment - The attachment object.
 * @returns {Promise<File|null>} The attachment file or null if not found.
 */
export async function getAttachmentFileOrNotify(attachment) {
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
    labels: selectedLabels.map((l) => l.name),
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
