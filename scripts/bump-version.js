const { execSync } = require("child_process");
const fs = require("fs"); // Import fs module at the top

// --- Configuration ---
const VERSION_TYPES = ["patch", "minor", "major"];
const MANIFEST_FILE = "manifest.json";

// --- Helper Function for Executing Shell Commands ---
/**
 * Executes a shell command synchronously and handles errors.
 * @param {string} command The command to execute.
 * @param {string} errorMessage The message to display if the command fails.
 * @returns {string} The trimmed stdout from the command.
 */
function runCommand(command, errorMessage) {
  try {
    return execSync(command, { stdio: "pipe" }).toString().trim();
  } catch (error) {
    console.error(`${errorMessage}:`, error.message);
    process.exit(1);
  }
}

// --- Main Script Logic ---
async function main() {
  const type = process.argv[2];

  // 1. Validate Version Type
  if (!VERSION_TYPES.includes(type)) {
    console.error(
      `Ungültiger Versionstyp: "${type}"\nErlaubt sind: ${VERSION_TYPES.join(
        ", "
      )}`
    );
    process.exit(1);
  }

  console.log(`Berechne neue ${type}-Version...`);

  // 2. Determine New Version
  // Use --no-git-tag-version to prevent npm from creating a git tag immediately
  const newVersion = runCommand(
    `npm version ${type} --no-git-tag-version`,
    "Fehler beim Ermitteln der neuen Version"
  );
  console.log(`Neue Version ermittelt: ${newVersion}`);

  // 3. Update manifest.json
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    manifest.version = newVersion.replace(/^v/, ""); // Remove 'v' prefix if present, common with npm version output
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
    console.log(
      `${MANIFEST_FILE} auf Version ${manifest.version} aktualisiert.`
    );
  } catch (error) {
    console.error(
      `Fehler beim Aktualisieren von ${MANIFEST_FILE}:`,
      error.message
    );
    process.exit(1);
  }

  // 4. Git Operations
  const commitMessage = `Release: ${
    type.charAt(0).toUpperCase() + type.slice(1)
  } version ${newVersion}`;

  console.log(`Staging und Committing Änderungen...`);
  runCommand(
    "git add .",
    "Fehler beim Hinzufügen von Dateien zum Staging-Bereich"
  );
  runCommand(
    `git commit -m "${commitMessage}"`,
    "Fehler beim Erstellen des Commits"
  );
  console.log(`Commit erstellt: "${commitMessage}"`);

  console.log(`Tagging mit "${newVersion}"...`);
  runCommand(`git tag ${newVersion}`, "Fehler beim Erstellen des Git-Tags");
  console.log(`Tag "${newVersion}" erstellt.`);

  console.log(`Pushing Commit und Tag "${newVersion}" nach origin...`);
  runCommand(
    `git push && git push origin ${newVersion}`,
    "Fehler beim Pushen der Änderungen"
  );
  console.log("Versionierung erfolgreich abgeschlossen!");
}

// Execute the main function
main();
