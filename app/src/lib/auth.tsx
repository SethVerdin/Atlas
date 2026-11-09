import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getMe, login, logout, register, setSession, type Me } from '@/lib/api';
import { sessionStore } from '@/lib/session-store';

type AuthState =
  | { status: 'loading' }
  | { status: 'unreachable'; error: string } // a saved session couldn't be checked
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: Me };

type AuthContextValue = {
  state: AuthState;
  signIn: (mode: 'login' | 'register', username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Replaces the signed-in user, e.g. after the first sign-in questions are saved. */
  setUser: (user: Me) => void;
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Keeps the session: restores a saved token on launch, signs in or up, and signs out
 * (also when the API rejects the token). The root layout picks the screen from `state`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Forget the session on this device. Used directly when the API rejects the token.
  const clear = useCallback(() => {
    setSession(null);
    sessionStore.clear().catch(() => {});
    setState({ status: 'signedOut' });
  }, []);

  const restore = useCallback(async () => {
    setState({ status: 'loading' });
    const token = await sessionStore.get().catch(() => null);
    if (!token) return setState({ status: 'signedOut' });
    setSession(token, clear);
    try {
      setState({ status: 'signedIn', user: await getMe() });
    } catch (e) {
      // A rejected token already signed out (see `clear`); anything else is the network.
      setState((s) =>
        s.status === 'signedOut' ? s : { status: 'unreachable', error: e instanceof Error ? e.message : String(e) },
      );
    }
  }, [clear]);

  useEffect(() => {
    restore();
  }, [restore]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: async (mode, username, password) => {
        const { token, user } = await (mode === 'login' ? login : register)(username, password);
        setSession(token, clear);
        await sessionStore.set(token).catch(() => {}); // still signed in for this launch
        setState({ status: 'signedIn', user });
      },
      signOut: async () => {
        await logout().catch(() => {}); // sign out locally even if the API is unreachable
        clear();
      },
      setUser: (user) => setState({ status: 'signedIn', user }),
      retry: restore,
    }),
    [state, clear, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
