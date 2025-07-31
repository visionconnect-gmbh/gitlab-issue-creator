const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { rimrafSync } = require("rimraf");

const packageJson = require("../package.json");
const ADDON_NAME = packageJson.name; 
const SRC_TEMP_DIR = "src_temp";
const SRC_ZIP_DIR = "src_zips";

// Add the temp dir itself to exclude list
const EXCLUDE_PATTERNS = [
  "node_modules",
  "builds",
  "dist",
  "temp_build",
  "src_temp",
  "src_zips",
  ".git",
  "*.zip",
  "package-lock.json",
  "rollup.config.mjs",
  "build.js",
];

/**
 * Check if a path should be excluded based on patterns.
 */
function shouldExclude(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  return EXCLUDE_PATTERNS.some((pattern) => {
    if (relativePath === pattern || relativePath.startsWith(`${pattern}/`)) {
      return true;
    }
    if (
      pattern.startsWith("*") &&
      path.basename(relativePath).endsWith(pattern.slice(1))
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Recursively copies files, skipping excluded patterns.
 */
function copyRecursive(src, dest) {
  if (shouldExclude(src)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Create a zip from a folder.
 */
function createZip(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`Created ${outPath} (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on("error", (err) => reject(err));
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function packSource() {
  console.log("Packing source files...");

  // Cleanup and prepare dirs
  rimrafSync(SRC_TEMP_DIR);
  fs.mkdirSync(SRC_TEMP_DIR, { recursive: true });
  fs.mkdirSync(SRC_ZIP_DIR, { recursive: true });

  // Copy project contents
  for (const item of fs.readdirSync(process.cwd())) {
    const fullPath = path.join(process.cwd(), item);
    copyRecursive(fullPath, path.join(SRC_TEMP_DIR, item));
  }

  // Determine version
  let version = "src";
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC_TEMP_DIR, "manifest.json")));
    if (manifest.version) version = `v${manifest.version}`;
  } catch {
    console.warn("⚠️  No valid manifest.json found – using 'src' as version label.");
  }

  const zipName = `${ADDON_NAME}-source-${version}.zip`;
  const zipPath = path.join(SRC_ZIP_DIR, zipName);

  await createZip(SRC_TEMP_DIR, zipPath);

  // Cleanup
  rimrafSync(SRC_TEMP_DIR);
  console.log("Source packaging complete.");
}

packSource().catch((err) => {
  console.error("Source packaging failed:", err);
  process.exit(1);
});
