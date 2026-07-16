import { defineConfig } from "tsup";

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    platform: "node",
    sourcemap: true,
    splitting: false,
    target: "node20",
  },
  {
    clean: false,
    dts: false,
    entry: { browser: "src/browser/index.ts" },
    format: ["esm"],
    minify: true,
    platform: "browser",
    sourcemap: true,
    splitting: false,
    target: "es2022",
  },
]);
