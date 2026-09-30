import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { endpoints, setApiHooks } from "./api/client";
import { clearSession, getToken, loadTokens, setToken } from "./api/tokens";
import type { Me } from "./api/types";
import { unregisterPush } from "./push";

type AuthState = {
  user: Me | null;
  loading: boolean;
  upgradeRequired: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: Me) => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeRequired, setUpgradeRequired] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUser((await endpoints.me()).user);
    } catch {
      // Network errors keep the current user; a lost session is handled by the api hook.
    }
  }, []);

  useEffect(() => {
    setApiHooks({
      onSessionLost: () => setUser(null),
      onUpgradeRequired: (min) => setUpgradeRequired(min || "новой версии"),
    });
    (async () => {
      await loadTokens();
      if (getToken("access") || getToken("refresh")) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await endpoints.token(email.trim(), password);
    await setToken("access", res.access_token);
    await setToken("refresh", res.refresh_token);
    setUser(res.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      upgradeRequired,
      refresh,
      setUser,
      login: signIn,
      register: async (name, email, password) => {
        await endpoints.register({ name: name.trim(), email: email.trim(), password });
        await signIn(email, password);
      },
      logout: async () => {
        const refreshToken = getToken("refresh");
        const push = await unregisterPush().catch(() => null);
        try {
          await endpoints.logout(refreshToken, push);
        } catch {
          // Tokens are dropped locally either way.
        }
        await clearSession();
        setUser(null);
      },
    }),
    [user, loading, upgradeRequired, refresh, signIn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
