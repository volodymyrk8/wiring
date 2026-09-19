import preact from "@preact/preset-vite";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function cssInjectedByJs(): Plugin {
  return {
    name: "css-injected-by-js-home",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      let cssCode = "";
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (fileName.endsWith(".css") && "source" in asset) {
          cssCode += String(asset.source);
          delete bundle[fileName];
        }
      }
      if (!cssCode) return;
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith(".js") && "code" in chunk) {
          const injection = `(function(){try{if(typeof document!=="undefined"){var s=document.getElementById("home-styles");if(!s){s=document.createElement("style");s.id="home-styles";s.textContent=${JSON.stringify(cssCode)};document.head.appendChild(s);}}}catch(e){}})();\n`;
          chunk.code = injection + chunk.code;
          break;
        }
      }
    },
  };
}

/** Preact home feature bundle. */
export default defineConfig({
  publicDir: false,
  plugins: [preact(), cssInjectedByJs()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: "public/dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/entries/home.ts"),
      formats: ["es"],
      fileName: () => "home.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
