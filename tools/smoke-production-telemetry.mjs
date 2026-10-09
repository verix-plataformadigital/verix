import assert from "node:assert/strict";

const endpoint = "https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/telemetry-v2";
const runId = process.env.GITHUB_RUN_ID;
const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
assert.ok(runId, "GITHUB_RUN_ID is required");

const eventId = `verix-smoke-${runId}-${attempt}`;
const installationId = `i-verix-smoke-${runId}-${attempt}`;
const payload = {
  events: [{
    eventId,
    installationId,
    appVersion: "1.5",
    buildId: `1.5-sec-live-smoke-${runId}`,
    deviceType: "ci",
    browser: "GitHub-Actions-Smoke",
    event: "heartbeat",
    module: null,
    occurredAt: new Date().toISOString(),
    metadata: {}
  }]
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=UTF-8" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(20000)
});
const body = await response.json().catch(() => null);

assert.equal(response.status, 200, `Expected HTTP 200, received ${response.status}: ${JSON.stringify(body)}`);
assert.equal(body?.ok, true, `Endpoint did not confirm success: ${JSON.stringify(body)}`);
assert.equal(body?.inserted, 1, `Expected one inserted event: ${JSON.stringify(body)}`);
assert.equal(body?.accepted, 1, `Expected accepted=1: ${JSON.stringify(body)}`);
assert.equal(body?.duplicates, 0, `Unexpected duplicate: ${JSON.stringify(body)}`);
assert.equal(body?.rejected, 0, `Unexpected rejection: ${JSON.stringify(body)}`);
assert.ok(Array.isArray(body?.acknowledged_event_ids), "Missing acknowledgement IDs");
assert.ok(body.acknowledged_event_ids.includes(eventId), "The exact sent event was not acknowledged");
assert.deepEqual(body?.rejected_event_ids, [], "Smoke event must not be rejected");
assert.deepEqual(body?.retry_event_ids, [], "Smoke event must not need a retry");

console.log(JSON.stringify({
  result: "PASS",
  test: "production HTTP -> Edge Function -> PostgreSQL atomic ingest -> per-event receipt",
  httpStatus: response.status,
  inserted: body.inserted,
  acknowledgedEventId: eventId,
  installationId
}));
