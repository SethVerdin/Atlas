import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Where the Atlas API lives.
// 1. EXPO_PUBLIC_API_URL, if set (e.g. in app/.env), always wins.
// 2. On a phone running Expo Go, use the same computer that serves the app
//    (the host from the Metro dev server URL) on port 3000.
// 3. Otherwise localhost (web, iOS simulator). Android emulators reach the
//    computer at 10.0.2.2.
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:3000`;

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function askAtlas(message: string, history: ChatMessage[]): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
  } catch {
    throw new Error(`Can't reach the Atlas API at ${API_URL}. Is it running (npm run dev)?`);
  }

  const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
  if (!res.ok || !data.reply) {
    throw new Error(data.error ?? `Something went wrong (HTTP ${res.status}).`);
  }
  return data.reply;
}
