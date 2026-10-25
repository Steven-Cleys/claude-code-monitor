import { test, expect, describe } from "bun:test";
import { createHooksRouter } from "../routes/hooks";

const router = createHooksRouter(() => {});

const post = (contentType: string) =>
  router.request("/", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify({ session_id: "" }),
  });

describe("POST /api/hooks", () => {
  test("rejects a text/plain body, which a cross-site page can send without a preflight", async () => {
    expect((await post("text/plain")).status).toBe(415);
  });

  test("accepts a JSON body and goes on to validate it", async () => {
    expect((await post("application/json")).status).toBe(400);
    expect((await post("application/json; charset=utf-8")).status).toBe(400);
  });
});
