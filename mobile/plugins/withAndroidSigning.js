// Release signing for Android. Reads the keystore from env so no secrets live in the repo:
// WIRING_KEYSTORE_PATH, WIRING_KEYSTORE_PASSWORD, WIRING_KEY_ALIAS, WIRING_KEY_PASSWORD.
// Without WIRING_KEYSTORE_PATH the release build keeps the default debug signing.
const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("WIRING_KEYSTORE_PATH")) return cfg;
    src = src.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        if (System.getenv("WIRING_KEYSTORE_PATH")) {
            release {
                storeFile file(System.getenv("WIRING_KEYSTORE_PATH"))
                storePassword System.getenv("WIRING_KEYSTORE_PASSWORD")
                keyAlias System.getenv("WIRING_KEY_ALIAS")
                keyPassword System.getenv("WIRING_KEY_PASSWORD")
            }
        }`
    );
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig System.getenv("WIRING_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug`
    );
    cfg.modResults.contents = src;
    return cfg;
  });
