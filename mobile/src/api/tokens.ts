import * as SecureStore from "expo-secure-store";

const KEYS = { access: "wiring.access", refresh: "wiring.refresh", push: "wiring.push" } as const;
type Key = keyof typeof KEYS;

let cache: Partial<Record<Key, string | null>> = {};

export async function loadTokens() {
  const [access, refresh, push] = await Promise.all([
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.push),
  ]);
  cache = { ...cache, access, refresh, push };
}

export const getToken = (key: Key): string | null => cache[key] ?? null;

export async function setToken(key: Key, value: string | null) {
  cache[key] = value;
  if (value) await SecureStore.setItemAsync(KEYS[key], value);
  else await SecureStore.deleteItemAsync(KEYS[key]);
}

export async function clearSession() {
  await Promise.all([setToken("access", null), setToken("refresh", null)]);
}
