import preact from "@preact/preset-vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

/** Preact feature bundles (auth, …). */
export default defineConfig({
  publicDir: false,
  plugins: [preact()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: "public/dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/entries/auth.ts"),
      formats: ["es"],
      fileName: () => "auth.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
