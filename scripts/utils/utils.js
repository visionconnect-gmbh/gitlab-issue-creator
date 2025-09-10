const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { rimrafSync } = require("rimraf");
const { execSync } = require("child_process");

/**
 * Executes a shell command synchronously and handles errors.
 * @param {string} command
 * @param {string} errorMessage
 * @returns {string}
 */
function runCommand(command, errorMessage) {
  try {
    return execSync(command, { stdio: "pipe" }).toString().trim();
  } catch (err) {
    console.error(`${errorMessage}:`, err.message);
    process.exit(1);
  }
}

/**
 * Deletes a directory and recreates it.
 * @param {string} dirPath
 */
function cleanDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    console.log(`Cleaning existing directory: ${dirPath}`);
    rimrafSync(dirPath);
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Checks if a file should be excluded based on patterns.
 * @param {string} filePath
 * @param {string[]} patterns
 */
function shouldExclude(filePath, patterns) {
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
 * Recursively copy a folder respecting exclude patterns.
 * @param {string} src
 * @param {string} dest
 * @param {string[]} excludePatterns
 */
function copyRecursive(src, dest, excludePatterns = []) {
  if (shouldExclude(src, excludePatterns)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(
        path.join(src, item),
        path.join(dest, item),
        excludePatterns
      );
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Creates a zip archive of a directory.
 * @param {string} sourceDir
 * @param {string} outPath
 * @returns {Promise<void>}
 */
function createZipArchive(sourceDir, outPath) {
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

    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

module.exports = {
  runCommand,
  cleanDirectory,
  shouldExclude,
  copyRecursive,
  createZipArchive,
};
