// Builds the Gemini request body for one /v1/chat turn.
//
// Context strategy:
// - Gemini is stateless, so the API resends recent history each turn.
// - History holds only user text and model replies (plus a compact draft note).
//   Tool calls and raw USDA results from earlier turns are dropped: they are large
//   and the agent can re-query tools when it needs data.
// - Fresh per-turn facts (date, units, goals, pending draft) are prepended to the
//   new user message, so they are always current and never go stale in history.

import { SYSTEM_PROMPT } from "./systemPrompt";
import { TOOL_DECLARATIONS } from "./tools";
import type { MealDraft } from "./mealDraft";

// Last N stored messages (user + model). About 7 exchanges is enough for
// follow-ups and corrections without paying for long histories.
export const MAX_HISTORY_MESSAGES = 14;

export interface StoredMessage {
  role: "user" | "model";
  text: string;
}

export interface WorkoutDraft {
  type: "workout";
  exercises: { exerciseId?: string; name: string; sets: { reps: number; weight: number }[] }[];
}

export interface SessionContext {
  now: Date;
  timeZone: string; // IANA, e.g. "America/New_York"
  units: "lb" | "kg";
  goals?: { kcal?: number; protein_g?: number };
  pendingDraft?: MealDraft | WorkoutDraft | null; // last unsaved draft shown to the user
}

type Part = { text: string } | { functionCall: unknown } | { functionResponse: unknown };
export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export function formatSession(s: SessionContext): string {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: s.timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(s.now);

  const lines = [`Local time: ${localDate} (${s.timeZone})`, `Units: ${s.units}`];
  const goals = [s.goals?.kcal && `${s.goals.kcal} kcal`, s.goals?.protein_g && `${s.goals.protein_g} g protein`];
  if (goals.some(Boolean)) lines.push(`Daily goals: ${goals.filter(Boolean).join(", ")}`);
  if (s.pendingDraft) {
    lines.push(`Pending unsaved draft: ${JSON.stringify(compactDraft(s.pendingDraft))}`);
  }
  return `[Session context, provided by the app]\n${lines.join("\n")}\n[End session context]`;
}

// Keeps the draft small in the prompt: the model needs what was logged, not computed totals.
function compactDraft(d: MealDraft | WorkoutDraft) {
  if (d.type === "workout") return d;
  return {
    type: "meal",
    items: d.items.map((i) => ({ name: i.name, grams: i.grams, source: i.source, fdcId: i.fdcId })),
  };
}

export function buildChatRequest(history: StoredMessage[], message: string, session: SessionContext) {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  // Gemini expects the conversation to start with a user turn.
  while (recent.length && recent[0].role !== "user") recent.shift();

  const contents: Content[] = recent.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({
    role: "user",
    parts: [{ text: `${formatSession(session)}\n\n${message}` }],
  });

  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    tools: TOOL_DECLARATIONS,
    contents,
    generationConfig: {
      temperature: 0.4, // lower = more consistent food parsing and estimates
      maxOutputTokens: 800,
    },
  };
}
