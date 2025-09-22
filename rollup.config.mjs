import fs from "fs";
import path from "path";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";

/**
 * Merge split JSON files per language into a single messages.json
 * Runs only once per build.
 */
function mergeLocalesJSONPlugin(options = {}) {
  let mergedAlready = false;

  return {
    name: "merge-locales-json",
    writeBundle() {
      if (mergedAlready) return; // run only once
      mergedAlready = true;

      const { localesDir } = options;
      const langs = fs.readdirSync(localesDir).filter(f =>
        fs.statSync(path.join(localesDir, f)).isDirectory()
      );

      langs.forEach(lang => {
        const jsonDir = path.join(localesDir, lang, "json");
        if (!fs.existsSync(jsonDir)) return;

        const files = fs.readdirSync(jsonDir).filter(f => f.endsWith(".json"));

        const merged = files.reduce((acc, file) => {
          const data = JSON.parse(fs.readFileSync(path.join(jsonDir, file), "utf8"));
          return { ...acc, ...data };
        }, {});

        const outPath = path.join(localesDir, lang, "messages.json");
        fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");
        console.log(`Merged ${files.length} JSON files into ${outPath}`);
      });
    }
  };
}

// Common plugins for JS bundles
const plugins = [
  resolve({ preferBuiltins: false }),
  commonjs(),
  copy({
    targets: [
      { src: "node_modules/easymde/dist/easymde.min.css", dest: "dist/libs" },
      { src: "node_modules/easymde/dist/easymde.min.js", dest: "dist/libs" }
    ],
    verbose: true,
    copyOnce: true,
    hook: "writeBundle"
  }),
  mergeLocalesJSONPlugin({
    localesDir: "_locales"
  })
];

export default [
  {
    input: "background.js",
    output: {
      file: "dist/bundled-background.js",
      format: "iife",
      name: "Background",
      sourcemap: true,
    },
    plugins
  },
  {
    input: "src/popup/issue_creator.js",
    output: {
      file: "dist/bundled-issue_creator.js",
      format: "iife",
      name: "IssueCreator",
      sourcemap: true,
    },
    plugins
  },
  {
    input: "src/options/options.js",
    output: {
      file: "dist/bundled-options.js",
      format: "iife",
      name: "Options",
      sourcemap: true,
    },
    plugins
  }
];
