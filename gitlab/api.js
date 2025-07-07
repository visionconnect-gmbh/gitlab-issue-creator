// Set a default or ensure this is configured when your addon initializes
let API_BASE_URL = "";

/**
 * Sets the base URL for API requests.
 * @param {string} url The base URL of the API.
 */
export function setApiBaseUrl(url) {
  API_BASE_URL = url;
}

/**
 * Helper to handle fetch responses.
 */
async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || response.statusText);
  }
  // For DELETE requests or others that might not return JSON,
  // we check content type.
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }
  return response.text(); // Or return response directly if no body is expected
}

/**
 * GET request.
 */
export async function apiGet(endpoint, options = {}) {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  return handleResponse(res);
}

/**
 * POST request.
 */
export async function apiPost(endpoint, data, options = {}) {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(res);
}

/**
 * PUT request.
 */
export async function apiPut(endpoint, data, options = {}) {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(res);
}

/**
 * DELETE request.
 */
export async function apiDelete(endpoint, options = {}) {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  return handleResponse(res);
}
