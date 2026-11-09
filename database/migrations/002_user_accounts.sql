-- 002: sign-in with a username and password, sessions, and the profile asked for on
-- first sign-in (used to work out the daily goals; api/src/macros.ts).
-- See docs/database.md for each column.

CREATE TYPE sex       AS ENUM ('male', 'female', 'other');
CREATE TYPE body_goal AS ENUM ('lose', 'maintain', 'gain');

-- Accounts sign in with a username; email is no longer required.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users
    ADD COLUMN username   VARCHAR(30),
    ADD COLUMN sex        sex,
    ADD COLUMN age        INT          CHECK (age BETWEEN 13 AND 120),
    ADD COLUMN height_cm  NUMERIC(4, 1) CHECK (height_cm BETWEEN 100 AND 250),
    ADD COLUMN weight_kg  NUMERIC(4, 1) CHECK (weight_kg BETWEEN 30 AND 300),
    ADD COLUMN body_goal  body_goal,
    -- Set when the first sign-in questions are answered; empty = still to ask.
    ADD COLUMN profile_completed_at TIMESTAMPTZ;
-- One account per username, ignoring case ('Seth' = 'seth').
CREATE UNIQUE INDEX users_unique_username ON users (LOWER(username));

-- Sessions: one row per signed-in device. Only a SHA-256 hash of the token is
-- stored, so a copy of this table can't be used to sign in.
CREATE TABLE sessions (
    session_id SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    token_hash CHAR(64)    NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
