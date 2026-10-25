ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC NULL;

-- No foreign key: Loki can report cost for a session before its first hook
-- event creates the row, and that cost must still count once it does.
CREATE TABLE IF NOT EXISTS session_cost_days (
  session_id TEXT NOT NULL,
  day DATE NOT NULL,
  cost_usd NUMERIC NOT NULL,
  PRIMARY KEY (session_id, day)
);
