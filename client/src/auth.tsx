import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setOnAuthRequired } from "./api";
import type { SessionUser } from "./pages";

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const response = await api("/me");
      const next = response.data as SessionUser;
      setUser(next);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return null;
      }
      return user;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await api("/logout", { method: "POST" });
    } catch {
      /* session cookie is cleared on the server */
    }
    setUser(null);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setOnAuthRequired(() => setUser(null));
    return () => setOnAuthRequired(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
