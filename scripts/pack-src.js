const fs = require("fs");
const path = require("path");
const { rimrafSync } = require("rimraf");
const { copyRecursive, createZipArchive } = require("./utils/utils");

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

  fs.readdirSync(process.cwd()).forEach((item) => {
    copyRecursive(
      path.join(process.cwd(), item),
      path.join(SRC_TEMP_DIR, item),
      EXCLUDE_PATTERNS
    );
  });

  let version = "src";
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(SRC_TEMP_DIR, "manifest.json"))
    );
    if (manifest.version) version = `v${manifest.version}`;
  } catch {
    console.warn("No valid manifest.json - using 'src' as version");
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
