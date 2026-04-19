ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attention_since TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_needs_attention
  ON sessions (needs_attention, attention_since DESC)
  WHERE needs_attention = TRUE;
