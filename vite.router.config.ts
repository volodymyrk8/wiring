import { resolve } from "node:path";
import { defineConfig } from "vite";

/** Vanilla-importable router (no Preact). Appended after auth build. */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: "public/dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/entries/router.ts"),
      formats: ["es"],
      fileName: () => "router.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
