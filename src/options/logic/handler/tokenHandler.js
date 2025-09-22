import { DOM, state, SVG_PATH } from "../optionsState.js";
import { localizeHtmlPage } from "../../../utils/localize.js";

/**
 * Toggles GitLab token input visibility.
 */
export const toggleTokenVisibility = () => {
  state.isTokenVisible = !state.isTokenVisible;
  DOM.tokenInput.type = state.isTokenVisible ? "text" : "password";
  DOM.eyeIcon.setAttribute(
    "d",
    state.isTokenVisible ? SVG_PATH.EYE_OPEN : SVG_PATH.EYE_CLOSED
  );
};

/**
 * Shows or hides the token help link based on URL and token.
 * @param {string} gitlabUrl
 * @param {string} gitlabToken
 */
export const showTokenHelpLink = (gitlabUrl, gitlabToken) => {
  const anchor = DOM.tokenHelpLink.querySelector("a");
  if (!anchor) return console.error("Token help link anchor missing.");
  if (gitlabUrl && !gitlabToken) {
    if (!gitlabUrl.endsWith("/")) gitlabUrl += "/";
    anchor.href = `${gitlabUrl}-/user_settings/personal_access_tokens`;
    DOM.tokenHelpLink.hidden = false;
    localizeHtmlPage();
  } else {
    DOM.tokenHelpLink.hidden = true;
  }
};
