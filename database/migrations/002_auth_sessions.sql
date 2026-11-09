-- 002: auth sessions
-- Runs once, in a transaction (so no BEGIN/COMMIT here). Never edit this file after
-- it is merged: add a new migration instead. See docs/database.md, "Migrations".
--
-- Adds sign-in: a name on each account and a sessions table for login tokens.
-- users.email and users.password_hash already exist from 001.

-- Shown on the account screen. Optional.
ALTER TABLE users ADD COLUMN display_name VARCHAR(80);

-- Emails are compared without case ("Sam@x.com" = "sam@x.com").
CREATE UNIQUE INDEX users_email_lower ON users (LOWER(email));

-- One row per signed-in device. The app holds the raw token; only its SHA-256 is
-- stored here, so a leaked database can't be used to sign in.
CREATE TABLE sessions (
    session_id   SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    token_hash   CHAR(64)    NOT NULL UNIQUE,   -- hex SHA-256 of the bearer token
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- The demo user can now sign in, so its existing data stays reachable:
--   email demo@atlas.local, password atlas-demo   (local development only)
UPDATE users
SET password_hash = 'scrypt$16384$8$1$b90A9QvEKTyfMo7sxdm6Yg==$hLyZCFjHzVAuwOIt+jwqBr8ED55OXtmp4TOoO0T7pR8ko1U2LWrBpr3A83laa6MGDiF/HzKXZBZvPbBGLTJjJA==',
    display_name  = 'Demo'
WHERE email = 'demo@atlas.local' AND password_hash = 'no-login-yet';
