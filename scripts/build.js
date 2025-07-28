const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { rimrafSync } = require("rimraf");
const { execSync } = require("child_process");

const BUILD_DIR = "temp_build"; // Temporary directory for staging files
const DEST_DIR = "builds"; // Directory for the final .zip file
const ADDON_NAME = "gitlab-issue-creator"; // Name of addon for the zip file

// Files/folders to exclude from the final .zip package
const EXCLUDE_PATTERNS = [
  "node_modules",
  "scripts", // Exclude the scripts directory itself
  "*.zip", // Exclude any existing zip files
  "temp_build", // Exclude the temporary build directory
  "builds", // Exclude the builds directory
  ".git",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "rollup.config.mjs",
  "build.js",
];

/**
 * Checks if a path should be excluded based on EXCLUDE_PATTERNS.
 * @param {string} filePath The absolute path to check.
 * @returns {boolean} True if the path should be excluded, false otherwise.
 */
function shouldExclude(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  return EXCLUDE_PATTERNS.some((pattern) => {
    if (relativePath === pattern || relativePath.startsWith(`${pattern}/`)) {
      return true;
    }
    if (
      pattern.startsWith("*") &&
      path.basename(relativePath).endsWith(pattern.substring(1))
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Cleans the specified directory.
 * @param {string} dirPath The path to the directory to clean.
 */
function cleanDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    console.log(`Cleaning existing directory: ${dirPath}`);
    rimrafSync(dirPath);
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Copies files and directories recursively, respecting exclude patterns.
 * @param {string} src The source path.
 * @param {string} dest The destination path.
 */
function copyRecursiveSync(src, dest) {
  const stats = fs.statSync(src);

  if (shouldExclude(src)) {
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Executes the Rollup build using the external configuration.
 * Assumes rollup.config.mjs handles input/output paths.
 */
async function buildWithRollup() {
  console.log("Starting Rollup build using rollup.config.mjs...");
  try {
    execSync("npx rollup -c rollup.config.mjs", {
      stdio: "inherit", // Inherit stdio to show Rollup output in console
    });
  } catch (error) {
    console.error("Rollup build failed:", error);
    process.exit(1);
  }
}

/**
 * Creates a .zip archive of the specified directory.
 * @param {string} sourceDir The directory to archive.
 * @param {string} outPath The full path for the output .zip file.
 * @returns {Promise<void>} A promise that resolves when zipping is complete.
 */
function createZipArchive(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Sets compression level
    });

    output.on("close", () => {
      console.log(`Successfully created ${archive.pointer()} total bytes.`);
      console.log(`Zip archive created at: ${outPath}`);
      resolve();
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn("Archiver Warning:", err.message);
      } else {
        reject(err);
      }
    });

    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false); // Append sourceDir contents to the root of the archive
    archive.finalize();
  });
}

// --- Main Build Process ---
async function buildAddon() {
  console.log("Starting add-on packaging process...");

  // 1. Clean and prepare directories
  cleanDirectory(BUILD_DIR);

  // 2. Run Rollup build using the external config
  // Your rollup.config.mjs should output to the BUILD_DIR
  await buildWithRollup();

  // 3. Copy all necessary files to the build directory *after* Rollup
  // This ensures bundled files are included, and other static assets are copied.
  console.log("Copying static files to temporary build directory...");
  const currentDirContents = fs.readdirSync(process.cwd());
  for (const item of currentDirContents) {
    const itemPath = path.join(process.cwd(), item);
    // Exclude the target build and dest directories from being copied into themselves
    if (
      item === BUILD_DIR ||
      item === DEST_DIR ||
      item === "rollup.config.mjs"
    ) {
      continue;
    }
    copyRecursiveSync(itemPath, path.join(BUILD_DIR, item));
  }
  console.log("Finished copying static files.");

  // 4. Create the .zip archive
  const manifestPath = path.join(BUILD_DIR, "manifest.json");
  let version = "unknown";
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      version = manifest.version || version;
    } catch (e) {
      console.warn("Could not read version from manifest.json:", e.message);
    }
  }
  const zipFileName = `${ADDON_NAME}-${version}.zip`;
  const zipFilePath = path.join(DEST_DIR, zipFileName);

  // Ensure output directory exists
  fs.mkdirSync(DEST_DIR, { recursive: true });

  await createZipArchive(BUILD_DIR, zipFilePath);

  // 5. Clean up the temporary build directory
  console.log("Cleaning up temporary build directory...");
  rimrafSync(BUILD_DIR);
  console.log("Temporary build directory removed.");

  console.log("Add-on packaging completed successfully!");
}

// Execute the build process
buildAddon().catch((error) => {
  console.error("Add-on packaging failed:", error);
  process.exit(1);
});
