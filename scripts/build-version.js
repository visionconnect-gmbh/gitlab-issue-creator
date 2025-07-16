const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// rest of your code unchanged

const ROOT_DIR = process.cwd();
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");
const BUILD_SCRIPT = path.join(ROOT_DIR, "scripts", "build.js");
const BUMP_VERSION_SCRIPT = path.join(ROOT_DIR, "scripts", "bump-version.js");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function bumpVersion(version, level) {
  let [major, minor, patch] = version.split(".").map(Number);

  switch (level) {
    case "major":
      major++;
      minor = 0;
      patch = 0;
      break;

    case "minor":
      minor++;
      patch = 0;
      break;

    case "patch":
      patch++;
      break;

    default:
      throw new Error(
        `Invalid version level: ${level}. Use major, minor, or patch.`
      );
  }

  return [major, minor, patch].join(".");
}

function runScript(scriptPath, label, args = []) {
  try {
    console.log(`Running ${label}...`);
    execSync(`node ${scriptPath} ${args.join(" ")}`, { stdio: "inherit" });
  } catch (err) {
    console.error(`Failed to run ${label}: ${err.message}`);
    process.exit(1);
  }
}

function main() {
  const level = process.argv[2] || "patch";

  if (!["major", "minor", "patch"].includes(level)) {
    console.error(`Usage: node build-version.js [major|minor|patch]`);
    process.exit(1);
  }

  const manifest = readJSON(MANIFEST_PATH);
  const currentVersion = manifest.version;
  const newVersion = bumpVersion(currentVersion, level);

  manifest.version = newVersion;
  writeJSON(MANIFEST_PATH, manifest);
  console.log(`Updated manifest version: ${currentVersion} → ${newVersion}`);

  runScript(BUILD_SCRIPT, "build script");

  // Delete old zip in root of project
  const oldZipPath = path.join(
    ROOT_DIR,
    `gitlab-ticket-creator-${currentVersion}.zip`
  );
  if (fs.existsSync(oldZipPath)) {
    fs.unlinkSync(oldZipPath);
    console.log(`Deleted old zip file: ${oldZipPath}`);
  }
  // Move the new zip to the root of the project
  const newZipPath = path.join(
    ROOT_DIR,
    `gitlab-ticket-creator-${newVersion}.zip`
  );
  const buildZipPath = path.join(
    ROOT_DIR,
    "builds",
    `gitlab-ticket-creator-${newVersion}.zip`
  );
  if (fs.existsSync(buildZipPath)) {
    fs.renameSync(buildZipPath, newZipPath);
    console.log(`Moved new zip file: → ${newZipPath}`);
  }

  runScript(BUMP_VERSION_SCRIPT, "bump-version script", [level]);
}

main();
