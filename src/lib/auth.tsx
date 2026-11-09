import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, clearTokens, errorMessage, hasStoredSession, onSessionExpired, setTokens } from './api';
import type { TokenPair, User } from './types';

interface AuthState {
  user: User | null;
  /** True while a stored session is being restored after a page reload. */
  restoring: boolean;
  /** Set when the stored session could not be checked because the server was unreachable or failing. */
  restoreError: string;
  retryRestore: () => void;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(hasStoredSession());
  const [restoreError, setRestoreError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // A dead refresh token anywhere in the app logs the user out; route guards then show the login screen.
  useEffect(() => {
    onSessionExpired(() => setUser(null));
    return () => onSessionExpired(null);
  }, []);

  // After a reload the access token is gone; /auth/me gets a 401, the helper
  // refreshes with the stored refresh token and retries.
  // A network error or 5xx keeps the session and shows "can't reach the server"; only a dead session logs out.
  useEffect(() => {
    if (!hasStoredSession()) return;
    let cancelled = false;
    setRestoring(true);
    setRestoreError('');
    api<User>('/api/v1/auth/me')
      .then((u) => !cancelled && setUser(u))
      .catch((e) => {
        if (cancelled) return;
        const unreachable = e instanceof ApiError && (e.status === 0 || e.status >= 500);
        if (unreachable && hasStoredSession()) setRestoreError(errorMessage(e));
      })
      .finally(() => !cancelled && setRestoring(false));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retryRestore = useCallback(() => setAttempt((n) => n + 1), []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<TokenPair>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.access_token, data.refresh_token);
    setRestoreError('');
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refresh_token = localStorage.getItem('refresh_token');
    if (refresh_token) {
      await api('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token }) }).catch(() => {});
    }
    clearTokens();
    setRestoreError('');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, restoring, restoreError, retryRestore, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
