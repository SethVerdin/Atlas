import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as api from '@/lib/api';
import { clearToken, loadToken, saveToken } from '@/lib/session';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: api.Account };

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Saves account changes (name, units, goals) and updates `user`. */
  updateAccount: (update: api.AccountUpdate) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGNED_OUT: AuthState = { status: 'signedOut', user: null };

/** Keeps track of who is signed in and remembers them between launches. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const forget = useCallback(async () => {
    api.setAuthToken(null);
    await clearToken();
    setState(SIGNED_OUT);
  }, []);

  // On launch: reuse a saved token if the API still accepts it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await loadToken();
      if (!token) return !cancelled && setState(SIGNED_OUT);
      api.setAuthToken(token);
      try {
        const user = await api.getMe();
        if (!cancelled) setState({ status: 'signedIn', user });
      } catch {
        // Expired or revoked: the 401 handler below signs out. If the API is just
        // unreachable, start signed out too; signing in again shows the real error.
        if (!cancelled) await forget();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forget]);

  // Any request rejected for a bad token sends the user back to the login screen.
  useEffect(() => {
    api.setUnauthorizedHandler(() => void forget());
    return () => api.setUnauthorizedHandler(null);
  }, [forget]);

  const begin = useCallback(async ({ token, user }: { token: string; user: api.Account }) => {
    api.setAuthToken(token);
    await saveToken(token);
    setState({ status: 'signedIn', user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: async (email, password) => begin(await api.login(email, password)),
      signUp: async (email, password, displayName) => begin(await api.register(email, password, displayName)),
      signOut: async () => {
        await api.logout().catch(() => {}); // still sign out locally if the API is down
        await forget();
      },
      updateAccount: async (update) => {
        const user = await api.updateMe(update);
        setState({ status: 'signedIn', user });
      },
      deleteAccount: async (password) => {
        await api.deleteAccount(password);
        await forget();
      },
    }),
    [state, begin, forget],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider> (see app/_layout.tsx).');
  return ctx;
}
