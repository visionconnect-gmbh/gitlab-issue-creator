/**
 * @fileoverview Source packaging script.
 *
 * Copies the full project source (excluding build artefacts and generated
 * directories) into a temporary directory and zips it for submission to AMO,
 * which requires the reviewable source alongside the built XPI.
 *
 * Usage: npm run packSrc
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { rimrafSync } from "rimraf";
import { copyRecursive, createZipArchive } from "./utils/utils.js";

// JSON imports via import assertions are stage-3 and not universally available;
// createRequire is the reliable cross-version alternative for Node scripts.
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

const ADDON_NAME = packageJson.name;
const SRC_TEMP_DIR = "src_temp";
const SRC_ZIP_DIR = "src_zips";

const EXCLUDE_PATTERNS = [
  "node_modules",
  "builds",
  "dist",
  "temp_build",
  SRC_TEMP_DIR,
  SRC_ZIP_DIR,
  ".git",
  "*.zip",
];

async function packSource() {
  console.log("Packing source files...");

  rimrafSync(SRC_TEMP_DIR);
  fs.mkdirSync(SRC_TEMP_DIR, { recursive: true });
  fs.mkdirSync(SRC_ZIP_DIR, { recursive: true });

  for (const item of fs.readdirSync(process.cwd())) {
    copyRecursive(
      path.join(process.cwd(), item),
      path.join(SRC_TEMP_DIR, item),
      EXCLUDE_PATTERNS,
    );
  }

  let version = "src";
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(SRC_TEMP_DIR, "manifest.json"), "utf8"),
    );
    if (manifest.version) version = `v${manifest.version}`;
  } catch {
    console.warn("No valid manifest.json found – using 'src' as version.");
  }

  const zipPath = path.join(SRC_ZIP_DIR, `${ADDON_NAME}-${version}-source.zip`);
  await createZipArchive(SRC_TEMP_DIR, zipPath);

  rimrafSync(SRC_TEMP_DIR);
  console.log("Source packaging complete.");
}

packSource().catch((err) => {
  console.error("Source packaging failed:", err);
  process.exit(1);
});
