import {
  assertEquals,
  assert,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ASF_TRANSIENT_RETRY_DELAY_MS,
  fetchAsfWithTransientRetry,
  isTransientGraphqlUnavailable,
} from "./retry.ts";

const unavailable = JSON.stringify({
  errors: [{ message: "Serviço Indisponível" }],
});
const success = JSON.stringify({
  data: { mobishoutEntry: { noone: { entry: { licenseNumber: { nodes: [] } } } } },
});

Deno.test("recognizes only the observed HTTP-200 GraphQL availability failure", () => {
  assert(isTransientGraphqlUnavailable(200, unavailable));
  assert(isTransientGraphqlUnavailable(200, JSON.stringify({
    errors: [{ message: "Service temporarily unavailable" }],
  })));
  assertFalse(isTransientGraphqlUnavailable(200, JSON.stringify({
    errors: [{ message: "Invalid query" }],
  })));
  assertFalse(isTransientGraphqlUnavailable(200, success));
  assertFalse(isTransientGraphqlUnavailable(503, unavailable));
  assertFalse(isTransientGraphqlUnavailable(429, unavailable));
  assertFalse(isTransientGraphqlUnavailable(200, "{broken json"));
  assertFalse(isTransientGraphqlUnavailable(200, JSON.stringify({
    data: { partial: true },
    errors: [{ message: "Serviço Indisponível" }],
  })));
});

Deno.test("retries once and returns the successful second response", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await fetchAsfWithTransientRetry(
    "https://asf.invalid/api/src/?query=fixture",
    1000,
    async () => {
      calls++;
      return new Response(calls === 1 ? unavailable : success, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async (ms) => { waits.push(ms); },
  );

  assertEquals(calls, 2);
  assertEquals(waits, [ASF_TRANSIENT_RETRY_DELAY_MS]);
  assertEquals(result.status, 200);
  assertEquals(result.body, success);
  assertEquals(result.attempts, 2);
  assert(result.retriedTransientAvailability);
});

Deno.test("does not retry a second transient failure more than once", async () => {
  let calls = 0;
  const result = await fetchAsfWithTransientRetry(
    "https://asf.invalid/api/src/?query=fixture",
    1000,
    async () => {
      calls++;
      return new Response(unavailable, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {},
  );

  assertEquals(calls, 2);
  assertEquals(result.body, unavailable);
  assertEquals(result.attempts, 2);
  assert(result.retriedTransientAvailability);
});

Deno.test("does not retry generic GraphQL errors, HTTP 429, or Retry-After responses", async () => {
  const cases: Array<{ status: number; body: string; headers: Record<string, string> }> = [
    { status: 200, body: JSON.stringify({ errors: [{ message: "Invalid query" }] }), headers: {} },
    { status: 429, body: unavailable, headers: {} },
    { status: 200, body: unavailable, headers: { "retry-after": "10" } },
  ];

  for (const testCase of cases) {
    let calls = 0;
    const result = await fetchAsfWithTransientRetry(
      "https://asf.invalid/api/src/?query=fixture",
      1000,
      async () => {
        calls++;
        return new Response(testCase.body, { status: testCase.status, headers: testCase.headers });
      },
      async () => {},
    );
    assertEquals(calls, 1);
    assertEquals(result.attempts, 1);
    assertFalse(result.retriedTransientAvailability);
  }
});
