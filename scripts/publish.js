#!/usr/bin/env node
/**
 * @fileoverview ATN (addons.thunderbird.net) publish script.
 *
 * ATN is NOT the same service as addons.mozilla.org and has no v5 API —
 * this script uses the legacy v4 signing endpoint, the only write path ATN
 * exposes:
 *
 *   PUT https://addons.thunderbird.net/api/v4/addons/{guid}/versions/{version}/
 *
 * Release notes cannot be set through this API (verified: the versions
 * endpoints only allow GET/HEAD/OPTIONS). This script instead renders the
 * ATN-safe HTML changelog and prints it — along with a link to the
 * developer-hub versions overview — for a one-time manual paste.
 *
 * Pipeline:
 *   1. Read the version from manifest.json
 *   2. Build the extension (npm run build) + pack the source (npm run packSrc)
 *      — skippable with --skip-build when CI already produced these artifacts
 *   3. Render release notes: CHANGELOG.md section for this version, or
 *      commits since the last version actually published on ATN
 *   4. Upload + sign the build via the v4 API, poll until processed
 *   5. Attaching a source zip is NOT supported by the v4 API (that was an
 *      AMO-only endpoint) — the reviewable source zip is left in
 *      src_zips/ for manual attachment if ATN ever asks for it
 *   6. Print the release notes HTML + a link to the devhub versions page
 *
 * Required environment variables:
 *   ATN_API_KEY     – API key from https://addons.thunderbird.net/en-US/developers/addon/api/key/
 *   ATN_API_SECRET  – API secret from the same page
 *
 * Usage:
 *   node scripts/publish.js                  # publish to the listed channel
 *   node scripts/publish.js --channel unlisted
 *   node scripts/publish.js --dry-run         # build + render notes, no upload
 *   node scripts/publish.js --skip-build      # use existing builds/, don't rebuild
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import "dotenv/config";

import {
  getLatestPublishedVersion,
  uploadVersion,
  pollVersion,
} from "./utils/atn.js";
import { buildReleaseNotesHtml } from "./utils/changelog.js";

const ADDON_SLUG = "gitlab-issue-creator";
const CHANNEL = (() => {
  const idx = process.argv.indexOf("--channel");
  return idx !== -1 ? process.argv[idx + 1] : "listed";
})();
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_BUILD = process.argv.includes("--skip-build");

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

if (!DRY_RUN && (!process.env.ATN_API_KEY || !process.env.ATN_API_SECRET)) {
  console.error("ATN_API_KEY and ATN_API_SECRET environment variables must be set.");
  console.error("Get them from: https://addons.thunderbird.net/en-US/developers/addon/api/key/");
  process.exit(1);
}

if (!["listed", "unlisted"].includes(CHANNEL)) {
  console.error(`Invalid --channel "${CHANNEL}" — must be "listed" or "unlisted".`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readManifest() {
  try {
    const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
    if (!manifest.version) throw new Error("No version field in manifest.json");
    const guid = manifest.browser_specific_settings?.gecko?.id;
    if (!guid) throw new Error("No browser_specific_settings.gecko.id in manifest.json");
    return { version: manifest.version, guid };
  } catch (err) {
    console.error("Failed to read manifest.json:", err.message);
    process.exit(1);
  }
}

function runStep(label, npmScript) {
  console.log(`\n── ${label}`);
  try {
    execFileSync("npm", ["run", npmScript], { stdio: "inherit" });
  } catch {
    console.error(`${label} failed.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log("══════════════════════════════════════════");
  console.log(" GitLab Issue Creator – ATN publish pipeline");
  console.log("══════════════════════════════════════════");

  const { version, guid } = readManifest();
  console.log(`\nVersion: v${version}  (channel: ${CHANNEL}${DRY_RUN ? ", dry run" : ""})`);

  if (!SKIP_BUILD) {
    runStep("Building extension", "build");
    runStep("Packing source", "packSrc");
  } else {
    console.log("\n── Skipping build (--skip-build): using existing builds/");
  }

  console.log("\n── Resolving build artifact");
  const buildZip = path.join(process.cwd(), "builds", `gitlab-issue-creator-v${version}.xpi`);
  const buildZipFallback = path.join(process.cwd(), "builds", `gitlab-issue-creator-v${version}.zip`);
  const xpiPath = fs.existsSync(buildZip) ? buildZip : buildZipFallback;

  if (!fs.existsSync(xpiPath)) {
    console.error(
      `Expected build artifact not found for v${version}:\n  ${buildZip}\n  ${buildZipFallback}`,
    );
    process.exit(1);
  }
  console.log(`  Using: ${xpiPath}`);

  console.log("\n── Determining changelog range");
  let sinceVersion = null;
  try {
    sinceVersion = await getLatestPublishedVersion(ADDON_SLUG);
    console.log(`  Last published on ATN: ${sinceVersion ?? "(none yet)"}`);
  } catch (err) {
    console.warn(`  Could not determine last published version: ${err.message}`);
  }

  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  const changelogContents = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, "utf8")
    : null;

  const releaseNotesHtml = buildReleaseNotesHtml({ version, sinceVersion, changelogContents });

  const notesOutPath = path.join(process.cwd(), "builds", "release-notes.html");
  fs.mkdirSync(path.dirname(notesOutPath), { recursive: true });
  fs.writeFileSync(notesOutPath, releaseNotesHtml, "utf8");

  console.log("\n  Release notes (ATN-safe HTML), also written to builds/release-notes.html:\n");
  console.log(releaseNotesHtml);

  if (DRY_RUN) {
    console.log("\n══════════════════════════════════════════");
    console.log(" Dry run complete — nothing was uploaded.");
    console.log("══════════════════════════════════════════\n");
    return;
  }

  console.log("\n── Uploading + signing on ATN");
  const { status, body } = await uploadVersion({
    guid,
    version,
    xpiPath,
    channel: CHANNEL,
    issuer: process.env.ATN_API_KEY,
    secret: process.env.ATN_API_SECRET,
  });

  if (status === 409) {
    console.log(`  Version v${version} already exists on ATN — treating as already published.`);
  } else if (status !== 201 && status !== 202) {
    console.error(`  Upload failed: HTTP ${status}`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  } else {
    console.log(`  Upload accepted: HTTP ${status}`);
  }

  console.log("\n── Waiting for ATN to process the upload");
  let result;
  try {
    result = await pollVersion({
      guid,
      version,
      issuer: process.env.ATN_API_KEY,
      secret: process.env.ATN_API_SECRET,
    });
  } catch (err) {
    console.error(`\n  ${err.message}`);
    console.error("  This does not necessarily mean the upload failed — check the devhub.");
    process.exit(1);
  }

  const file = (result.files ?? [])[0];
  console.log(`\n  Status: ${file?.status ?? "unknown"}`);
  if (CHANNEL === "listed") {
    console.log("  Listed versions go through human review after automated validation —");
    console.log("  this may still be pending even though the upload succeeded.");
  }

  // The signing-status payload (this poll) doesn't carry an edit_url —
  // that field only appears on the separate, read-only version-listing
  // endpoint, and a pending-review version doesn't show up there yet
  // either. The versions overview page always works, listed or not.
  const devhubUrl = `https://addons.thunderbird.net/en-US/developers/addon/${ADDON_SLUG}/versions/`;
  console.log(`\n  Edit this version's release notes here:\n  ${devhubUrl}`);

  console.log("\n══════════════════════════════════════════");
  console.log(` Uploaded v${version} successfully!`);
  console.log(" >>> Paste the release notes above at that page to publish them. <<<");
  console.log("══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\nPublish failed:", err.message ?? err);
  process.exit(1);
});
