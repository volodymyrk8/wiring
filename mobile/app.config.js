// Static config lives in app.json. Cleartext HTTP is off unless a build explicitly opts in
// (WIRING_CLEARTEXT=1, used by the `preview` EAS profile for a LAN test server).
module.exports = ({ config }) => {
  const cleartext = process.env.WIRING_CLEARTEXT === "1";
  return {
    ...config,
    // Resolved by Expo config at every build (not cached by Metro). See src/api/config.ts.
    extra: { ...config.extra, apiUrl: process.env.EXPO_PUBLIC_API_URL || (config.extra && config.extra.apiUrl) || "https://wiring.date" },
    plugins: [...(config.plugins || []), "./plugins/withAndroidSigning", "./plugins/withSceneLifecycle"].map((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      return name === "expo-build-properties"
        ? ["expo-build-properties", { android: { usesCleartextTraffic: cleartext } }]
        : plugin;
    }),
  };
};
