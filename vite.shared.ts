import preact from "@preact/preset-vite";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const SRC_DIR = resolve(__dirname, "src");

function cssInjectedByJs(styleId: string): Plugin {
  return {
    name: `css-injected-by-js-${styleId}`,
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
          const injection = `(function(){try{if(typeof document!=="undefined"){var s=document.getElementById(${JSON.stringify(styleId)});if(!s){s=document.createElement("style");s.id=${JSON.stringify(styleId)};s.textContent=${JSON.stringify(cssCode)};document.head.appendChild(s);}}}catch(e){}})();\n`;
          chunk.code = injection + chunk.code;
          break;
        }
      }
    },
  };
}

const baseBuild = (entry: string, fileName: string) => ({
  outDir: "public/dist",
  emptyOutDir: false,
  lib: {
    entry: resolve(SRC_DIR, entry),
    formats: ["es" as const],
    fileName: () => fileName,
  },
  rollupOptions: { output: { inlineDynamicImports: true } },
});

export function featureConfig(entry: string, fileName: string, styleId: string, emptyOutDir = false) {
  return defineConfig({
    publicDir: false,
    plugins: [preact(), cssInjectedByJs(styleId)],
    resolve: { alias: { "@": SRC_DIR } },
    build: { ...baseBuild(entry, fileName), emptyOutDir },
  });
}

export function vanillaConfig(entry: string, fileName: string, emptyOutDir = false) {
  return defineConfig({
    publicDir: false,
    resolve: { alias: { "@": SRC_DIR } },
    build: { ...baseBuild(entry, fileName), emptyOutDir },
  });
}
