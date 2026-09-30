// iOS 27 asserts at launch ("NoSceneLifecycleAdoption") unless the app adopts the UIScene
// life cycle. Expo SDK 57 ships ExpoAppSceneDelegate but the generated project does not use it,
// so wire it up: scene manifest in Info.plist, AppDelegate conforms to
// ExpoReactNativeFactoryProvider, and React Native starts from the scene delegate.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const MARK = "ExpoReactNativeFactoryProvider";

module.exports = (config) => {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });

  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error("withSceneLifecycle expects a Swift AppDelegate");
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg; // already patched

    src = src.replace(
      /class AppDelegate: ExpoAppDelegate \{/,
      `class AppDelegate: ExpoAppDelegate, ${MARK} {`,
    );
    // The scene delegate creates the window and starts React Native now.
    src = src.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*\n\s*withModuleName: "main",\s*\n\s*in: window,\s*\n\s*launchOptions: launchOptions\)\s*\n#endif\s*\n/,
      "",
    );
    if (!src.includes(MARK) || /window = UIWindow\(frame/.test(src)) {
      throw new Error("withSceneLifecycle: AppDelegate template changed, update the plugin");
    }
    src += "\nclass SceneDelegate: ExpoAppSceneDelegate {}\n";
    cfg.modResults.contents = src;
    return cfg;
  });
};
