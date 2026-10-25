// Minimal Gemini REST client (generateContent). The request body is the one
// buildChatRequest() produces, so no SDK is needed.

import { config } from "../config";

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  [key: string]: unknown; // e.g. thoughtSignature, which must be sent back unchanged
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** A failure the app can show as is. `status` is the HTTP status for the app. */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown, // logged for developers, never sent to the app
  ) {
    super(message);
  }
}

export async function generateContent(body: unknown): Promise<GeminiContent> {
  if (!config.gemini.apiKey) {
    throw new GeminiError("AI is not set up. Add GEMINI_API_KEY to .env and restart the API.", 503);
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey },
      body: JSON.stringify(body),
      // Gemini can "think" for a while before answering; 30 s was sometimes too short.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    const message = timedOut ? "The AI took too long to answer. Try again." : "Could not reach the AI service. Try again.";
    throw new GeminiError(message, 502, err);
  }

  if (!res.ok) {
    // 429 = rate limit, 503 = Google's servers are overloaded. Both are temporary.
    const busy = res.status === 429 || res.status === 503;
    const message = busy ? "The AI is busy right now. Wait a moment and try again." : "The AI service returned an error.";
    throw new GeminiError(message, 502, { status: res.status, body: await res.text() });
  }

  const data = (await res.json()) as {
    candidates?: { content?: GeminiContent; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const content = data.candidates?.[0]?.content;
  if (!content?.parts?.length) {
    throw new GeminiError("The AI didn't return an answer. Try rephrasing.", 502, {
      finishReason: data.candidates?.[0]?.finishReason,
      promptFeedback: data.promptFeedback,
    });
  }
  return { role: "model", parts: content.parts };
}
