import { featureConfig } from "./vite.shared";

/** First feature bundle; the remaining bundles reuse the same factory. */
export default featureConfig("entries/auth.ts", "auth.js", "auth-styles", true);
