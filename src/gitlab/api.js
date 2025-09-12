import { getCache } from "../utils/cache";
import { LocalizeKeys, CacheKeys } from "../utils/Enums";
import {
  closePopup,
  displayLocalizedNotification,
  openOptionsPage,
} from "../utils/utils";

let API_BASE_URL = null;

async function handleResponse(response) {
  if (!response) {
    return null;
  }
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || response.statusText);
  }

  return response.json();
}

export async function doRequest(endpoint, options = {}, addContentType = true) {
  if (!API_BASE_URL) {
    const settings = await getCache(CacheKeys.GITLAB_SETTINGS, undefined, {});
    API_BASE_URL = settings.url;

    if (!API_BASE_URL) {
      displayLocalizedNotification(
        LocalizeKeys.NOTIFICATION.GITLAB_URL_NOT_CONFIGURED
      );
      openOptionsPage();
      closePopup();
      return;
    }
  }

  const headers = {
    ...(addContentType ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      displayLocalizedNotification(
        LocalizeKeys.NOTIFICATION.INVALID_GITLAB_TOKEN
      );
      openOptionsPage();
      closePopup();
      return;
    }
    const error = await res.text();
    throw new Error(error || res.statusText);
  }

  return res;
}

export async function apiGet(endpoint, options = {}) {
  const res = await doRequest(endpoint, { method: "GET", ...options });
  return handleResponse(res);
}

export async function apiPost(endpoint, data, options = {}) {
  const res = await doRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(res);
}

export async function apiPut(endpoint, data, options = {}) {
  const res = await doRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(res);
}

export async function apiDelete(endpoint, options = {}) {
  const res = await doRequest(endpoint, {
    method: "DELETE",
    ...options,
  });
  return handleResponse(res);
}
