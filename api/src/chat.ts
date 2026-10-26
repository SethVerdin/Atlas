// Chat for the home screen feed.
//
//   GET  /v1/messages          the feed: stored messages, each with its draft (if any)
//   POST /v1/chat              one agent turn (docs/ai-agent.md, "Agent loop")
//   POST /v1/drafts/:id/save   save the draft shown under model message :id
//
// History is stored in chat_messages and loaded here, so the app sends only the
// new message. A turn's draft is stored with status = 'draft' (src/drafts.ts) and
// counts nowhere until the user taps Save.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MAX_HISTORY_MESSAGES, type StoredMessage } from "./agent/context";
import { GeminiError } from "./agent/gemini";
import { runChatTurn } from "./agent/loop";
import { db } from "./db";
import { DraftEdits, loadDraftViews, pendingDraftForAgent, saveDraft, storeDraft } from "./drafts";
import { isValidTimeZone } from "./time";
import { currentUserId, loadUser } from "./user";

const ChatBody = z.object({
  message: z.string().trim().min(1).max(2000),
  timeZone: z.string().min(1).max(64).optional(),
});

interface MessageRow {
  message_id: number;
  role: "user" | "model";
  text: string;
  created_at: Date;
}

async function withDrafts(userId: number, rows: MessageRow[]) {
  const drafts = await loadDraftViews(
    userId,
    rows.filter((r) => r.role === "model").map((r) => r.message_id),
  );
  return rows.map((r) => ({
    id: r.message_id,
    role: r.role,
    text: r.text,
    createdAt: r.created_at.toISOString(),
    draft: drafts.get(r.message_id) ?? null,
  }));
}

export async function registerChatRoutes(app: FastifyInstance) {
  app.get("/v1/messages", async () => {
    const userId = await currentUserId();
    const { rows } = await db.query<MessageRow>(
      `select * from (
         select message_id, role, text, created_at from chat_messages
         where user_id = $1 order by message_id desc limit 100
       ) recent order by message_id`,
      [userId],
    );
    return { messages: await withDrafts(userId, rows) };
  });

  app.post("/v1/chat", async (req, reply) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", issues: parsed.error.issues.map((i) => i.message) });
    }
    const userId = await currentUserId();
    const user = await loadUser(userId);
    const { message } = parsed.data;
    const timeZone = isValidTimeZone(parsed.data.timeZone) ? parsed.data.timeZone : user.timeZone;

    const history = await db.query<StoredMessage>(
      `select role, text from (
         select message_id, role, text from chat_messages where user_id = $1 order by message_id desc limit $2
       ) recent order by message_id`,
      [userId, MAX_HISTORY_MESSAGES],
    );

    let result;
    try {
      result = await runChatTurn(
        history.rows,
        message,
        {
          now: new Date(),
          timeZone,
          units: user.units,
          goals: { kcal: user.goals.kcal ?? undefined, protein_g: user.goals.protein_g ?? undefined },
          pendingDraft: await pendingDraftForAgent(userId),
        },
        { userId, timeZone, goals: user.goals, seenFdcIds: new Set(), draft: null },
      );
    } catch (err) {
      if (err instanceof GeminiError) {
        // Log Google's error for developers, but don't pass it to the app.
        req.log.error({ detail: err.detail }, err.message);
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }

    let stored: MessageRow[];
    const client = await db.connect();
    try {
      await client.query("begin");
      const userMsg = await client.query<MessageRow>(
        `insert into chat_messages (user_id, role, text) values ($1, 'user', $2)
         returning message_id, role, text, created_at`,
        [userId, message],
      );
      const modelMsg = await client.query<MessageRow>(
        `insert into chat_messages (user_id, role, text) values ($1, 'model', $2)
         returning message_id, role, text, created_at`,
        [userId, result.reply],
      );
      if (result.draft) {
        await storeDraft(client, {
          userId,
          messageId: modelMsg.rows[0].message_id,
          rawText: message,
          timeZone,
          units: user.units,
          draft: result.draft,
        });
      }
      await client.query("commit");
      stored = [userMsg.rows[0], modelMsg.rows[0]];
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    // Same shape as GET /v1/messages, with the stored draft attached.
    return { messages: await withDrafts(userId, stored) };
  });

  app.post<{ Params: { id: string } }>("/v1/drafts/:id/save", async (req, reply) => {
    const messageId = Number(req.params.id);
    const edits = DraftEdits.safeParse(req.body ?? {});
    if (!Number.isInteger(messageId) || !edits.success) {
      return reply.code(400).send({ error: "Invalid request" });
    }
    const userId = await currentUserId();
    const draft = await saveDraft(userId, messageId, edits.data);
    if (!draft) return reply.code(404).send({ error: "This draft was replaced by a newer one." });
    return { draft };
  });
}
