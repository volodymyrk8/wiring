type FeatureName = "auth" | "home" | "profile" | "likes" | "person" | "deck" | "account" | "chat" | "support";

const FEATURE_FILES: Record<FeatureName, string> = {
  auth: "auth.js?v=7",
  home: "home.js?v=52",
  profile: "profile.js?v=11",
  likes: "likes.js?v=21",
  person: "person.js?v=5",
  deck: "deck.js?v=7",
  account: "account.js?v=4",
  chat: "chat.js?v=21",
  support: "support.js?v=3",
};

/** Lazy, cached loaders for route-level feature bundles. */
export function createFeatureLoader(basePath = "") {
  const cache = new Map<FeatureName, Promise<unknown>>();

  const load = (name: FeatureName) => {
    const cached = cache.get(name);
    if (cached) return cached;
    const promise = import(`${basePath}/public/dist/${FEATURE_FILES[name]}`);
    cache.set(name, promise);
    return promise;
  };

  return {
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
