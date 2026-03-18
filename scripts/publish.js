/**
 * @fileoverview AMO (addons.thunderbird.net) publish script.
 *
 * Uploads the latest build zip, waits for validation, creates a new version,
 * and optionally attaches the source zip — all via the AMO API v5.
 *
 * Required environment variables:
 *   AMO_ISSUER   – JWT issuer from your AMO API credentials
 *   AMO_SECRET   – JWT secret from your AMO API credentials
 *
 * Usage:
 *   node scripts/publish.js          # publish as listed
 *   node scripts/publish.js test     # publish as unlisted (test mode)
 */

import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

const ADDON_SLUG = "gitlab-issue-creator";
const API_BASE = "https://addons.thunderbird.net/api/v5/addons";
const TEST_MODE = process.argv[2] === "test";
const VALIDATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

if (!process.env.AMO_ISSUER || !process.env.AMO_SECRET) {
  console.error("AMO_ISSUER and AMO_SECRET environment variables must be set!");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// JWT helper
// ---------------------------------------------------------------------------

/**
 * Creates a short-lived (60 s) JWT for the AMO API.
 * @returns {string}
 */
function createJWT() {
  const issuedAt = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: process.env.AMO_ISSUER,
      jti: Math.random().toString(36).substring(2),
      iat: issuedAt,
      exp: issuedAt + 60,
    },
    process.env.AMO_SECRET,
    { algorithm: "HS256" },
  );
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Fetches a URL with exponential-backoff retries.
 *
 * @param {string}      url
 * @param {RequestInit} options
 * @param {number}      [retries=3]
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 2000 * (attempt + 1);
      console.warn(
        `Fetch failed (attempt ${attempt + 1}): ${err.message}. Retrying in ${delay / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ---------------------------------------------------------------------------
// AMO API calls
// ---------------------------------------------------------------------------

/**
 * Uploads the build zip to AMO and returns the upload UUID.
 *
 * @param {string} buildPath - Path to the .zip / .xpi file.
 * @returns {Promise<string>} Upload UUID.
 */
async function uploadBuild(buildPath) {
  if (!fs.existsSync(buildPath)) {
    console.error("Build file does not exist:", buildPath);
    process.exit(1);
  }

  const form = new FormData();
  form.append("upload", fs.createReadStream(buildPath));

  const res = await fetchWithRetry(`${API_BASE}/upload/`, {
    method: "POST",
    headers: { Authorization: `JWT ${createJWT()}` },
    body: form,
  });

  const data = await res.json();
  if (!data.uuid) {
    console.error("No UUID returned from upload:", data);
    process.exit(1);
  }

  console.log("Build uploaded, UUID:", data.uuid);
  return data.uuid;
}

/**
 * Polls AMO until the uploaded file passes validation or the timeout is
 * reached.
 *
 * @param {string} uuid
 * @returns {Promise<void>}
 */
async function waitForValidation(uuid) {
  const deadline = Date.now() + VALIDATION_TIMEOUT_MS;

  while (true) {
    if (Date.now() > deadline) {
      console.error("Validation timed out for UUID:", uuid);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, 3000));

    const res = await fetchWithRetry(`${API_BASE}/upload/${uuid}/`, {
      headers: { Authorization: `JWT ${createJWT()}` },
    });
    const data = await res.json();

    if (data.valid) {
      console.log("Validation passed.");
      return;
    }
    if (data.processed && !data.valid) {
      console.error("Validation failed:", data);
      process.exit(1);
    }

    console.log("Waiting for validation...");
  }
}

/**
 * Creates a new add-on version from a validated upload UUID.
 *
 * @param {string} uuid
 * @param {string} changelog - Release notes (plain text or Markdown).
 * @returns {Promise<string>} The new version number string.
 */
async function createVersion(uuid, changelog) {
  if (!changelog?.trim()) {
    console.error("Changelog is empty!");
    process.exit(1);
  }

  const body = {
    upload: uuid,
    license: "mpl-2.0",
    compatibility: ["thunderbird"],
    release_notes: { "en-US": changelog },
  };

  if (TEST_MODE) {
    body.channel = "unlisted";
    console.log("TEST MODE: version will be published as unlisted.");
  }

  const res = await fetchWithRetry(
    `${API_BASE}/addon/${ADDON_SLUG}/versions/`,
    {
      method: "POST",
      headers: {
        Authorization: `JWT ${createJWT()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const data = await res.json();
  if (!data.version) {
    console.error("Version creation returned no version data:", data);
    process.exit(1);
  }

  console.log("Version created:", data.version);
  return data.version;
}

/**
 * Attaches a source zip to an existing version (required by AMO for
 * extensions that use a build step).
 *
 * @param {string} versionNumber
 * @param {string} sourcePath
 * @returns {Promise<void>}
 */
async function uploadSource(versionNumber, sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.warn("Source zip not found – skipping source upload.");
    return;
  }

  const form = new FormData();
  form.append("source", fs.createReadStream(sourcePath));

  await fetchWithRetry(
    `${API_BASE}/addon/${ADDON_SLUG}/versions/${versionNumber}/`,
    {
      method: "PATCH",
      headers: { Authorization: `JWT ${createJWT()}` },
      body: form,
    },
  );

  console.log("Source uploaded successfully.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  const buildsDir = path.join(process.cwd(), "builds");
  const srcDir = path.join(process.cwd(), "src_zips");

  for (const dir of [buildsDir, srcDir]) {
    if (!fs.existsSync(dir)) {
      console.error("Required directory does not exist:", dir);
      process.exit(1);
    }
  }

  // Pick the most recently modified build artifact.
  const buildZip = fs
    .readdirSync(buildsDir)
    .filter((f) => f.endsWith(".zip") || f.endsWith(".xpi"))
    .map((f) => path.join(buildsDir, f))
    .sort()
    .pop();

  if (!buildZip) {
    console.error("No build file found in:", buildsDir);
    process.exit(1);
  }

  const sourceZip = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => path.join(srcDir, f))
    .sort()
    .pop();

  if (!fs.existsSync("CHANGELOG.md")) {
    console.error("CHANGELOG.md not found!");
    process.exit(1);
  }

  const changelog = fs.readFileSync("CHANGELOG.md", "utf8");

  console.log("Uploading build...");
  const uploadUuid = await uploadBuild(buildZip);

  console.log("Waiting for validation...");
  await waitForValidation(uploadUuid);

  console.log("Creating new version...");
  const versionNumber = await createVersion(uploadUuid, changelog);

  if (sourceZip) {
    console.log("Uploading source zip...");
    await uploadSource(versionNumber, sourceZip);
  }

  console.log("Publish completed successfully!");
})();
