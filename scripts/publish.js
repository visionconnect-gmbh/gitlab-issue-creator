/**
 * @fileoverview AMO publish script.
 *
 * Fully automated release pipeline:
 *   1. Reads the version from manifest.json
 *   2. Builds the extension via Rollup  (npm run build)
 *   3. Packs the source zip             (npm run packSrc)
 *   4. Generates HTML release notes from git commits since the previous tag
 *   5. Uploads the build zip to AMO, waits for validation
 *   6. Creates a new version with the generated release notes
 *   7. Attaches the source zip
 *
 * Required environment variables:
 *   AMO_ISSUER   – JWT issuer from your AMO API credentials page
 *   AMO_SECRET   – JWT secret from your AMO API credentials page
 *
 * Credentials page: https://addons.mozilla.org/en-US/developers/addon/api/key/
 *
 * Usage:
 *   node scripts/publish.js          # publish as listed
 *   node scripts/publish.js test     # publish as unlisted (test / review mode)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import jwt from "jsonwebtoken";

const ADDON_SLUG = "gitlab-issue-creator";
const API_BASE   = "https://addons.mozilla.org/api/v5/addons";
const TEST_MODE   = process.argv[2] === "test";
const DEBUG_MODE  = process.argv.includes("--debug");
const VALIDATION_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

if (!process.env.AMO_ISSUER || !process.env.AMO_SECRET) {
  console.error("AMO_ISSUER and AMO_SECRET environment variables must be set.");
  console.error("Get them from: https://addons.mozilla.org/en-US/developers/addon/api/key/");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1 – Read current version from manifest.json
// ---------------------------------------------------------------------------

function readManifestVersion() {
  try {
    const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
    if (!manifest.version) throw new Error("No version field in manifest.json");
    return manifest.version;
  } catch (err) {
    console.error("Failed to read manifest.json:", err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Steps 2 & 3 – Build extension and pack source
// ---------------------------------------------------------------------------

function runStep(label, command) {
  console.log(`\n── ${label}`);
  try {
    execSync(command, { stdio: "inherit" });
  } catch {
    console.error(`${label} failed.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 4 – Generate changelog HTML from git commits
// ---------------------------------------------------------------------------

const CATEGORY_MAP = [
  { pattern: /^feat(\(.+\))?!?:/i,     label: "Added"   },
  { pattern: /^fix(\(.+\))?!?:/i,      label: "Fixed"   },
  { pattern: /^perf(\(.+\))?!?:/i,     label: "Fixed"   },
  { pattern: /^refactor(\(.+\))?!?:/i, label: "Changed" },
  { pattern: /^chore(\(.+\))?!?:/i,    label: "Changed" },
  { pattern: /^docs(\(.+\))?!?:/i,     label: "Changed" },
  { pattern: /^style(\(.+\))?!?:/i,    label: "Changed" },
  { pattern: /^test(\(.+\))?!?:/i,     label: "Changed" },
];

const stripPrefix = (s) => s.replace(/^\w+(\(.+\))?!?:\s*/, "").trim();
const capitalise  = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Returns the two most recent version tags sorted by semver descending.
 * @returns {{ current: string, previous: string }}
 */
function getTwoLatestTags() {
  const tags = execSync("git tag --sort=-v:refname", { stdio: "pipe" })
    .toString().trim().split("\n").filter(Boolean);

  if (tags.length < 2) throw new Error("Fewer than two tags found.");
  return { current: tags[0], previous: tags[1] };
}

/**
 * Returns commit subjects between the two most recent tags.
 * This covers exactly the commits belonging to the version being released,
 * even when HEAD is already tagged (e.g. after running bump-version).
 * Falls back to the last 20 commits when fewer than two tags exist.
 *
 * @returns {string[]}
 */
function getCommitsForRelease() {
  let range;
  try {
    const { current, previous } = getTwoLatestTags();
    range = `${previous}..${current}`;
    console.log(`  Collecting commits: ${previous} → ${current}`);
  } catch (err) {
    console.warn(`  ${err.message} Falling back to last 20 commits.`);
    range = "HEAD~20..HEAD";
  }

  const output = execSync(`git log --format="%s" ${range}`, { stdio: "pipe" })
    .toString().trim();

  return output ? output.split("\n").filter(Boolean) : [];
}

/**
 * Groups commits by category and returns AMO-ready HTML release notes.
 * @param {string} version
 * @returns {string}
 */
function buildChangelog(version) {
  const subjects = getCommitsForRelease();
  const buckets  = { Added: [], Fixed: [], Changed: [] };

  for (const subject of subjects) {
    if (/^Release:/i.test(subject)) continue;

    let matched = false;
    for (const { pattern, label } of CATEGORY_MAP) {
      if (pattern.test(subject)) {
        buckets[label].push(capitalise(stripPrefix(subject)));
        matched = true;
        break;
      }
    }
    if (!matched) buckets.Changed.push(capitalise(subject));
  }

  const sections = [];
  for (const [label, items] of Object.entries(buckets)) {
    if (!items.length) continue;
    const lis = items.map((i) => `      <li>${i}</li>`).join("\n");
    sections.push(`  <li>\n    <strong>${label}</strong>\n    <ul>\n${lis}\n    </ul>\n  </li>`);
  }

  sections.push(
    `  <li>\n    <strong>Release</strong>\n    <ul>\n      <li>Version v${version}</li>\n    </ul>\n  </li>`
  );

  return `<ul>\n${sections.join("\n")}\n</ul>`;
}

// ---------------------------------------------------------------------------
// JWT helper
// ---------------------------------------------------------------------------

function createJWT() {
  const token = _createJWT();
  if (DEBUG_MODE) {
    const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    console.debug("  JWT payload:", JSON.stringify(decoded, null, 4));
    console.debug("  Authorization: JWT", token.slice(0, 40) + "…");
  }
  return token;
}

function _createJWT() {
  const issuedAt = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: process.env.AMO_ISSUER,
      jti: Math.random().toString(),
      iat: issuedAt,
      exp: issuedAt + 60,
    },
    process.env.AMO_SECRET,
    { algorithm: "HS256" }
  );
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} from ${url}\n${body}`);
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 2000 * (attempt + 1);
      console.warn(`  Attempt ${attempt + 1} failed: ${err.message.split("\n")[0]}. Retrying in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ---------------------------------------------------------------------------
// AMO API calls
// ---------------------------------------------------------------------------

async function uploadBuild(buildPath) {
  if (!fs.existsSync(buildPath)) {
    console.error("Build file not found:", buildPath);
    process.exit(1);
  }

  const form = new FormData();
  form.append("upload", fs.createReadStream(buildPath));

  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}/upload/`, {
      method: "POST",
      headers: { Authorization: `JWT ${createJWT()}` },
      body: form,
    });
  } catch (err) {
    console.error("\nUpload failed. Common causes:");
    console.error("  • Invalid AMO_ISSUER or AMO_SECRET (check credentials at addons.mozilla.org)");
    console.error("  • The add-on does not exist on AMO yet (create it manually first)");
    console.error("  • ADDON_SLUG in publish.js does not match your add-on's slug on AMO");
    console.error("\nFull error:", err.message);
    process.exit(1);
  }

  const data = await res.json();
  if (!data.uuid) {
    console.error("No UUID in upload response:", data);
    process.exit(1);
  }

  console.log("  Uploaded. UUID:", data.uuid);
  return data.uuid;
}

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

    if (data.valid) { console.log("  Validation passed."); return; }
    if (data.processed && !data.valid) {
      console.error("  Validation failed:", data);
      process.exit(1);
    }

    process.stdout.write(".");
  }
}

async function createVersion(uuid, changelog) {
  const body = {
    upload: uuid,
    license: "mpl-2.0",
    compatibility: ["thunderbird"],
    release_notes: { "en-US": changelog },
  };

  if (TEST_MODE) {
    body.channel = "unlisted";
    console.log("  TEST MODE: version will be published as unlisted.");
  }

  const res = await fetchWithRetry(`${API_BASE}/addon/${ADDON_SLUG}/versions/`, {
    method: "POST",
    headers: {
      Authorization: `JWT ${createJWT()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.version) {
    console.error("  Version creation returned no version data:", data);
    process.exit(1);
  }

  console.log("  Version created:", data.version);
  return data.version;
}

async function uploadSource(versionNumber, sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.warn("  Source zip not found – skipping source upload.");
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
    }
  );

  console.log("  Source uploaded.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  console.log("══════════════════════════════════════════");
  console.log(" GitLab Issue Creator – publish pipeline");
  console.log("══════════════════════════════════════════");

  const version = readManifestVersion();
  console.log(`\nVersion: v${version}${TEST_MODE ? "  (test/unlisted)" : ""}`);

  runStep("Building extension", "npm run build");
  runStep("Packing source",     "npm run packSrc");

  console.log("\n── Generating changelog from git commits");
  const changelog = buildChangelog(version);
  console.log("\n  Release notes preview:\n");
  console.log(changelog);

  const buildsDir = path.join(process.cwd(), "builds");
  const srcDir    = path.join(process.cwd(), "src_zips");

  const buildZip = fs.readdirSync(buildsDir)
    .filter((f) => f.endsWith(".zip") || f.endsWith(".xpi"))
    .map((f) => path.join(buildsDir, f))
    .sort().pop();

  if (!buildZip) {
    console.error("No build zip found in builds/ – did the build step succeed?");
    process.exit(1);
  }

  const sourceZip = fs.readdirSync(srcDir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => path.join(srcDir, f))
    .sort().pop();

  console.log("\n── Uploading build to AMO");
  const uploadUuid = await uploadBuild(buildZip);

  console.log("\n── Waiting for AMO validation");
  await waitForValidation(uploadUuid);

  console.log("\n── Creating version on AMO");
  const versionNumber = await createVersion(uploadUuid, changelog);

  if (sourceZip) {
    console.log("\n── Uploading source zip");
    await uploadSource(versionNumber, sourceZip);
  }

  console.log("\n══════════════════════════════════════════");
  console.log(` Published v${version} successfully!`);
  console.log("══════════════════════════════════════════\n");
})();