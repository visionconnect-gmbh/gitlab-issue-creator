let API_BASE_URL = null;
/*
 * Set the base URL for the GitLab API.
 * This should be called before making any API requests.
 * The URL should not end with a slash.
 */
export function setApiBaseUrl(url) {
  if (!url) {
    throw new Error("API base URL cannot be empty");
  }
  API_BASE_URL = url.endsWith("/") ? url.slice(0, -1) : url;
}

async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || response.statusText);
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function doRequest(endpoint, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("API base URL is not set. Call setApiBaseUrl() first.");
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
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
