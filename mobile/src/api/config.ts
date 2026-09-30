import Constants from "expo-constants";

/**
 * API base URL. Read only from the app config (`extra.apiUrl`, set in app.config.js from
 * EXPO_PUBLIC_API_URL at build time). Deliberately NOT `process.env.EXPO_PUBLIC_*`: Metro inlines
 * that into the JS bundle and its cache can keep a stale value from an earlier build (a release
 * once shipped with a simulator's http://127.0.0.1:5070).
 */
export const API_URL: string = (
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) || "https://wiring.date"
).replace(/\/+$/, "");
