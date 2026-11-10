import { createLocalRateLimiter } from "./rate_limit.ts";
import { normalizeErrorCategory } from "./error_category.ts";

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


Deno.test("telemetry error categories — keeps known technical categories", () => {
  const category = normalizeErrorCategory({
    asfDiagnostic: { asfErrorType: "upstream_timeout" }
  });
  if (category !== "upstream_timeout") throw new Error("Known category was not preserved");
});

Deno.test("telemetry error categories — rejects free text into other", () => {
  const category = normalizeErrorCategory({
    asfDiagnostic: { asfErrorType: "timeout matrícula 00-AA-00 request body" }
  });
  if (category !== "other") throw new Error("Unrecognised/free text must be reduced to other");
});

Deno.test("telemetry error categories — missing category becomes unknown", () => {
  const category = normalizeErrorCategory({});
  if (category !== "unknown") throw new Error("Missing category must be unknown");
});
