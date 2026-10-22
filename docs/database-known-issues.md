# Database: known issues to handle later

These issues came up while planning the simple 5-table schema (`users`, `meals`,
`meal_items`, `exercises`, `workout_logs`). The schema already prevents several others
with constraints: per-100 g values, unique exercise names, time zones, fixed muscle and
status lists, and USDA IDs. The ones below are **not** handled by the schema and need
care in code or a later change.

## Handle in code now

1. **Drafts counted as real data.** Meals and workout logs have `status` = `draft` or
   `saved`. Any query for totals, history, "Last: 3 × 8", or the muscle diagram must use
   only `saved` rows, or unsaved drafts will inflate the numbers.
   *Later fix:* database views such as `saved_meals` that everyone queries instead.

2. **Users seeing each other's data.** Every query must filter by the user ID taken from
   the login token, never by an ID sent from the app or the AI.
   *Check:* a test that user B gets nothing back for user A's meals and workouts.

3. **Double-tapped Save.** The app should disable Save while a save is in progress. Save
   should only change a draft's `status` to `saved`, which is safe to repeat, rather
   than insert a new row.

4. **Implausible numbers from the AI.** The schema blocks impossible values (negative
   grams, 0 reps, more than 900 kcal or 100 g of a macro per 100 g), but not values that
   are merely wrong (a 500 kcal egg). Keep the estimate checks in
   `api/src/agent/mealDraft.ts` and validate AI output before saving.

5. **Custom exercises can repeat a built-in name.** Names are unique per user, so a user
   can still create their own "bench press" next to the built-in "Bench Press", which
   splits their history. When the AI resolves an exercise, it should match built-in
   exercises (and the user's existing ones) before creating a new one.

## Known limits of the simple design

6. **Mixed lb and kg.** `workout_logs` stores weight in the unit the user entered. If a
   user switches units, progress charts must convert to one unit before comparing.
   *Later fix:* store everything in kg and convert only for display.

7. **One row per exercise, not per set.** `sets`, `reps`, `weight` describe all sets the
   same way. "3 × 8, last set 6 reps" or a drop set can't be recorded exactly.
   *Later fix:* an `exercise_sets` table with one row per set.

8. **Deleting an exercise that has history.** Deleting is blocked while workout logs use
   it (the foreign key has no cascade). The app needs a "hide" option instead.
   *Later fix:* an `is_archived` column on `exercises`.

9. **Abandoned drafts pile up.** Drafts the user never saves stay forever.
   *Later fix:* a cleanup job that deletes drafts older than a few days.

## Process

10. **Re-running `schema.sql` deletes all data.** It starts with `DROP TABLE`. That's fine
   while there's only test data. Once real data exists, make changes as small numbered
   migration files (e.g. `002_add_exercise_archive.sql`) instead of re-running the
   whole schema.

## Left out on purpose (add when a feature needs them)

| Feature | What to add |
| --- | --- |
| Chat history that survives an app restart | `chat_messages` table |
| Per-set detail | `exercise_sets` table (see 7) |
| Goal history (chart goal changes over time) | `goals` table with start dates |
| Grouping exercises into workout sessions | `workouts` table |
| Fewer USDA API calls | `usda_foods` cache table |
| Many exercises sharing complex muscle data | `muscle_groups` + `exercise_muscles` tables, replacing the muscle columns |
