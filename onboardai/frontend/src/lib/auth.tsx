import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { api, setAccessToken } from "./api";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_KEY = "onboardai_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, try to restore a session via the httpOnly refresh cookie.
  useEffect(() => {
    (async () => {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) {
        const refreshed = await api.refresh();
        if (refreshed) {
          setUser(JSON.parse(stored) as AuthUser);
        } else {
          localStorage.removeItem(USER_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string): Promise<AuthUser> {
    const data = await api.post<{ accessToken: string; user: AuthUser }>("/auth/login", {
      email,
      password,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
