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

// ---- Types returned by the API (see api/src/chat.ts, drafts.ts, summary.ts) ----

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type MealItem = {
  itemId: number;
  name: string;
  grams: number;
  source: 'usda' | 'estimated';
  estimateBasis: string | null;
  per100g: Macros;
  totals: Macros;
};

export type MealDraft = {
  type: 'meal';
  status: 'draft' | 'saved';
  mealType: string; // breakfast | lunch | dinner | snack
  items: MealItem[];
  totals: Macros;
};

export type WorkoutEntry = {
  logId: number;
  name: string;
  sets: number;
  reps: number;
  weight: number | null; // null = bodyweight
  unit: 'lb' | 'kg';
};

export type WorkoutDraft = { type: 'workout'; status: 'draft' | 'saved'; entries: WorkoutEntry[] };

export type Draft = MealDraft | WorkoutDraft;

export type ChatMessage = {
  id: number;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  draft: Draft | null;
};

export type Today = {
  goals: { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
  totals: Macros;
  meals: { id: number; name: string; time: string; itemCount: number; kcal: number }[];
  nextMeal: string | null;
};

export type SavedExercise = {
  exerciseId: number;
  name: string;
  category: 'push' | 'pull' | 'legs' | 'core' | 'other';
  last: string;
  when: string;
};

export type Sex = 'male' | 'female' | 'other';
export type BodyGoal = 'lose' | 'maintain' | 'gain';

/** Answers to the first sign-in questions. Always metric; `units` is how weights are shown. */
export type Profile = { sex: Sex; age: number; heightCm: number; weightKg: number; goal: BodyGoal };

/** The signed-in user (api/src/profile.ts). `profile` is null until the first sign-in questions are answered. */
export type Me = {
  username: string;
  units: 'lb' | 'kg';
  profile: Profile | null;
  goals: Today['goals'];
};

/** Changes the user made to a draft before tapping Save. */
export type DraftEdits = {
  items?: { itemId: number; grams: number }[];
  entries?: { logId: number; sets: number; reps: number; weight: number | null }[];
};

// ---- Calls ----

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

// The session token sent with every request (set by lib/auth.tsx), and what to do
// when the API says it is no longer valid (sign out).
let sessionToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setSession(token: string | null, whenRejected: (() => void) | null = null) {
  sessionToken = token;
  onUnauthorized = whenRejected;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the Atlas API at ${API_URL}. Is it running (npm run dev)?`);
  }

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  // A signed-in request was rejected: the session expired or was signed out elsewhere.
  if (res.status === 401 && sessionToken) onUnauthorized?.();
  if (!res.ok) throw new Error(data.error ?? `Something went wrong (HTTP ${res.status}).`);
  return data;
}

const tzQuery = () => {
  const tz = timeZone();
  return tz ? `?timeZone=${encodeURIComponent(tz)}` : '';
};

/** The stored chat feed, oldest first. */
export async function getMessages(): Promise<ChatMessage[]> {
  return (await request<{ messages: ChatMessage[] }>('/v1/messages')).messages;
}

/** Sends one message to Atlas. Returns the stored user message and Atlas's reply (with any draft). */
export async function sendMessage(message: string): Promise<ChatMessage[]> {
  return (await request<{ messages: ChatMessage[] }>('/v1/chat', { message, timeZone: timeZone() })).messages;
}

/** Saves the draft shown under a model message, with any edits. Returns the saved draft. */
export async function saveDraft(messageId: number, edits: DraftEdits = {}): Promise<Draft> {
  return (await request<{ draft: Draft }>(`/v1/drafts/${messageId}/save`, edits)).draft;
}

export async function getToday(): Promise<Today> {
  return request<Today>(`/v1/today${tzQuery()}`);
}

export async function getExercises(): Promise<SavedExercise[]> {
  return (await request<{ exercises: SavedExercise[] }>(`/v1/exercises${tzQuery()}`)).exercises;
}

// ---- Account ----

type SignedIn = { token: string; user: Me };

export async function register(username: string, password: string): Promise<SignedIn> {
  return request<SignedIn>('/v1/auth/register', { username, password });
}

export async function login(username: string, password: string): Promise<SignedIn> {
  return request<SignedIn>('/v1/auth/login', { username, password });
}

export async function logout(): Promise<void> {
  await request('/v1/auth/logout', {});
}

export async function getMe(): Promise<Me> {
  return request<Me>('/v1/me');
}

/** Saves the first sign-in answers. The API works out the daily goals from them. */
export async function saveProfile(profile: Profile, units: Me['units']): Promise<Me> {
  return request<Me>('/v1/profile', { ...profile, units });
}
