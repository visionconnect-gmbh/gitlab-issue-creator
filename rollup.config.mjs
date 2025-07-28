import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";

const plugins = [
  resolve({ preferBuiltins: false }),
  commonjs(),
  copy({
    targets: [
      {
        src: "node_modules/easymde/dist/easymde.min.css",
        dest: "dist/libs"
      },
      {
        src: "node_modules/easymde/dist/easymde.min.js",
        dest: "dist/libs"
      }
    ],
    verbose: true,
    copyOnce: true,
    hook: "writeBundle"
  }),
];

export default [
  {
    input: "background.js",
    output: {
      file: "dist/bundled-background.js",
      format: "iife",
      sourcemap: true,
    },
    plugins,
  },
  {
    input: "src/popup/issue_creator.js",
    output: {
      file: "dist/bundled-issue_creator.js",
      format: "iife",
      sourcemap: true,
    },
    plugins,
  },
  {
    input: "src/options/options.js",
    output: {
      file: "dist/bundled-options.js",
      format: "iife",
      sourcemap: true,
    },
    plugins,
  },
];
