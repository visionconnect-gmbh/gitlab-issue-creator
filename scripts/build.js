/**
 * @fileoverview Production build script.
 *
 * 1. Runs Rollup to bundle the extension source.
 * 2. Copies all distributable files into a temporary staging directory.
 * 3. Packages the staging directory into a versioned .zip in `builds/`.
 * 4. Removes the temporary staging directory.
 *
 * Usage: node scripts/build.js  (or: npm run build)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { rimrafSync } from "rimraf";
import {
  cleanDirectory,
  copyRecursive,
  createZipArchive,
} from "./utils/utils.js";

const BUILD_DIR = "temp_build";
const DEST_DIR = "builds";
const ADDON_NAME = "gitlab-issue-creator";

/**
 * Files and directories that must not end up in the distributable zip.
 * Patterns follow the same rules as `shouldExclude` in utils.js.
 */
const EXCLUDE_PATTERNS = [
  "node_modules",
  "scripts",
  "tests",
  "*.zip",
  BUILD_DIR,
  DEST_DIR,
  "src_zips",
  "_locales/de/json",
  "_locales/en/json",
  ".git",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "rollup.config.mjs",
  "jest.config.mjs",
  "build.js",
  ".gitlab-ci.yml",
];

async function buildAddon() {
  console.log("Starting add-on packaging...");

  cleanDirectory(BUILD_DIR);

  console.log("Building with Rollup...");
  try {
    execSync("npx rollup -c rollup.config.mjs", { stdio: "inherit" });
  } catch (err) {
    console.error("Rollup build failed:", err);
    process.exit(1);
  }

  console.log("Copying static files...");
  for (const item of fs.readdirSync(process.cwd())) {
    if ([BUILD_DIR, DEST_DIR, "rollup.config.mjs"].includes(item)) continue;
    copyRecursive(
      path.join(process.cwd(), item),
      path.join(BUILD_DIR, item),
      EXCLUDE_PATTERNS,
    );
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

  fs.mkdirSync(DEST_DIR, { recursive: true });
  const zipFilePath = path.join(DEST_DIR, `${ADDON_NAME}-v${version}.zip`);
  await createZipArchive(BUILD_DIR, zipFilePath);

  console.log("Cleaning temporary build directory...");
  rimrafSync(BUILD_DIR);

  console.log("Add-on packaging completed successfully!");
}

buildAddon().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
