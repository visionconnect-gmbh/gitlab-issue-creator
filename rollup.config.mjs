// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  // Define the entry point for your background script
  input: 'background.js',

  // Define the output configuration
  output: {
    file: 'dist/bundled-background.js', // Output file path
    format: 'iife',                     // Immediately Invoked Function Expression (good for browser environments)
    name: 'ThunderbirdBackground',      // A global variable name if needed (optional for IIFE)
    sourcemap: true                     // Generate sourcemaps for easier debugging
  },

  // Add plugins
  plugins: [
    resolve(),  // Locates modules in node_modules
    commonjs(), // Converts CommonJS modules to ES modules
  ]
};