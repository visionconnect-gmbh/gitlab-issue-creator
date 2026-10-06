/**
 * @fileoverview Production build script.
 *
 * 1. Merges the per-topic locale JSON files into `_locales/<lang>/messages.json`.
 * 2. Copies an explicit allowlist of distributable files/dirs into a
 *    temporary staging directory. (No bundler: every shipped .js file is
 *    hand-written, read exactly as it is in the repo. This is also what
 *    keeps the add-on out of AMO/ATN's source-code-submission requirement.)
 * 3. Packages the staging directory into a versioned .xpi in `builds/`.
 * 4. Removes the temporary staging directory.
 *
 * Usage: node scripts/build.js  (or: pnpm run build)
 */

import fs from "fs";
import path from "path";
import { rimrafSync } from "rimraf";
import { cleanDirectory, copyRecursive, createZipArchive } from "./utils/utils.js";
import { mergeLocales } from "./merge-locales.js";

const BUILD_DIR = "temp_build";
const DEST_DIR = "builds";
const ADDON_NAME = "gitlab-issue-creator";

/**
 * Exactly what ships in the add-on. Anything not listed here (tests, docs,
 * dev tooling, the per-language `json` sources under `_locales` that the
 * merge step reads, the credential files publish.js uses) never reaches
 * the XPI, so there is no denylist to keep up to date as the project grows.
 */
const INCLUDE_PATHS = [
  "manifest.json",
  "background.html",
  "background.js",
  "icons",
  "src",
  "_locales",
];

/** Excluded even though it lives under an included directory. */
const EXCLUDE_PATTERNS = [
  "_locales/de/json",
  "_locales/en/json",
  "icons/Icon.svg",
];

async function buildAddon() {
  console.log("Starting add-on packaging...");

  cleanDirectory(BUILD_DIR);

  console.log("Merging locale JSON files...");
  mergeLocales();

  console.log("Copying distributable files...");
  for (const item of INCLUDE_PATHS) {
    const src = path.join(process.cwd(), item);
    if (!fs.existsSync(src)) {
      console.error(`Expected distributable path missing: ${item}`);
      process.exit(1);
    }
    copyRecursive(src, path.join(BUILD_DIR, item), EXCLUDE_PATTERNS);
  }

  // Read the version from the staged manifest so the zip name is always correct.
  let version = "unknown";
  const manifestPath = path.join(BUILD_DIR, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      version = manifest.version ?? version;
    } catch {
      // Non-fatal; fall back to "unknown".
    }
  }

  // Clean builds/ on every run so stale zips from previous versions never
  // linger: publish.js picks the artifact by exact versioned filename, but
  // an old file with a matching name (a re-run of the same version) should
  // still be replaced rather than silently kept.
  cleanDirectory(DEST_DIR);
  const zipFilePath = path.join(DEST_DIR, `${ADDON_NAME}-v${version}.xpi`);
  await createZipArchive(BUILD_DIR, zipFilePath);

  console.log("Cleaning temporary build directory...");
  rimrafSync(BUILD_DIR);

  console.log("Add-on packaging completed successfully!");
}

buildAddon().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
