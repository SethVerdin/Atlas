# Atlas AI agent: context and request design

How the API talks to Gemini Flash for chat-based meal and workout logging. It is based on
the Atlas Technical Evaluation. Guiding principle: **the model interprets, the code computes.**

The code lives in `api/src/agent/` and depends only on `zod`. It does not touch the
database, so it works with whatever schema the team settles on.

| File | Purpose |
| --- | --- |
| `systemPrompt.ts` | System instruction: persona, logging rules, estimate rules, advice limits, scope |
| `tools.ts` | Gemini function declarations (6 tools) + Zod schemas to validate the arguments Gemini sends |
| `mealDraft.ts` | Turns `draft_meal` arguments into a draft: USDA values or checked estimates, all math in code |
| `context.ts` | Builds each Gemini request: system prompt + tools + trimmed history + per-turn session context |
| `../examples/sample-turn.json` | One full chat turn, showing tool calls, an estimate, and what gets stored |

## How a request is built

Gemini is stateless, so every call sends:

1. **`systemInstruction`**, the same every time (`SYSTEM_PROMPT`).
2. **`tools`**: `search_foods`, `find_exercise`, `draft_meal`, `draft_workout`,
   `get_nutrition_summary`, `get_progress`. None takes a `userId`: the API scopes
   every call to the user in the auth token (OWASP API1). None writes data.
3. **`contents`**: the last 14 stored messages (user text + model replies only),
   then the new message prefixed with fresh session context:
   ```
   [Session context, provided by the app]
   Local time: 2026-10-08, 08:14 (America/New_York)
   Units: lb
   Daily goals: 2400 kcal, 160 g protein
   Pending unsaved draft: {...}
   [End session context]

   2 scrambled eggs and a slice of my mom's banana bread
   ```

### Context window strategy

- **History is needed but kept small.** Follow-ups ("about 200 g") and corrections
  ("make that 4 sets") need the previous turn; about 7 exchanges is enough.
- **Old tool traffic is not stored.** USDA payloads are large; the agent re-queries tools when it needs data.
- **The user's logs are not put in the prompt.** For advice, the agent calls
  `get_nutrition_summary` / `get_progress`.
- **Session context is rebuilt each turn and not stored**, so the date, goals, and draft are never stale.
- **The agent loop is capped at about 5 Gemini calls per turn**, which also protects
  the USDA 1,000 requests/hour limit.

## Agent loop (POST /v1/chat)

1. Load the user from the token, plus their last messages and pending draft.
2. `buildChatRequest(history, message, session)` and call Gemini.
3. For each `functionCall`: validate with `ToolArgs[name]`, run it for the token's user,
   and append the call and a `functionResponse`. Record fdcIds returned by `search_foods`
   in `seenFdcIds`. Repeat, up to about 5 calls.
4. On the final text reply: store the user message and reply, save any draft as pending,
   and return `{ reply, draft? }`. Nothing is written to the log until the user taps Save.

## Estimated nutrients

When USDA has no good match, the model may estimate per-100 g values, **only for foods
whose typical values are well established** (common whole foods, standard home recipes,
well-known products), with a one-line `estimateBasis`. For vague or unfamiliar foods it
asks one follow-up question instead.

Code still checks every estimate (`checkEstimate` in `mealDraft.ts`):

- protein + carbs + fat must not exceed 100 g per 100 g
- kcal must be within 20% (or 15 kcal) of 4P + 4C + 9F

A failed check goes back to Gemini as a tool error. The **API**, not the model, sets the
final `usda` / `estimated` label: an `fdcId` counts as USDA only if `search_foods`
returned it in the same turn.

## Integration notes for the team

- **Packages:** `zod` (v4) for these files; `@google/genai` for the Gemini call.
- **Database fit:** drafts are item-based (each food has its own grams, source, and
  macros), while `database/schema.sql` stores one row of totals per `food_logs` entry.
  To keep the USDA/estimated label and allow editing grams per item, we likely need a
  `food_log_items` table (or a JSONB `items` column). Team decision.
- **Model name:** keep it in config (`GEMINI_MODEL`), since Google renames models often.

## Open items

- Alcohol: the Atwater check rejects drinks (7 kcal/g alcohol). Add `alcohol_g` or exempt beverages.
- An AI test set, per the evaluation's Testing Strategy: foods that should use USDA,
  foods that should be estimated, and foods that should trigger a follow-up.
