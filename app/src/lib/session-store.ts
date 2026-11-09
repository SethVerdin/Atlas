import * as SecureStore from 'expo-secure-store';

// The session token, kept in the iOS Keychain / Android Keystore.
// The web version is session-store.web.ts.
const KEY = 'atlas.session';

export const sessionStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
