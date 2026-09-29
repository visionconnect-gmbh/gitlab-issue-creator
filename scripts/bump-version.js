#!/usr/bin/env node
/**
 * @fileoverview Version bump script.
 *
 * Bumps package.json + manifest.json, rotates CHANGELOG.md's [Unreleased]
 * section into a dated version section, and (optionally) commits, tags and
 * pushes the release.
 *
 * Usage:
 *   node scripts/bump-version.js <major|minor|patch|X.Y.Z> [flags]
 *
 * Flags:
 *   --dry-run                  show what would change; write nothing, tag nothing
 *   --tag                      commit the version files (if changed) and create
 *                               an annotated git tag v<version>. Re-running with
 *                               --tag once the files are already committed only
 *                               creates the tag.
 *   --push                     push the branch + tag (implies --tag). CI's
 *                               tag-triggered build/publish jobs run from this.
 *   --yes                      skip the confirmation prompt
 *   --keep-unreleased-details  keep the [Unreleased] section verbatim instead of
 *                               summarizing it into short bullet points
 *
 * Also usable via the npm scripts:
 *   npm run version:patch / version:minor / version:major
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [bumpArg] = argv.filter((a) => !a.startsWith("--"));

const dryRun = flags.has("--dry-run");
const doPush = flags.has("--push");
const doTag = flags.has("--tag") || doPush;
const assumeYes = flags.has("--yes");
const keepUnreleasedDetails = flags.has("--keep-unreleased-details");

if (!bumpArg) {
  console.error(
    "Usage: node scripts/bump-version.js <major|minor|patch|X.Y.Z> " +
      "[--dry-run] [--tag] [--push] [--yes] [--keep-unreleased-details]",
  );
  process.exit(1);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");

// ---------------------------------------------------------------------------
// Resolve the target version
// ---------------------------------------------------------------------------

const packageJsonPath = path.join(root, "package.json");
const manifestPath = path.join(root, "manifest.json");
const changelogPath = path.join(root, "CHANGELOG.md");

const packageJson = readJson(packageJsonPath);
const current = packageJson.version;

function resolveVersion(cur, arg) {
  if (/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(arg)) return arg;
  const m = cur.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Current version "${cur}" is not semver`);
  let [maj, min, pat] = m.slice(1).map(Number);
  if (arg === "major") [maj, min, pat] = [maj + 1, 0, 0];
  else if (arg === "minor") [min, pat] = [min + 1, 0];
  else if (arg === "patch") pat += 1;
  else throw new Error(`Invalid bump "${arg}" — use major|minor|patch or X.Y.Z`);
  return `${maj}.${min}.${pat}`;
}

const version = resolveVersion(current, bumpArg);
const tag = `v${version}`;

// ---------------------------------------------------------------------------
// Summarize [Unreleased] -> short bullet points
// ---------------------------------------------------------------------------

function summarizeUnreleasedBlock(rawUnreleasedText) {
  const categories = {};
  let currentCategory = "General";
  // Split on \r?\n, not just \n: on a CRLF checkout a bare "\n" split leaves
  // a trailing \r on every line, and \r counts as a line terminator for
  // regex `.` just like \n does — so `^###\s+(.+)$` would silently never
  // match and every category would come back empty.
  const lines = rawUnreleasedText.split(/\r?\n/);
  let currentItemRaw = "";

  const processAndFlushItem = () => {
    if (!currentItemRaw.trim()) return;
    if (!categories[currentCategory]) categories[currentCategory] = [];

    const cleanedText = currentItemRaw.replace(/\s+/g, " ").trim();
    const match = cleanedText.match(/^(\*\*[^*]+\*\*)\s*(.*)$/);
    if (match) {
      const [, title, description] = match;
      if (description) {
        const sentenceEndMatch = description.match(/^([^.!?]*[.!?])/);
        const firstSentence = sentenceEndMatch ? sentenceEndMatch[1].trim() : description.trim();
        categories[currentCategory].push(`${title} ${firstSentence}`);
      } else {
        categories[currentCategory].push(title);
      }
    } else {
      const sentenceEndMatch = cleanedText.match(/^([^.!?]*[.!?])/);
      const firstSentence = sentenceEndMatch ? sentenceEndMatch[1].trim() : cleanedText.trim();
      categories[currentCategory].push(firstSentence);
    }
    currentItemRaw = "";
  };

  for (const line of lines) {
    const categoryHeader = line.match(/^###\s+(.+)$/);
    if (categoryHeader) {
      processAndFlushItem();
      currentCategory = categoryHeader[1].trim();
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      processAndFlushItem();
      currentItemRaw = bulletMatch[1].trim();
      continue;
    }

    if (/^\s+[-*]\s+/.test(line)) continue; // skip nested sub-bullets

    if (currentItemRaw && line.trim().length > 0) {
      currentItemRaw += " " + line.trim();
    }
  }
  processAndFlushItem();

  const outputLines = [];
  for (const [category, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    outputLines.push(`### ${category}\n`);
    for (const item of items) outputLines.push(`- ${item}`);
    outputLines.push("");
  }
  return outputLines.length > 0
    ? outputLines.join("\n").trim()
    : "- Internal updates and minor improvements.";
}

// ---------------------------------------------------------------------------
// Collect the edits (compute first, write once)
// ---------------------------------------------------------------------------

const edits = [];

for (const [rel, p] of [
  ["package.json", packageJsonPath],
  ["manifest.json", manifestPath],
]) {
  const json = readJson(p);
  if (json.version === version) continue;
  edits.push({ rel, write: () => writeJson(p, { ...json, version }) });
}

if (fs.existsSync(changelogPath)) {
  const cl = fs.readFileSync(changelogPath, "utf8");
  const today = new Date().toISOString().slice(0, 10);

  if (cl.includes(`## [${version}]`)) {
    // already released in the changelog — leave it
  } else if (cl.includes("## [Unreleased]")) {
    const unreleasedHeader = "## [Unreleased]";
    const unreleasedIndex = cl.indexOf(unreleasedHeader);
    const afterUnreleased = unreleasedIndex + unreleasedHeader.length;
    const nextHeaderMatch = cl.slice(afterUnreleased).match(/\n##\s+\[/);
    const nextHeaderIndex = nextHeaderMatch ? afterUnreleased + nextHeaderMatch.index : -1;
    const unreleasedBody =
      nextHeaderIndex !== -1 ? cl.slice(afterUnreleased, nextHeaderIndex) : cl.slice(afterUnreleased);
    const remainder = nextHeaderIndex !== -1 ? cl.slice(nextHeaderIndex) : "";

    const versionContent = keepUnreleasedDetails
      ? unreleasedBody.trim()
      : summarizeUnreleasedBlock(unreleasedBody);

    const updatedChangelog =
      cl.slice(0, unreleasedIndex) +
      `## [Unreleased]\n\n## [${version}] - ${today}\n\n${versionContent}\n` +
      remainder;

    edits.push({ rel: "CHANGELOG.md", write: () => fs.writeFileSync(changelogPath, updatedChangelog) });
  } else {
    console.warn("! CHANGELOG.md has no [Unreleased] section — skipping it.");
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nBump ${current} → ${version}${dryRun ? "  (dry run)" : ""}\n`);
if (edits.length === 0) {
  console.log("Everything is already at this version.");
} else {
  for (const e of edits) console.log(`  ${dryRun ? "would update" : "update"}  ${e.rel}`);
}
if (doTag) console.log(`  ${dryRun ? "would tag" : "tag"}       ${tag}${doPush ? "  (+ push)" : ""}`);

if (dryRun) process.exit(0);

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

async function confirm() {
  if (assumeYes || (edits.length === 0 && !doTag)) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question("\nProceed? [y/N] ", resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  } catch (err) {
    const detail = `${err.stdout ?? ""}${err.stderr ?? ""}`.toString().trim();
    throw new Error(`git ${args.join(" ")} failed:${detail ? `\n${detail}` : ` exit ${err.status}`}`, {
      cause: err,
    });
  }
};

if (doTag) {
  try {
    if (git("tag", "--list", tag)) {
      console.error(
        `\n! Tag ${tag} already exists — delete it first if you are redoing the release:` +
          `\n    git tag -d ${tag}` +
          `\n    git push origin :refs/tags/${tag}`,
      );
      process.exit(1);
    }
    const dirty = git("status", "--porcelain")
      .split("\n")
      .map((l) => l.slice(3))
      .filter(Boolean)
      .filter((f) => !edits.some((e) => e.rel === f));
    if (dirty.length > 0) {
      console.error(
        "\n! Uncommitted changes other than the version files:\n" +
          dirty.map((f) => `    ${f}`).join("\n") +
          "\n  Commit or stash them first so the release tag is clean.",
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message ?? "! Not a git repository (or git unavailable) — cannot --tag.");
    process.exit(1);
  }
}

if (!(await confirm())) {
  console.log("Aborted.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

for (const e of edits) {
  e.write();
  console.log(`  updated ${e.rel}`);
}

if (!doTag) {
  console.log(
    `\nDone. ${edits.length > 0 ? "Commit these, then release with:" : "Release with:"}\n` +
      `  node scripts/bump-version.js ${version} --tag --push`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Commit + tag (+ push)
// ---------------------------------------------------------------------------

if (edits.length > 0) {
  git("add", ...edits.map((e) => e.rel));
  git("commit", "-m", `chore(release): ${tag}`);
  console.log(`\n  committed ${edits.length} version file(s)`);
}

git("tag", "-a", tag, "-m", `Release ${tag}`);
console.log(`  tagged ${tag}`);

if (doPush) {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  execFileSync("git", ["push", "origin", branch], { cwd: root, stdio: "inherit" });
  execFileSync("git", ["push", "origin", tag], { cwd: root, stdio: "inherit" });
  console.log(`  pushed ${branch} + ${tag} — CI will build and publish to ATN.`);
} else {
  console.log(`  push it to trigger the release:  git push origin HEAD ${tag}`);
}
