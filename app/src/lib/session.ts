import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Where the sign-in token is kept between app launches.
// Phones: the device keychain / keystore (expo-secure-store).
// Web: localStorage, since secure-store isn't available in the browser.

const KEY = 'atlas.session';

export async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, token);
    else await SecureStore.setItemAsync(KEY, token);
  } catch {
    // Storage blocked (e.g. private browsing): the user stays signed in until the app closes.
  }
}

export async function clearToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing stored.
  }
}
