import { CacheKeys, LocalizeKeys } from "../../../utils/Enums.js";
import { getSetting } from "../../../utils/cache.js";
import {
  resetState,
  setIsAssigneeLoadingEnabled,
  isAssigneeLoadingEnabled,
  elements,
} from "../popupState.js";
import { evaluateGates } from "../gates.js";

/** Resets the issue editor to its initial state.
 * Clears all input fields, resets selections, and reloads cached settings.
 * Disables the assignee select if no assignees are found. Every
 * project-dependent control's gate (Labels button, Create button, Assignee
 * select) closes itself here since resetState() clears selectedProjectId:
 * see projectHandler.js's gate definitions and its commitSelection/
 * clearSelection, which reopen them once a project is actually selected.
 */
export async function resetEditor() {
  resetState();
  evaluateGates();

  const enableAssigneeLoading = await getSetting(
    CacheKeys.ASSIGNEES_LOADING,
    true,
  );
  setIsAssigneeLoadingEnabled(enableAssigneeLoading);

  const noAssigneesFoundMessage =
    browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.NO_ASSIGNEES_FOUND) ||
    "No assignees found.";

  const option = document.createElement("option");
  option.textContent = noAssigneesFoundMessage;

  elements.assigneeSelect.replaceChildren(option);
  elements.assigneeSelect.disabled = true;
}
