// POST /v1/chat: send a question to Gemini and return its text reply.
//
// First version for the app's Ask screen. It reuses the agent's system prompt and
// request builder (src/agent/context.ts) but does NOT send tool declarations yet,
// because search_foods, draft_meal, etc. are not implemented. Once they are, this
// handler grows into the full agent loop described in docs/ai-agent.md.
//
// History comes from the app for now (no auth or message storage yet). It is
// validated and trimmed, so the client cannot send unbounded context.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildChatRequest, MAX_HISTORY_MESSAGES } from "./agent/context";
import { config } from "./config";

const ChatBody = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().min(1).max(4000) }))
    .max(50)
    .default([]),
  timeZone: z.string().min(1).max(64).default("UTC"),
  units: z.enum(["lb", "kg"]).default("lb"),
});

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; functionCall?: { name?: string } }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

// The system prompt is written for the full agent and tells Gemini to call tools
// (search_foods, get_nutrition_summary, ...). Without tool declarations Gemini still
// tries, and replies with a function call instead of text. Until the tools exist,
// this note overrides those instructions. Remove it when tools are sent.
const NO_TOOLS_NOTE = `
TEMPORARY: TOOLS ARE NOT AVAILABLE IN THIS VERSION.
- Do not call any functions or tools. Always answer directly in plain text.
- You cannot see the user's logged meals, workouts, or progress yet. Give general
  advice and say it is general.
- Nothing can be logged or saved yet. Never say that you logged, drafted, or saved
  anything.
- For a described meal, give approximate calories, protein, carbs, and fat based on
  typical values, and clearly label them as estimates. If the food or amount is too
  vague to estimate reasonably, ask one short question instead.
`;

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function registerChatRoutes(app: FastifyInstance) {
  app.post("/v1/chat", async (req, reply) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", issues: parsed.error.issues.map((i) => i.message) });
    }
    if (!config.gemini.apiKey) {
      return reply.code(503).send({ error: "AI is not set up. Add GEMINI_API_KEY to .env and restart the API." });
    }

    const { message, history, units } = parsed.data;
    const timeZone = isValidTimeZone(parsed.data.timeZone) ? parsed.data.timeZone : "UTC";

    // No tools until they are implemented; see the note at the top of this file.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tools, ...body } = buildChatRequest(history.slice(-MAX_HISTORY_MESSAGES), message, {
      now: new Date(),
      timeZone,
      units,
    });
    body.systemInstruction.parts[0].text += `\n${NO_TOOLS_NOTE}`;

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
      req.log.error(err, "Gemini request failed");
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      const error = timedOut ? "The AI took too long to answer. Try again." : "Could not reach the AI service. Try again.";
      return reply.code(502).send({ error });
    }

    if (!res.ok) {
      // Log Google's error for developers, but don't pass it to the app.
      req.log.error({ status: res.status, body: await res.text() }, "Gemini returned an error");
      // 429 = rate limit, 503 = Google's servers are overloaded. Both are temporary.
      const busy = res.status === 429 || res.status === 503;
      const error = busy ? "The AI is busy right now. Wait a moment and try again." : "The AI service returned an error.";
      return reply.code(502).send({ error });
    }

    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const attemptedTools = parts.flatMap((p) => (p.functionCall?.name ? [p.functionCall.name] : []));
      req.log.warn(
        { promptFeedback: data.promptFeedback, finishReason: data.candidates?.[0]?.finishReason, attemptedTools },
        "Empty Gemini reply",
      );
      return reply.code(502).send({ error: "The AI didn't return an answer. Try rephrasing your question." });
    }

    return { reply: text };
  });
}
