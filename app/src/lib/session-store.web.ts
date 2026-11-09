// Browsers have no secure store, so the session token lives in localStorage.
// Guarded because the static web build also renders without a window.
const KEY = 'atlas.session';

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

export const sessionStore = {
  get: async () => storage()?.getItem(KEY) ?? null,
  set: async (token: string) => storage()?.setItem(KEY, token),
  clear: async () => storage()?.removeItem(KEY),
};
