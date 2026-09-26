type FeatureName = "auth" | "home" | "profile" | "likes" | "person" | "deck" | "account" | "chat" | "support";

const FEATURE_FILES: Record<FeatureName, string> = {
  auth: "auth.js?v=9",
  home: "home.js?v=68",
  profile: "profile.js?v=21",
  likes: "likes.js?v=25",
  person: "person.js?v=13",
  deck: "deck.js?v=18",
  account: "account.js?v=5",
  chat: "chat.js?v=22",
  support: "support.js?v=5",
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
