import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from "./package.json";
import { sbom } from "./scripts/sbom.js";

export default defineConfig({
  plugins: [
    svelte(),
    sbom({
      app: { name: "Daily Darts Drill", version: pkg.version, license: "MIT" },
      root: __dirname,
      cargoDir: `${__dirname}/src-tauri`,
    }),
  ],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 1420, strictPort: true },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
