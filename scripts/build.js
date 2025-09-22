const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { rimrafSync } = require("rimraf");
const { cleanDirectory, copyRecursive, createZipArchive } = require("./utils/utils");

const BUILD_DIR = "temp_build";
const DEST_DIR = "builds";
const ADDON_NAME = "gitlab-issue-creator";

const EXCLUDE_PATTERNS = [
  "node_modules",
  "scripts",
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
  "build.js",
];

async function buildAddon() {
  console.log("Starting add-on packaging...");

  cleanDirectory(BUILD_DIR);

  // Run Rollup
  console.log("Building with Rollup...");
  try {
    execSync("npx rollup -c rollup.config.mjs", { stdio: "inherit" });
  } catch (err) {
    console.error("Rollup build failed:", err);
    process.exit(1);
  }

  console.log("Copying static files...");
  fs.readdirSync(process.cwd()).forEach((item) => {
    if ([BUILD_DIR, DEST_DIR, "rollup.config.mjs"].includes(item)) return;
    copyRecursive(
      path.join(process.cwd(), item),
      path.join(BUILD_DIR, item),
      EXCLUDE_PATTERNS
    );
  });

  // Determine version
  let version = "unknown";
  const manifestPath = path.join(BUILD_DIR, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      version = manifest.version || version;
    } catch {}
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  const zipFilePath = path.join(DEST_DIR, `${ADDON_NAME}-${version}.zip`);
  await createZipArchive(BUILD_DIR, zipFilePath);

  console.log("Cleaning temporary build...");
  rimrafSync(BUILD_DIR);

  console.log("Add-on packaging completed successfully!");
}

buildAddon().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
