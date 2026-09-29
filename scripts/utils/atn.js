/**
 * @fileoverview addons.thunderbird.net (ATN) API v4 client.
 *
 * ATN runs an older fork of addons-server. It has no v5 API — the AMO
 * two-step "upload, then create version" flow (`POST /addons/upload/`)
 * returns 404 on ATN. The only write endpoint is the legacy v4 signing API:
 *
 *   PUT /api/v4/addons/{guid}/versions/{version}/
 *
 * which accepts just `upload` (the .xpi) and an optional `channel`. Release
 * notes, descriptions and other listing metadata are NOT writable through
 * this API (verified: `OPTIONS` on the versions endpoints returns only
 * `GET, HEAD, OPTIONS`) — they must be pasted in the developer hub by hand.
 *
 * Docs: https://addons-server.readthedocs.io/en/latest/topics/api/v4_frozen/signing.html
 * Auth: https://mozilla.github.io/addons-server/topics/api/auth.html
 */

import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const API_BASE = "https://addons.thunderbird.net/api/v4";

// Signing tokens must be short-lived; ATN enforces a hard 5 minute cap.
const JWT_LIFETIME_SECONDS = 60;

/**
 * Creates a fresh short-lived JWT for one API request.
 * A new token must be minted per request — reusing one across a slow
 * upload plus retries risks it expiring mid-flight.
 *
 * @param {string} issuer - ATN API key ("iss" claim).
 * @param {string} secret - ATN API secret, used to HMAC-sign the token.
 * @returns {string}
 */
export function createToken(issuer, secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: issuer,
      jti: crypto.randomUUID(),
      iat: issuedAt,
      exp: issuedAt + JWT_LIFETIME_SECONDS,
    },
    secret,
    { algorithm: "HS256" },
  );
}

/**
 * Fetch wrapper that retries only on 429 / 5xx responses and on network
 * errors. A 4xx is returned as-is for the caller to interpret (e.g. 409
 * from the signing PUT means "version already exists" and is a soft
 * success, not an error to retry into).
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} [retries]
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      await backoff(attempt);
      continue;
    }

    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) return res; // caller decides
    if (attempt === retries) return res;

    console.warn(
      `  HTTP ${res.status} from ${url} — retrying (${attempt + 1}/${retries})…`,
    );
    await backoff(attempt);
  }
}

function backoff(attempt) {
  const delayMs = 2000 * (attempt + 1);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Looks up the newest *listed* version already published on ATN for this
 * add-on. Unauthenticated — the versions listing is public.
 *
 * Used to compute the changelog range (last published → HEAD) instead of
 * relying on git tags, which can include tags that were never actually
 * published to the store.
 *
 * @param {string} slug - Add-on slug, e.g. "gitlab-issue-creator".
 * @returns {Promise<string|null>} Version string (e.g. "7.1.1"), or null
 *   if the add-on has no published versions yet.
 */
export async function getLatestPublishedVersion(slug) {
  const url = `${API_BASE}/addons/addon/${encodeURIComponent(slug)}/versions/?page_size=1`;
  const res = await fetchWithRetry(url, {});
  if (!res.ok) {
    throw new Error(`Failed to list versions for "${slug}": HTTP ${res.status}`);
  }
  const data = await res.json();
  const [latest] = data.results ?? [];
  return latest ? latest.version : null;
}

/**
 * Uploads and signs a new version via the v4 signing API.
 *
 * Retried on 429/5xx like any other call: a signing PUT is not generally
 * safe to blindly resend, but it is safe *here* specifically because the
 * caller (publish.js) already treats a resulting 409 ("version already
 * exists") as a soft success rather than an error — so a retry that lands
 * on a request the server actually processed just degrades to that same
 * 409 path instead of failing the whole run. ATN's upload endpoint has
 * been observed to return a transient 502 from its own gateway, which is
 * exactly the case this retry exists for.
 *
 * @param {object} params
 * @param {string} params.guid - The add-on's gecko id (browser_specific_settings.gecko.id).
 * @param {string} params.version - Version being uploaded, e.g. "7.2.0".
 * @param {string} params.xpiPath - Path to the built .xpi/.zip file.
 * @param {string} params.channel - "listed" or "unlisted".
 * @param {string} params.issuer - ATN API key.
 * @param {string} params.secret - ATN API secret.
 * @returns {Promise<{status: number, body: object|null}>}
 */
export async function uploadVersion({ guid, version, xpiPath, channel, issuer, secret }) {
  if (!fs.existsSync(xpiPath)) {
    throw new Error(`Build file not found: ${xpiPath}`);
  }

  const form = new FormData();
  const bytes = await fs.promises.readFile(xpiPath);
  form.set("upload", new Blob([bytes]), xpiPath.split("/").pop());
  form.set("channel", channel);

  const url = `${API_BASE}/addons/${encodeURIComponent(guid)}/versions/${encodeURIComponent(version)}/`;

  // One token is minted up front and reused across every retry attempt
  // below, rather than a fresh one per attempt (unlike getLatestPublishedVersion
  // and pollVersion, which mint per call since they may be called far apart
  // in time). That's fine here: the default retry backoff totals well under
  // 60s, comfortably inside this token's lifetime.
  const authHeader = `JWT ${createToken(issuer, secret)}`;

  const res = await fetchWithRetry(url, {
    method: "PUT",
    headers: { Authorization: authHeader },
    body: form,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (e.g. an HTML error page) — leave body null.
  }

  return { status: res.status, body };
}

/**
 * Polls a version's status until it has been processed, or the timeout
 * elapses. Resolves with the final version payload; the caller inspects
 * `files[0].status` / `automated_signing` to judge outcome.
 *
 * Important: for *listed* versions, automated validation and human review
 * are separate stages. This only waits for automated processing —
 * subsequent human review can take much longer than any reasonable CI
 * timeout, so a validated-but-not-yet-reviewed version must be treated as
 * a successful upload, not a failure.
 *
 * @param {object} params
 * @param {string} params.guid
 * @param {string} params.version
 * @param {string} params.issuer
 * @param {string} params.secret
 * @param {number} [params.timeoutMs]
 * @param {number} [params.intervalMs]
 * @returns {Promise<object>} The version payload once processed.
 */
export async function pollVersion({
  guid,
  version,
  issuer,
  secret,
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 5000,
}) {
  const url = `${API_BASE}/addons/addon/${encodeURIComponent(guid)}/versions/${encodeURIComponent(version)}/`;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `JWT ${createToken(issuer, secret)}` },
    });

    if (res.ok) {
      const data = await res.json();
      const file = (data.files ?? [])[0];
      if (file) return data;
    }

    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for version ${version} to process.`);
    }

    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
