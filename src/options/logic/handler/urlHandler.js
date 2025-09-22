/**
 * Validates and normalizes a URL string.
 * Defaults to https:// if no protocol.
 * @param {string} url
 * @returns {string|false}
 */
export const normalizeUrl = (url) => {
  const trimmed = url.trim();
  const pattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/;
  if (!pattern.test(trimmed)) return false;

  try {
    const parsed = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );
    if (["http:", "https:"].includes(parsed.protocol) && !!parsed.hostname) {
      return parsed.href.replace(/\/$/, "");
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * Checks if a URL's origin is reachable by loading its favicon.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export const isUrlReachable = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = "";
      resolve(false);
    }, 3000);
    img.onload = img.onerror = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    try {
      const origin = new URL(url).origin;
      img.src = `${origin}/favicon.ico`;
    } catch {
      resolve(false);
    }
  });
