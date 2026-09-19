import { vanillaConfig } from "./vite.shared";

/** Vanilla-importable router (no Preact). Appended after auth build. */
export default vanillaConfig("entries/router.ts", "router.js");
