# Atlas database

How the local PostgreSQL database is set up and what is in it. The setup lives in
`docker-compose.yml` and the tables in `database/schema.sql`.

For step-by-step setup commands, see the
[Local database setup](../README.md#local-database-setup) section of the README. This
page explains what you end up with.

## At a glance

| Item | Value |
| --- | --- |
| Database | PostgreSQL 15 (Docker image `postgres:15`) |
| Container name | `atlas_db` |
| Host port | **5433** (mapped to 5432 inside the container) |
| Database name | `atlas` |
| User | `postgres` |
| Password | `DB_PASSWORD` from your local `.env` (git-ignored) |
| Data storage | Docker volume `pgdata` |
| Restart policy | `always` |

The password is not stored in the repo. Without a `.env` file, Postgres starts with no
password set.

## Tables

```mermaid
erDiagram
    users ||--o{ food_logs : "has many"
    users {
        int user_id PK
        varchar email UK
        varchar password_hash
        timestamp created_at
    }
    food_logs {
        int log_id PK
        int user_id FK
        text raw_text
        numeric calories
        numeric protein
        numeric carbs
        numeric fat
        timestamp created_at
    }
```

### `users`

Stores sign-in credentials.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `SERIAL` | Primary key |
| `email` | `VARCHAR(255)` | Required, **unique** |
| `password_hash` | `VARCHAR(255)` | Required. Only a hash is stored, never the plain password |
| `created_at` | `TIMESTAMP` | Defaults to the current time |

### `food_logs`

Stores one logged meal: the user's original message and the nutrition values extracted
from it.

| Column | Type | Notes |
| --- | --- | --- |
| `log_id` | `SERIAL` | Primary key |
| `user_id` | `INT` | Required. Foreign key to `users(user_id)` |
| `raw_text` | `TEXT` | Required. The message exactly as the user typed it |
| `calories` | `NUMERIC(5, 1)` | Optional. Total for the meal |
| `protein` | `NUMERIC(5, 1)` | Optional. Total for the meal |
| `carbs` | `NUMERIC(5, 1)` | Optional. Total for the meal |
| `fat` | `NUMERIC(5, 1)` | Optional. Total for the meal |
| `created_at` | `TIMESTAMP` | Defaults to the current time |

## Design notes

- **One user, many logs.** Each row in `food_logs` belongs to exactly one user.
- **Deleting a user deletes their logs.** The foreign key (`fk_user`) uses
  `ON DELETE CASCADE`, so no orphaned logs are left behind.
- **The original message is kept.** `raw_text` is stored next to the parsed values, so
  a log can be re-checked or re-parsed later.
- **Values are totals per meal**, not per food item.
- **Units are not enforced by the schema.** The agent's drafts use kcal for calories and
  grams for protein, carbs, and fat.
- **Size limit.** `NUMERIC(5, 1)` holds up to 9999.9, which is plenty for one meal.
- **Passwords.** The column is named `password_hash` because the API is expected to
  store a salted hash. The auth code that does the hashing is not written yet.

## Loading and resetting the schema

The schema is **not** applied automatically when the container starts. It is loaded
with the command in the README.

`schema.sql` begins with `DROP TABLE IF EXISTS` for both tables, so running it again
**deletes all local data** and rebuilds the tables from scratch. That is handy for a
clean reset and dangerous if you have data you want to keep.

To check that the tables exist:

```
docker exec -it atlas_db psql -U postgres -d atlas -c "\dt"
```

You should see `users` and `food_logs`.

## Connecting with a database tool

For DBeaver, pgAdmin, or similar:

| Setting | Value |
| --- | --- |
| Host | `localhost` |
| Port | `5433` |
| Database | `atlas` |
| User | `postgres` |
| Password | the `DB_PASSWORD` from your `.env` |

## Not in the schema yet

These are known gaps, not mistakes:

- **Per-item meal data.** The AI agent builds drafts item by item (each food has its own
  grams, source, and macros), but `food_logs` only holds totals. See "Integration notes
  for the team" in [`ai-agent.md`](ai-agent.md): the team still needs to choose between a
  `food_log_items` table and a JSONB `items` column.
- **Chat history and pending drafts.** The agent loop in `ai-agent.md` loads recent
  messages and an unsaved draft, but there is no table for either yet.
- **Workout logging.** Deferred past Sprint 1.
- **Micronutrients.** The sprint goal mentions them, but the schema only has calories,
  protein, carbs, and fat.
- **Migrations.** There is a single `schema.sql` that rebuilds everything. When it
  changes, mention it in the pull request so teammates know to reload it.
