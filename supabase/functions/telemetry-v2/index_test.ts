import { createLocalRateLimiter } from "./rate_limit.ts";

Deno.test("telemetry local limiter — enforces the per-key window", () => {
  let now = 1_000;
  const limit = createLocalRateLimiter(100, () => now);

  if (!limit("client-a", 2, 60)) throw new Error("First event should pass");
  if (!limit("client-a", 2, 60)) throw new Error("Second event should pass");
  if (limit("client-a", 2, 60)) throw new Error("Third event should be rejected");
});

Deno.test("telemetry local limiter — isolates keys", () => {
  let now = 1_000;
  const limit = createLocalRateLimiter(100, () => now);

  if (!limit("client-a", 1, 60)) throw new Error("client-a should pass");
  if (!limit("client-b", 1, 60)) throw new Error("client-b should have its own bucket");
  if (limit("client-a", 1, 60)) throw new Error("client-a should now be limited");
});

Deno.test("telemetry local limiter — opens a fresh window after expiry", () => {
  let now = 1_000;
  const limit = createLocalRateLimiter(100, () => now);

  if (!limit("client-a", 1, 10)) throw new Error("First event should pass");
  if (limit("client-a", 1, 10)) throw new Error("Second event should be rejected");

  now += 10_001;
  if (!limit("client-a", 1, 10)) throw new Error("Expired window should reset");
});

Deno.test("telemetry local limiter — remains usable after bounded cleanup", () => {
  let now = 1_000;
  const limit = createLocalRateLimiter(100, () => now);

  for (let i = 0; i < 700; i += 1) {
    if (!limit("client-" + i, 10, 60)) throw new Error("Fresh key should pass");
  }

  now += 60_001;
  if (!limit("new-client", 10, 60)) throw new Error("Limiter should remain usable");
});
