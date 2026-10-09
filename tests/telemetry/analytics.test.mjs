import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalSpeedMeasurements,
  groupCinemometerEvents,
  summarizeErrorRows,
  summarizeQueryLifecycle,
} from "../../supabase/functions/_shared/telemetry-analytics.mjs";

const event = (name, queryId, at, extra = {}) => ({
  event: name,
  query_id: queryId,
  occurred_at: at,
  installation_id: "install-a",
  session_id: "session-a",
  metadata: {},
  ...extra,
});

test("insurance lifecycle counts a lookup, pending and terminal result as one query", () => {
  const rows = [
    event("vehicle_lookup", "q-1", "2026-10-09T10:00:00Z"),
    event("vehicle_insurance_pending", "q-1", "2026-10-09T10:00:01Z"),
    event("vehicle_insurance_yes", "q-1", "2026-10-09T10:00:02Z"),
  ];
  const summary = summarizeQueryLifecycle(rows, {
    "24h": { start: "2026-10-09T00:00:00Z", end: "2026-10-10T00:00:00Z" },
  })["24h"];
  assert.equal(summary.started, 1);
  assert.equal(summary.confirmed_starts, 1);
  assert.equal(summary.inferred_starts, 0);
  assert.equal(summary.finals, 1);
  assert.equal(summary.insured, 1);
  assert.equal(summary.pending, 0);
});

test("pending-only legacy query is an inferred start, not a confirmed lookup", () => {
  const rows = [event("vehicle_insurance_pending", "q-legacy", "2026-10-09T10:00:00Z")];
  const summary = summarizeQueryLifecycle(rows, {
    "24h": { start: "2026-10-09T00:00:00Z", end: "2026-10-10T00:00:00Z" },
  })["24h"];
  assert.equal(summary.started, 1);
  assert.equal(summary.confirmed_starts, 0);
  assert.equal(summary.inferred_starts, 1);
  assert.equal(summary.pending, 1);
});

test("terminal-only and conflicting queries are quality signals, not clean starts/results", () => {
  const rows = [
    event("vehicle_insurance_yes", "q-orphan", "2026-10-09T10:00:00Z"),
    event("vehicle_lookup", "q-conflict", "2026-10-09T10:01:00Z"),
    event("vehicle_insurance_yes", "q-conflict", "2026-10-09T10:01:01Z"),
    event("vehicle_insurance_no", "q-conflict", "2026-10-09T10:01:02Z"),
  ];
  const summary = summarizeQueryLifecycle(rows, {
    "24h": { start: "2026-10-09T00:00:00Z", end: "2026-10-10T00:00:00Z" },
  })["24h"];
  assert.equal(summary.started, 1);
  assert.equal(summary.finals, 0);
  assert.equal(summary.conflicting_finals, 1);
  assert.equal(summary.orphan_terminal_queries, 1);
});

test("duplicate terminal events with the same outcome count as one final", () => {
  const rows = [
    event("vehicle_lookup", "q-dup", "2026-10-09T10:00:00Z"),
    event("vehicle_insurance_error", "q-dup", "2026-10-09T10:00:02Z"),
    event("vehicle_insurance_error", "q-dup", "2026-10-09T10:00:03Z"),
  ];
  const summary = summarizeQueryLifecycle(rows, {
    "24h": { start: "2026-10-09T00:00:00Z", end: "2026-10-10T00:00:00Z" },
  })["24h"];
  assert.equal(summary.started, 1);
  assert.equal(summary.finals, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.duplicate_terminal_events, 1);
});

test("query cohort uses start time; a later result does not create a false start", () => {
  const rows = [
    event("vehicle_lookup", "q-old", "2026-10-01T10:00:00Z"),
    event("vehicle_insurance_yes", "q-old", "2026-10-09T10:00:00Z"),
  ];
  const summary = summarizeQueryLifecycle(rows, {
    "24h": { start: "2026-10-09T00:00:00Z", end: "2026-10-10T00:00:00Z" },
  })["24h"];
  assert.equal(summary.started, 0);
  assert.equal(summary.completed_in_window, 1);
});

test("Cinemometer calculation paired with a speed entry is not double-counted", () => {
  const rows = [
    event("cinemometer_calculation", null, "2026-10-09T10:00:00.100Z", {
      metadata: { cin: { operation_id: "op-1", velocidade_registada: 83 } },
    }),
    event("cinemometer_speed_entry", null, "2026-10-09T10:00:00.200Z", {
      metadata: { cin: { operation_id: "op-1", velocidade_registada: 83 } },
    }),
    event("cinemometer_calculation", null, "2026-10-09T10:00:10.000Z", {
      metadata: { cin: { operation_id: "op-1", velocidade_registada: 91 } },
    }),
  ];
  const result = canonicalSpeedMeasurements(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((row) => row.metadata.cin.velocidade_registada), [83, 91]);
});

test("Cinemometer pairing cannot cross installations or operations", () => {
  const rows = [
    event("cinemometer_calculation", null, "2026-10-09T10:00:00.100Z", {
      installation_id: "install-a",
      metadata: { cin: { operation_id: "op-1", velocidade_registada: 83 } },
    }),
    event("cinemometer_speed_entry", null, "2026-10-09T10:00:00.200Z", {
      installation_id: "install-b",
      metadata: { cin: { operation_id: "op-1", velocidade_registada: 83 } },
    }),
  ];
  assert.equal(canonicalSpeedMeasurements(rows).length, 2);
});

test("Cinemometer grouping keeps operation IDs scoped to installation and session", () => {
  const rows = [
    event("cinemometer_calculation", null, "2026-10-09T10:00:00Z", {
      metadata: { cin: { operation_id: "same-op", velocidade_registada: 80 } },
    }),
    event("cinemometer_calculation", null, "2026-10-09T10:00:01Z", {
      installation_id: "install-b",
      session_id: "session-b",
      metadata: { cin: { operation_id: "same-op", velocidade_registada: 80 } },
    }),
  ];
  assert.equal(groupCinemometerEvents(rows).length, 2);
});

test("error summaries include all versions and expose truncated samples", () => {
  const rows = [
    event("vehicle_insurance_error", "q1", "2026-10-09T10:00:00Z", {
      app_version: "1.3",
      metadata: { asfDiagnostic: { asfErrorType: "http_null" } },
    }),
    event("vehicle_insurance_error", "q2", "2026-10-09T10:01:00Z", {
      app_version: "1.5",
      installation_id: "install-b",
      metadata: { asfDiagnostic: { asfErrorType: "timeout" } },
    }),
  ];
  const summary = summarizeErrorRows(rows, 3);
  assert.equal(summary.total_errors, 3);
  assert.equal(summary.sample_count, 2);
  assert.equal(summary.sampled, true);
  assert.deepEqual(summary.by_version.map((x) => x.app_version).sort(), ["1.3", "1.5"]);
});
