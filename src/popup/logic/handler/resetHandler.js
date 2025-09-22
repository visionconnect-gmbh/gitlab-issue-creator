import { CacheKeys, LocalizeKeys } from "../../../utils/Enums.js";
import { getCache } from "../../../utils/cache.js";
import {
  resetState,
  setIsAssigneeLoadingEnabled,
  isAssigneeLoadingEnabled,
  elements,
} from "../popupState.js";
import { updateAssigneeSelectVisibility } from "../ui.js";

export async function resetEditor() {
  resetState();

  const enableAssigneeLoading = await getCache(CacheKeys.ASSIGNEES_LOADING, undefined, false);
  setIsAssigneeLoadingEnabled(enableAssigneeLoading || false);
  updateAssigneeSelectVisibility(isAssigneeLoadingEnabled);

  const noAssigneesFoundMessage =
    browser.i18n.getMessage(LocalizeKeys.POPUP.MESSAGES.NO_ASSIGNEES_FOUND) ||
    "No assignees found.";

  const option = document.createElement("option");
  option.textContent = noAssigneesFoundMessage;

  elements.assigneeSelect.replaceChildren(option);
  elements.assigneeSelect.disabled = true;
}
