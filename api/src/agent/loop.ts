// The agent loop for one /v1/chat turn (see docs/ai-agent.md, "Agent loop").
// Calls Gemini, runs any tool calls, feeds the results back, and repeats until
// Gemini answers in text or the call cap is reached.

import { buildChatRequest, type Content, type SessionContext, type StoredMessage, type WorkoutDraft } from "./context";
import { generateContent } from "./gemini";
import type { MealDraft } from "./mealDraft";
import { runTool, type ToolContext } from "./runTool";

// Caps Gemini calls per turn; also protects the USDA rate limit.
const MAX_GEMINI_CALLS = 5;

export interface TurnResult {
  reply: string;
  draft: MealDraft | WorkoutDraft | null;
}

export async function runChatTurn(
  history: StoredMessage[],
  message: string,
  session: SessionContext,
  ctx: ToolContext,
): Promise<TurnResult> {
  const request = buildChatRequest(history, message, session);
  const contents: Content[] = request.contents;

  for (let call = 0; call < MAX_GEMINI_CALLS; call++) {
    const content = await generateContent({ ...request, contents });
    const calls = content.parts.filter((p) => p.functionCall);

    if (!calls.length) {
      const text = content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      return { reply: text || fallbackReply(ctx.draft), draft: ctx.draft };
    }

    // The model turn goes back unchanged (it may carry thought signatures).
    contents.push(content as Content);
    const responses = [];
    for (const part of calls) {
      const fc = part.functionCall!;
      const response = await runTool(fc.name, fc.args, ctx);
      responses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response } });
    }
    contents.push({ role: "user", parts: responses });
  }

  return {
    reply: ctx.draft ? fallbackReply(ctx.draft) : "Sorry, I couldn't finish that one. Could you say it a different way?",
    draft: ctx.draft,
  };
}

function fallbackReply(draft: MealDraft | WorkoutDraft | null): string {
  return draft ? "Drafted. Review it, edit if needed, then tap Save." : "Sorry, I didn't catch that.";
}
