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

// When Google is overloaded it either answers 503 right away or leaves the request
// hanging. A turn makes several calls, so one hiccup would fail the whole answer:
// each call gets a short timeout and is retried a few times with a growing pause.
const ATTEMPT_TIMEOUT_MS = 25_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000]; // up to 4 attempts in total
// 429 = rate limit, 500/503/504 = Google-side trouble. All usually pass quickly.
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateContent(body: unknown): Promise<GeminiContent> {
  if (!config.gemini.apiKey) {
    throw new GeminiError("AI is not set up. Add GEMINI_API_KEY to .env and restart the API.", 503);
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`;

  let res: Response | undefined;
  let lastError: GeminiError | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      const message = timedOut ? "The AI took too long to answer. Try again." : "Could not reach the AI service. Try again.";
      lastError = new GeminiError(message, 502, { attempts: attempt + 1, err });
      res = undefined;
      continue;
    }
    if (res.ok || !RETRYABLE_STATUS.has(res.status)) break;
    lastError = new GeminiError("The AI is busy right now. Wait a moment and try again.", 502, {
      attempts: attempt + 1,
      status: res.status,
      body: await res.text(),
    });
    res = undefined;
  }

  if (!res) throw lastError!;
  if (!res.ok) {
    throw new GeminiError("The AI service returned an error.", 502, { status: res.status, body: await res.text() });
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
