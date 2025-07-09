// rollup.config.mjs
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const plugins = [resolve(), commonjs()];

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
    input: "src/popup/ticket_creator.js",
    output: {
      file: "dist/bundled-ticket_creator.js",
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
