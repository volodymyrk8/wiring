import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { endpoints } from "./api/client";
import type { Me } from "./api/types";

type AuthState = {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser((await endpoints.me()).user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      login: async (email, password) => setUser((await endpoints.login(email.trim(), password)).user),
      register: async (name, email, password) => {
        await endpoints.register({ name: name.trim(), email: email.trim(), password });
        await endpoints.login(email.trim(), password);
        await refresh();
      },
      logout: async () => {
        try {
          await endpoints.logout();
        } finally {
          setUser(null);
        }
      },
    }),
    [user, loading, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
