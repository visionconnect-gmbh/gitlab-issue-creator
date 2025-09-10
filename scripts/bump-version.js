const fs = require("fs");
const { runCommand } = require("./utils/utils");

const VERSION_TYPES = ["patch", "minor", "major"];
const MANIFEST_FILE = "manifest.json";

async function main() {
  const type = process.argv[2];
  if (!VERSION_TYPES.includes(type)) {
    console.error(
      `Invalid version type "${type}", allowed: ${VERSION_TYPES.join(", ")}`
    );
    process.exit(1);
  }

  console.log(`Calculating new ${type} version...`);
  const newVersion = runCommand(
    `npm version ${type} --no-git-tag-version`,
    "Error determining version"
  );
  console.log(`New version: ${newVersion}`);

  // Update manifest.json
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    manifest.version = newVersion.replace(/^v/, "");
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
    console.log(`Updated ${MANIFEST_FILE} to version ${manifest.version}`);
  } catch (err) {
    console.error("Failed to update manifest:", err.message);
    process.exit(1);
  }

  const commitMsg = `Release: ${
    type.charAt(0).toUpperCase() + type.slice(1)
  } version ${newVersion}`;
  console.log("Committing changes...");
  runCommand("git add .", "Failed to stage files");
  runCommand(`git commit -m "${commitMsg}"`, "Failed to commit changes");

  const existingTags = runCommand("git tag", "Failed to get tags").split("\n");
  if (!existingTags.includes(newVersion))
    runCommand(`git tag ${newVersion}`, "Failed to create tag");

  console.log(`Pushing commit and tag ${newVersion}...`);
  runCommand(
    `git push && git push origin ${newVersion}`,
    "Failed to push changes"
  );

  console.log("Versioning completed successfully!");
}

main();
