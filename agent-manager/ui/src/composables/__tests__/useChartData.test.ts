import { test, expect } from "bun:test";
import { ref } from "vue";
import { useChartData } from "../useChartData";
import type { Session, Subagent } from "../../types/events";

function subagent(dispatched_at: string, completed_at: string): Subagent {
  return {
    name: "worker",
    description: "",
    subagent_type: null,
    agent_type: null,
    agent_id: null,
    status: "completed",
    dispatched_at,
    completed_at,
    permission_mode: null,
    last_message: null,
    run_in_background: false,
  };
}

function session(subagents: Subagent[]): Session {
  return {
    id: "s1",
    model: null,
    cwd: null,
    permission_mode: null,
    status: "active",
    first_seen: "2026-10-25T10:00:00Z",
    last_seen: "2026-10-25T12:00:00Z",
    needs_attention: false,
    attention_since: null,
    subagents,
  };
}

test("bar duration shows hours for long subagents", () => {
  const sessions = ref([session([subagent("2026-10-25T10:00:00Z", "2026-10-25T12:00:00Z")])]);

  const chart = useChartData(sessions, ref(null));

  expect(chart.value!.bars[0]!.duration).toBe("2h 0m");
});

test("ticks span the padded range evenly from 0% to 100%", () => {
  const sessions = ref([session([subagent("2026-10-25T10:00:00Z", "2026-10-25T12:00:00Z")])]);

  const chart = useChartData(sessions, ref(null));

  expect(chart.value!.ticks.map((t) => t.pct)).toEqual([0, 25, 50, 75, 100]);
});
