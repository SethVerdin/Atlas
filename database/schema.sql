-- Atlas database schema
-- Loaded automatically the first time the database is created (empty Docker volume).
-- See docs/database.md for what each table is for, and
-- docs/database-known-issues.md for limits to handle later.
--
-- WARNING: this file drops and recreates everything. Running it by hand against a
-- database that has data deletes that data.

DROP TABLE IF EXISTS workout_logs, exercises, meal_items, meals, food_logs, users CASCADE;
DROP TYPE IF EXISTS entry_status, meal_type, nutrient_source, weight_unit,
    exercise_category, muscle CASCADE;

-- Fixed lists. The database rejects any value not listed here (no typos).
CREATE TYPE entry_status      AS ENUM ('draft', 'saved');
CREATE TYPE meal_type         AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
CREATE TYPE nutrient_source   AS ENUM ('usda', 'estimated');
CREATE TYPE weight_unit       AS ENUM ('lb', 'kg');
CREATE TYPE exercise_category AS ENUM ('push', 'pull', 'legs', 'core', 'other');
-- One value per region on the body diagram.
CREATE TYPE muscle AS ENUM (
    'chest', 'front_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs',
    'upper_back', 'traps', 'lower_back', 'glutes', 'quads', 'hamstrings', 'calves'
);

-- Users: sign-in credentials, settings, and daily goals.
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    email          VARCHAR(255) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    time_zone      VARCHAR(64)  NOT NULL DEFAULT 'America/Chicago',  -- IANA name
    weight_unit    weight_unit  NOT NULL DEFAULT 'lb',
    goal_kcal      INT CHECK (goal_kcal > 0),
    goal_protein_g INT CHECK (goal_protein_g >= 0),
    goal_carbs_g   INT CHECK (goal_carbs_g >= 0),
    goal_fat_g     INT CHECK (goal_fat_g >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meals: one row per meal. Only status = 'saved' counts toward totals.
CREATE TABLE meals (
    meal_id    SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    meal_type  meal_type    NOT NULL,
    status     entry_status NOT NULL DEFAULT 'draft',
    raw_text   TEXT         NOT NULL,                  -- what the user typed or said
    eaten_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),    -- when it was eaten
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX meals_user_eaten_at ON meals (user_id, eaten_at);

-- Meal items: the foods in a meal. Per-100 g values are stored; the totals are
-- calculated by the database, so editing grams always updates them correctly.
CREATE TABLE meal_items (
    item_id          SERIAL PRIMARY KEY,
    meal_id          INT NOT NULL REFERENCES meals (meal_id) ON DELETE CASCADE,
    name             VARCHAR(200)    NOT NULL,
    grams            NUMERIC(7, 1)   NOT NULL CHECK (grams > 0),
    kcal_per_100g    NUMERIC(5, 1)   NOT NULL CHECK (kcal_per_100g BETWEEN 0 AND 900),
    protein_per_100g NUMERIC(4, 1)   NOT NULL CHECK (protein_per_100g BETWEEN 0 AND 100),
    carbs_per_100g   NUMERIC(4, 1)   NOT NULL CHECK (carbs_per_100g BETWEEN 0 AND 100),
    fat_per_100g     NUMERIC(4, 1)   NOT NULL CHECK (fat_per_100g BETWEEN 0 AND 100),
    kcal      NUMERIC(8, 1) GENERATED ALWAYS AS (ROUND(grams * kcal_per_100g / 100, 1)) STORED,
    protein_g NUMERIC(7, 1) GENERATED ALWAYS AS (ROUND(grams * protein_per_100g / 100, 1)) STORED,
    carbs_g   NUMERIC(7, 1) GENERATED ALWAYS AS (ROUND(grams * carbs_per_100g / 100, 1)) STORED,
    fat_g     NUMERIC(7, 1) GENERATED ALWAYS AS (ROUND(grams * fat_per_100g / 100, 1)) STORED,
    source           nutrient_source NOT NULL,
    fdc_id           INT,              -- USDA FoodData Central ID, when source = 'usda'
    estimate_basis   VARCHAR(200),     -- e.g. 'typical homemade recipe', when source = 'estimated'
    CONSTRAINT meal_items_source_details CHECK (
        (source = 'usda' AND fdc_id IS NOT NULL)
        OR (source = 'estimated' AND estimate_basis IS NOT NULL)
    )
);
CREATE INDEX meal_items_meal ON meal_items (meal_id);

-- Exercises: built-in (user_id empty) or a user's own (user_id set).
CREATE TABLE exercises (
    exercise_id       SERIAL PRIMARY KEY,
    user_id           INT REFERENCES users (user_id) ON DELETE CASCADE,
    name              VARCHAR(100)      NOT NULL,
    category          exercise_category NOT NULL DEFAULT 'other',
    primary_muscle    muscle,                          -- empty until known
    secondary_muscles muscle[]          NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ       NOT NULL DEFAULT now()
);
-- One name per user, ignoring case ('Bench Press' = 'bench press').
-- Built-in exercises share user 0 for this check.
CREATE UNIQUE INDEX exercises_unique_name ON exercises (COALESCE(user_id, 0), LOWER(name));

-- Workout logs: one row per exercise done, e.g. 3 x 8 at 185 lb.
-- Only status = 'saved' counts toward history, "Last:", and the muscle diagram.
CREATE TABLE workout_logs (
    log_id       SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    -- No cascade: an exercise that has logs can't be deleted, so history is kept.
    exercise_id  INT NOT NULL REFERENCES exercises (exercise_id),
    sets         INT          NOT NULL CHECK (sets >= 1),
    reps         INT          NOT NULL CHECK (reps >= 1),
    weight       NUMERIC(6, 1) CHECK (weight >= 0),   -- empty = bodyweight
    unit         weight_unit  NOT NULL DEFAULT 'lb',
    status       entry_status NOT NULL DEFAULT 'draft',
    raw_text     TEXT         NOT NULL,
    performed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX workout_logs_user_exercise ON workout_logs (user_id, exercise_id, performed_at);

-- Built-in exercises (the ones in the app mockup).
INSERT INTO exercises (name, category, primary_muscle, secondary_muscles) VALUES
    ('Bench Press',       'push', 'chest',       '{triceps, front_delts}'),
    ('Overhead Press',    'push', 'front_delts', '{triceps, traps}'),
    ('Back Squat',        'legs', 'quads',       '{glutes, hamstrings, lower_back}'),
    ('Romanian Deadlift', 'legs', 'hamstrings',  '{glutes, lower_back}'),
    ('Pull-up',           'pull', 'upper_back',  '{biceps, rear_delts}');
