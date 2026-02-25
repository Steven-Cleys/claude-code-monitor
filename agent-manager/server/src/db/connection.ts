import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://agent_manager:agent_manager@localhost:5433/agent_manager";

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
