import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearTokens, hasStoredSession, onSessionExpired, setTokens } from './api';
import type { TokenPair, User } from './types';

interface AuthState {
  user: User | null;
  /** True while a stored session is being restored after a page reload. */
  restoring: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(hasStoredSession());

  // A dead refresh token anywhere in the app logs the user out; route guards then show the login screen.
  useEffect(() => {
    onSessionExpired(() => setUser(null));
    return () => onSessionExpired(null);
  }, []);

  // After a reload the access token is gone; /auth/me gets a 401, the helper
  // refreshes with the stored refresh token and retries.
  useEffect(() => {
    if (!hasStoredSession()) return;
    let cancelled = false;
    api<User>('/api/v1/auth/me')
      .then((u) => !cancelled && setUser(u))
      .catch(() => {})
      .finally(() => !cancelled && setRestoring(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<TokenPair>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refresh_token = localStorage.getItem('refresh_token');
    if (refresh_token) {
      await api('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token }) }).catch(() => {});
    }
    clearTokens();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, restoring, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
