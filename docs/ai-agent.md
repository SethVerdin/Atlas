# Atlas AI agent: context and request design

How the API talks to Gemini Flash for chat-based meal and workout logging. It is based on
the Atlas Technical Evaluation. Guiding principle: **the model interprets, the code computes.**

The agent lives in `api/src/agent/`. The routes that use it are `api/src/chat.ts` and
`api/src/drafts.ts`.

| File | Purpose |
| --- | --- |
| `systemPrompt.ts` | System instruction: persona, logging rules, estimate rules, advice limits, scope |
| `tools.ts` | Gemini function declarations (6 tools) + Zod schemas to validate the arguments Gemini sends |
| `loop.ts` | The agent loop for one turn: call Gemini, run tool calls, repeat (up to 5 calls) |
| `runTool.ts` | Runs one tool call, scoped to the current user. Reads only `saved` rows |
| `gemini.ts` | Gemini REST call (60 s timeout) and the error messages the app shows |
| `usda.ts` | `search_foods`: USDA FoodData Central search; results cached in `usda_foods` |
| `mealDraft.ts` | Turns `draft_meal` arguments into a draft: USDA values or checked estimates, all math in code |
| `workoutDraft.ts` | Turns `draft_workout` arguments into a draft; exercise IDs are checked against the catalog |
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

1. Load the user (the demo user until sign-in exists; `api/src/user.ts`), their last 14
   messages from `chat_messages`, and their latest unsaved draft.
2. `buildChatRequest(history, message, session)` and call Gemini.
3. For each `functionCall`: validate with `ToolArgs[name]`, run it for the current user,
   and append the call and a `functionResponse`. Record fdcIds returned by `search_foods`
   in `seenFdcIds`. The model's turn is sent back unchanged, since newer models attach
   thought signatures to function calls. Repeat, up to 5 Gemini calls.
4. On the final text reply: store the user message and reply in `chat_messages`, and store
   any draft as `status = 'draft'` rows (`meals` + `meal_items`, or `workout_logs`)
   linked to the reply. A new draft replaces the user's earlier unsaved draft of the same
   kind (e.g. "make that 4 sets"). Return both messages, with the draft attached.
5. `POST /v1/drafts/:messageId/save` applies the user's edits (grams per item, or sets /
   reps / weight per row) and flips the rows to `saved`. Repeating it is harmless. Only
   saved rows count in totals, history, and the agent's summary tools.

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

- **Packages:** `zod` (v4) is installed in `api/package.json`. The Gemini call uses
  Node's built-in `fetch` against the REST API, so no Google SDK is needed.
  `@google/genai` is optional if the team prefers the SDK later.
- **CI:** the agent files are part of the API, so CI lints, type-checks, and builds them
  on every pull request (see the README's Continuous integration section).
- **Endpoints** (used by the app's home screen, `app/src/app/index.tsx`):
  - `GET /v1/messages`: the stored feed (last 100), each model message with its draft.
  - `POST /v1/chat` `{ message, timeZone }` → `{ messages: [user, model] }`. History
    is loaded from `chat_messages`, so the app no longer sends it. Errors return
    `{ error }` (400 bad input, 503 no `GEMINI_API_KEY`, 502 Gemini failure).
  - `POST /v1/drafts/:messageId/save` `{ items?: [{ itemId, grams }], entries?: [{ logId,
    sets, reps, weight }] }` → `{ draft }` (404 if a newer draft replaced it).
  - `GET /v1/today` and `GET /v1/exercises` (`api/src/summary.ts`) feed the Macros and
    Exercises buttons. Both take `?timeZone=`.
  - **Tools are sent.** The temporary `NO_TOOLS_NOTE` from the first version is gone.
  - **Output cap.** `maxOutputTokens` (in `context.ts`) is 4096 because it counts
    Gemini's internal thinking tokens as well as the reply. At 800, thinking (often
    600+ tokens) left too little room, and replies were cut off mid-sentence. Reply
    length is kept short by the prompt instead.
  - **Timeout and errors.** Gemini gets 60 s; answers sometimes take 25+ s. Error
    messages shown in the app: Google 429 (rate limit) and 503 (overloaded) → "The AI
    is busy right now"; timeout → "The AI took too long"; anything else → "The AI
    service returned an error". Google's full error is in the API log.
- **Not built yet:** sign-in (every request acts as the seeded demo user), and in-app
  speech-to-text on iOS/Android (Expo Go has no speech module; the talk panel takes typed
  text, and the keyboard's dictation works. On web it listens via the Web Speech API).
- **Database fit:** drafts are item-based, matching the `meals` + `meal_items` tables
  (each food keeps its grams, source, and per-100 g values). A `usda` item needs an
  `fdc_id` and an `estimated` item needs an `estimate_basis`. A workout draft with
  uneven sets (8, 8, 6) becomes one `workout_logs` row per run of identical sets. See
  `docs/database.md`.
- **Model name:** keep it in config (`GEMINI_MODEL`), since Google renames models often.

## Open items

- Markdown in replies: the prompt now asks for plain text, since the feed doesn't render
  Markdown. If Gemini still slips, render Markdown in the app instead.
- Alcohol: the Atwater check rejects drinks (7 kcal/g alcohol). Add `alcohol_g` or exempt beverages.
- An AI test set, per the evaluation's Testing Strategy: foods that should use USDA,
  foods that should be estimated, and foods that should trigger a follow-up.
