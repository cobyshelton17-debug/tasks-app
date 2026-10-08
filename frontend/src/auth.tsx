import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { api, type User } from "./api";

type AuthState = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  });

  const value = useMemo<AuthState>(
    () => ({
      user,
      async login(email, password) {
        const res = await api.login({ email, password });
        localStorage.setItem("token", res.token);
        localStorage.setItem("user", JSON.stringify(res.user));
        setUser(res.user);
      },
      async register(email, name, password) {
        const res = await api.register({ email, name, password });
        localStorage.setItem("token", res.token);
        localStorage.setItem("user", JSON.stringify(res.user));
        setUser(res.user);
      },
      logout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
