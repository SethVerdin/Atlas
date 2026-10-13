# Atlas

490 Senior Project - Team 5

Atlas is a mobile fitness app where users log what they ate and how they trained by
chatting with an AI agent in plain language, such as "two scrambled eggs and a slice of
toast" or "bench press, 3 sets of 8 at 185". The agent turns each message into a draft
the user can edit before saving. It can also give basic fitness advice based on the
user's logged habits.

Guiding principle: **the model interprets, the code computes.** The AI decides what
was eaten or lifted and how much. Nutrient values come from USDA records whenever a
match exists. When no match exists, the AI may estimate them as a fallback (see
[How nutrient values are determined](#how-nutrient-values-are-determined)). All
arithmetic is done in code.

## Planned stack

| Layer | Technology |
| --- | --- |
| Mobile app | Expo (React Native) + TypeScript |
| API | Node.js + Fastify + TypeScript, running locally for the proof of concept |
| Database | PostgreSQL in Docker |
| AI | Google Gemini Flash (function calling) |
| Food data | USDA FoodData Central |

## How nutrient values are determined

Exact values won't always be available. USDA may have no record for a homemade dish
or a less common food, so the agent can estimate as a fallback. Each food in a meal
goes through these steps:

1. **USDA first.** The agent searches USDA FoodData Central. If a result clearly
   matches, its values are used and the item is labeled **USDA**.
2. **Estimate as a fallback.** If nothing matches but the food's typical values are
   well established (common whole foods, standard home recipes, widely known
   products), the agent estimates calories, protein, carbs, and fat per 100 g. It
   also gives a short reason, such as "typical homemade banana bread recipe". The
   item is labeled **Estimated**.
3. **Ask instead of guessing.** If the food is too vague or unfamiliar to estimate
   reasonably accurately, such as "some pasta thing" or an unknown restaurant dish,
   the agent asks one follow-up question about ingredients, brand, or preparation.
   It does the same when the amount is unknown ("a bowl").

Estimates are checked in code before the user sees them:

- protein + carbs + fat can't exceed 100 g per 100 g of food
- calories must be within 20% (or 15 kcal) of what the macros imply (4 kcal/g
  protein, 4 kcal/g carbs, 9 kcal/g fat)

If an estimate fails a check, it goes back to the agent to fix or to ask the user.
The **USDA** / **Estimated** label is set by the API, not the AI: an item counts as
USDA only if that record came back from a USDA search in the same chat turn.

Every meal is shown as an editable draft, and nothing is saved until the user taps
Save, so the user can correct any value first, estimated or not. The rules for the AI
live in [`api/src/agent/systemPrompt.ts`](api/src/agent/systemPrompt.ts) and the
checks in [`api/src/agent/mealDraft.ts`](api/src/agent/mealDraft.ts). See
[`docs/ai-agent.md`](docs/ai-agent.md) for details.

## Repository layout

```
database/
  schema.sql        Initial tables: users, food_logs
api/
  src/agent/        Gemini agent: system prompt, tool definitions, meal drafts, request builder
  examples/         One full chat turn as JSON
docs/
  ai-agent.md       How the agent and its context work (start here for the AI side)
docker-compose.yml  Local PostgreSQL
```

The app and API code are not in the repo yet.

## Prerequisites

- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/). On Windows it
  also needs WSL 2: run `wsl --install` in an Administrator PowerShell, then restart.
- [Node.js LTS](https://nodejs.org/), once the app and API code are added

## Local database setup

1. **Create a `.env` file** in the repo root (it is git-ignored) with a password of
   your choice:
   ```
   DB_PASSWORD=choose_a_local_password
   ```
   Docker Compose reads this automatically. Without it, Postgres starts with no password set.

2. **Start PostgreSQL.** Open Docker Desktop and wait until it shows "Engine running".
   Otherwise you'll get a "failed to connect to the docker API" error. Then, from
   the repo root:
   ```
   docker compose up -d
   ```
   This runs a container named `atlas_db` on **port 5433** (not the default 5432),
   with user `postgres` and database `atlas`.

3. **Load the schema.** It is not applied automatically.

   macOS / Linux / Git Bash:
   ```
   docker exec -i atlas_db psql -U postgres -d atlas < database/schema.sql
   ```
   Windows PowerShell:
   ```
   Get-Content database/schema.sql | docker exec -i atlas_db psql -U postgres -d atlas
   ```
   **Warning:** `schema.sql` drops and recreates its tables, so re-running it deletes
   all local data.

4. **Check that it worked:**
   ```
   docker exec -it atlas_db psql -U postgres -d atlas -c "\dt"
   ```
   You should see `users` and `food_logs`.

To stop the database, run `docker compose down`. Your data is kept in the `pgdata`
volume. To delete the data as well, run `docker compose down -v`.

Connection details for database tools such as DBeaver or pgAdmin: host `localhost`,
port `5433`, database `atlas`, user `postgres`, and the password from your `.env`.
