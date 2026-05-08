import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "../api/types";
import { me } from "../api/api";
import { getToken, setToken } from "../api/http";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: User };

type AuthContextValue = {
  state: AuthState;
  setSession: (token: string, user: User, opts?: { persist?: boolean }) => void;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = getToken();
    return token ? { status: "loading", user: null } : { status: "anonymous", user: null };
  });

  const refresh = async () => {
    const token = getToken();
    if (!token) {
      setState({ status: "anonymous", user: null });
      return;
    }
    try {
      const r = await me();
      setState({ status: "authenticated", user: r.user });
    } catch {
      setToken(null);
      setState({ status: "anonymous", user: null });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      setSession: (token, user, opts) => {
        setToken(token, opts);
        setState({ status: "authenticated", user });
      },
      logout: () => {
        setToken(null);
        setState({ status: "anonymous", user: null });
      },
      refresh
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider ausente");
  return ctx;
}
