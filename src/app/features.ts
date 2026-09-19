type FeatureName = "auth" | "home" | "profile" | "likes" | "person" | "deck" | "chat";

const FEATURE_FILES: Record<FeatureName, string> = {
  auth: "auth.js?v=4",
  home: "home.js?v=29",
  profile: "profile.js?v=2",
  likes: "likes.js?v=1",
  person: "person.js?v=1",
  deck: "deck.js?v=1",
  chat: "chat.js?v=1",
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
    chat: () => load("chat"),
  };
}
