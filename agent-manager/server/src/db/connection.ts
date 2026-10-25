import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://agent_manager:agent_manager@localhost:5433/agent_manager";

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Every restart re-runs CREATE TABLE IF NOT EXISTS, whose "already exists"
  // NOTICE would otherwise print as a multi-line object in the log.
  onnotice: () => {},
  // BIGINT (int8, also COUNT(*)) and NUMERIC would otherwise arrive as strings.
  // Token counts and dollar costs stay far below 2^53, so numbers are safe.
  types: {
    number: { to: 1700, from: [20, 1700], serialize: String, parse: Number },
  },
});
