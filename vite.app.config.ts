import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: {
    outDir: "public/dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/entries/app.ts"),
      formats: ["es"],
      fileName: () => "app.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
