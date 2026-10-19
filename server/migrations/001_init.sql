CREATE TABLE IF NOT EXISTS users (
  clerk_id      TEXT PRIMARY KEY,
  display_name  TEXT,
  character     TEXT NOT NULL DEFAULT 'bubba',
  focus_minutes INTEGER NOT NULL DEFAULT 25,
  break_minutes INTEGER NOT NULL DEFAULT 5,
  quiz_topics   TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id              BIGSERIAL PRIMARY KEY,
  clerk_id        TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  intention       TEXT,
  planned_minutes INTEGER NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  completed       BOOLEAN
);
CREATE INDEX IF NOT EXISTS focus_sessions_user_idx ON focus_sessions (clerk_id, started_at DESC);

CREATE TABLE IF NOT EXISTS quiz_items (
  id            BIGSERIAL PRIMARY KEY,
  clerk_id      TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,
  question      TEXT NOT NULL,
  choices       JSONB NOT NULL,
  correct_index SMALLINT NOT NULL,
  explanation   TEXT NOT NULL,
  chosen_index  SMALLINT,
  answered_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quiz_items_user_idx ON quiz_items (clerk_id, created_at DESC);
