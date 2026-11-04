type FeatureName = "auth" | "home" | "profile" | "likes" | "person" | "deck" | "account" | "chat" | "support";

const FEATURE_FILES: Record<FeatureName, string> = {
  auth: "auth.js?v=25",
  home: "home.js?v=86",
  profile: "profile.js?v=20261102-archive-order",
  likes: "likes.js?v=36",
  person: "person.js?v=31",
  deck: "deck.js?v=20261102-archive-tabs",
  account: "account.js?v=24",
  chat: "chat.js?v=45",
  support: "support.js?v=19",
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
