/**
 * @fileoverview Merges per-topic JSON files under `_locales/<lang>/json/*.json`
 * into the single `_locales/<lang>/messages.json` WebExtension i18n expects.
 *
 * Previously a Rollup plugin (`mergeLocalesJSONPlugin`); extracted as a
 * plain function now that the build no longer runs a bundler. Called from
 * scripts/build.js, and runnable directly: `node scripts/merge-locales.js`
 * (what `pnpm run build:dev` does, to regenerate messages.json for loading
 * the add-on unpacked without a full `pnpm run build`).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const LOCALES_DIR = "_locales";

export function mergeLocales(localesDir = LOCALES_DIR) {
  const langs = fs
    .readdirSync(localesDir)
    .filter((f) => fs.statSync(path.join(localesDir, f)).isDirectory());

  for (const lang of langs) {
    const jsonDir = path.join(localesDir, lang, "json");
    if (!fs.existsSync(jsonDir)) continue;

    const files = fs.readdirSync(jsonDir).filter((f) => f.endsWith(".json"));
    const merged = files.reduce((acc, file) => {
      const data = JSON.parse(fs.readFileSync(path.join(jsonDir, file), "utf8"));
      return { ...acc, ...data };
    }, {});

    const outPath = path.join(localesDir, lang, "messages.json");
    fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");
    console.log(`Merged ${files.length} JSON files into ${outPath}`);
  }
}

// Run when invoked directly (`node scripts/merge-locales.js`), not when imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  mergeLocales();
}
