// Static config lives in app.json. Cleartext HTTP is off unless a build explicitly opts in
// (WIRING_CLEARTEXT=1, used by the `preview` EAS profile for a LAN test server).
module.exports = ({ config }) => {
  const cleartext = process.env.WIRING_CLEARTEXT === "1";
  return {
    ...config,
    plugins: (config.plugins || []).map((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      return name === "expo-build-properties"
        ? ["expo-build-properties", { android: { usesCleartextTraffic: cleartext } }]
        : plugin;
    }),
  };
};
