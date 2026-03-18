/**
 * @fileoverview Shared utilities for build scripts.
 */

import fs from "fs";
import path from "path";
import archiver from "archiver";
import { rimrafSync } from "rimraf";
import { execSync } from "child_process";

/**
 * Executes a shell command synchronously and returns its trimmed stdout.
 * Exits the process with code 1 on failure.
 *
 * @param {string} command
 * @param {string} errorMessage - Prefix shown before the error detail.
 * @returns {string}
 */
export function runCommand(command, errorMessage) {
  try {
    return execSync(command, { stdio: "pipe" }).toString().trim();
  } catch (err) {
    console.error(`${errorMessage}:`, err.message);
    process.exit(1);
  }
}

/**
 * Removes a directory (if it exists) and recreates it empty.
 *
 * @param {string} dirPath
 */
export function cleanDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    console.log(`Cleaning existing directory: ${dirPath}`);
    rimrafSync(dirPath);
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Returns true when `filePath` matches any of the given exclude patterns.
 * Patterns are matched against the path relative to `process.cwd()`:
 *  - exact match or directory prefix match: `"node_modules"`
 *  - glob suffix match: `"*.zip"` (matches any file ending in `.zip`)
 *
 * @param {string}   filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function shouldExclude(filePath, patterns) {
  const relativePath = path.relative(process.cwd(), filePath);
  return patterns.some((pattern) => {
    if (relativePath === pattern || relativePath.startsWith(`${pattern}/`))
      return true;
    if (
      pattern.startsWith("*") &&
      path.basename(relativePath).endsWith(pattern.slice(1))
    )
      return true;
    return false;
  });
}

/**
 * Recursively copies `src` to `dest`, skipping any paths that match
 * `excludePatterns`.
 *
 * @param {string}   src
 * @param {string}   dest
 * @param {string[]} [excludePatterns=[]]
 */
export function copyRecursive(src, dest, excludePatterns = []) {
  if (shouldExclude(src, excludePatterns)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(
        path.join(src, item),
        path.join(dest, item),
        excludePatterns,
      );
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Creates a zip archive of `sourceDir` at `outPath`.
 *
 * @param {string} sourceDir - Directory whose contents to zip.
 * @param {string} outPath   - Destination `.zip` file path.
 * @returns {Promise<void>}
 */
export function createZipArchive(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`Created zip: ${outPath} (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") console.warn("Archiver warning:", err.message);
      else reject(err);
    });

    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
