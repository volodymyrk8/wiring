type FeatureName = "auth" | "home" | "profile" | "likes" | "person" | "deck" | "account" | "chat" | "support";

const FEATURE_FILES: Record<FeatureName, string> = {
  auth: "auth.js?v=22",
  home: "home.js?v=83",
  profile: "profile.js?v=48",
  likes: "likes.js?v=34",
  person: "person.js?v=28",
  deck: "deck.js?v=47",
  account: "account.js?v=20",
  chat: "chat.js?v=41",
  support: "support.js?v=18",
};

const VIEW_FEATURE: Record<string, FeatureName> = {
  home: "home", login: "auth", register: "auth", forgot: "auth", reset: "auth", verify: "auth",
  profile: "person", "edit-profile": "profile", consents: "profile", plus: "profile", notifications: "profile", archive: "profile",
  likes: "likes", person: "person", deck: "deck", recommendations: "deck", matches: "chat", chat: "chat",
  onboard: "account", invite: "account", "delete-account": "account", support: "support",
};

/** Lazy, cached loaders for route-level feature bundles. */
export function createFeatureLoader(basePath = "") {
  const cache = new Map<FeatureName, Promise<unknown>>();

  const load = (name: FeatureName) => {
    const cached = cache.get(name);
    if (cached) return cached;
    const promise = import(`${basePath}/public/dist/${FEATURE_FILES[name]}`).catch((error) => { cache.delete(name); throw error; });
    cache.set(name, promise);
    return promise;
  };

  return {
    prefetch: (view: string) => {
      const name = VIEW_FEATURE[view];
      if (name) void load(name).catch(() => {});
    },
    auth: () => load("auth"),
    home: () => load("home"),
    profile: () => load("profile"),
    likes: () => load("likes"),
    person: () => load("person"),
    deck: () => load("deck"),
    account: () => load("account"),
    chat: () => load("chat"),
    support: () => load("support"),
  };
}
