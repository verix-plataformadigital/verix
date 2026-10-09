import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalSpeedMeasurements,
  groupCinemometerEvents,
  summarizeQueryLifecycle,
  summarizeErrorRows,
} from "./telemetry-analytics.mjs";

const event = (eventName, at, extra = {}) => ({
  event: eventName,
  event_id: extra.event_id ?? `id-${eventName}-${at}`,
  occurred_at: at,
  installation_id: extra.installation_id ?? "install-a",
  session_id: extra.session_id ?? "session-a",
  query_id: extra.query_id,
  app_version: extra.app_version ?? "1.5",
  browser: extra.browser ?? "Chrome",
  metadata: extra.metadata ?? {},
});

test("canonical speed metrics remove only a paired calculation/entry duplicate", () => {
  const rows = [
    event("cinemometer_calculation", "2026-10-09T10:00:01Z", { metadata: { cin: { operation_id: "op-1", velocidade_registada: 88 } } }),
    event("cinemometer_speed_entry", "2026-10-09T10:00:02Z", { metadata: { cin: { operation_id: "op-1", velocidade_registada: 88 } } }),
    event("cinemometer_calculation", "2026-10-09T10:00:10Z", { metadata: { cin: { operation_id: "op-2", velocidade_registada: 92 } } }),
    event("cinemometer_calculation", "2026-10-09T10:00:20Z", { metadata: { cin: { operation_id: "op-3", velocidade_registada: 100 } } }),
  ];
  const result = canonicalSpeedMeasurements(rows);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((row) => row.metadata.cin.velocidade_registada), [88, 92, 100]);
  assert.equal(result.filter((row) => row.event === "cinemometer_speed_entry").length, 1);
});

test("Cinemómetro groups are scoped by installation, session and operation", () => {
  const rows = [
    event("cinemometer_calculation", "2026-10-09T10:00:00Z", { event_id: "a", metadata: { cin: { operation_id: "op-1" } } }),
    event("cinemometer_speed_entry", "2026-10-09T10:00:01Z", { event_id: "b", metadata: { cin: { operation_id: "op-1" } } }),
    event("cinemometer_calculation", "2026-10-09T10:00:02Z", { event_id: "c", installation_id: "install-b", metadata: { cin: { operation_id: "op-1" } } }),
    event("cinemometer_calculation", "2026-10-09T10:00:03Z", { event_id: "d", session_id: "session-b", metadata: { cin: {} } }),
    event("cinemometer_speed_entry", "2026-10-09T10:00:04Z", { event_id: "e", session_id: "session-b", metadata: { cin: {} } }),
    event("cinemometer_calculation", "2026-10-09T10:00:05Z", { event_id: "f", session_id: null, metadata: { cin: {} } }),
    event("cinemometer_calculation", "2026-10-09T10:00:06Z", { event_id: "g", session_id: null, metadata: { cin: {} } }),
  ];
  const groups = groupCinemometerEvents(rows);
  assert.equal(groups.length, 5);
  assert.equal(groups.find((group) => group.key.includes("op-1") && group.key.includes("install-a")).events.length, 2);
  assert.equal(groups.filter((group) => group.grouping_basis === "event").length, 2);
  assert.equal(groups.filter((group) => group.grouping_basis === "session").length, 1);
});

test("insurance results are cohort-based and invalid/orphan finals are surfaced", () => {
  const rows = [
    event("vehicle_lookup", "2026-10-08T10:00:00Z", { query_id: "q1" }),
    event("vehicle_insurance_yes", "2026-10-08T10:01:00Z", { query_id: "q1" }),
    event("vehicle_insurance_pending", "2026-10-08T10:02:00Z", { query_id: "q2" }),
    event("vehicle_lookup", "2026-10-08T10:03:00Z", { query_id: "q3" }),
    event("vehicle_insurance_yes", "2026-10-08T10:04:00Z", { query_id: "q3" }),
    event("vehicle_insurance_error", "2026-10-08T10:05:00Z", { query_id: "q3" }),
    event("vehicle_insurance_error", "2026-10-08T10:06:00Z", { query_id: "orphan" }),
    event("vehicle_lookup", "2026-10-08T10:10:00Z", { query_id: "q5" }),
    event("vehicle_insurance_yes", "2026-10-08T10:09:00Z", { query_id: "q5" }),
    event("vehicle_lookup", "2026-10-07T23:59:00Z", { query_id: "q6" }),
    event("vehicle_insurance_yes", "2026-10-08T00:01:00Z", { query_id: "q6" }),
  ];
  const result = summarizeQueryLifecycle(rows, {
    "24h": { start: "2026-10-08T00:00:00Z", end: "2026-10-09T00:00:00Z" },
  }).24h;
  assert.equal(result.started, 4);
  assert.equal(result.confirmed_starts, 3);
  assert.equal(result.inferred_starts, 1);
  assert.equal(result.finals, 1);
  assert.equal(result.insured, 1);
  assert.equal(result.pending, 2);
  assert.equal(result.conflicting_finals, 1);
  assert.equal(result.orphan_terminal_queries, 1);
  assert.equal(result.completed_in_window, 3);
  assert.equal(result.out_of_order_final_queries, 1);
});

test("error summaries are version-aware and disclose when detail is sampled", () => {
  const rows = [
    event("vehicle_insurance_error", "2026-10-09T09:00:00Z", {
      event_id: "err-1", query_id: "query-1234567890123456", installation_id: "install-1234567890123456",
      app_version: "1.5", metadata: { asfDiagnostic: { asfErrorType: "http_503", asfResponseHash: "hash-a", asfHttpStatus: 503 } },
    }),
    event("vehicle_insurance_error", "2026-10-09T09:01:00Z", {
      event_id: "err-2", query_id: "query-1234567890123456", installation_id: "install-1234567890123456",
      app_version: "1.5", metadata: { asfDiagnostic: { asfErrorType: "http_503", asfResponseHash: "hash-a", asfHttpStatus: 503 } },
    }),
    event("vehicle_insurance_error", "2026-10-09T09:02:00Z", {
      event_id: "err-3", query_id: "query-other", installation_id: "install-other",
      app_version: "1.4", metadata: { asfDiagnostic: { asfErrorType: "timeout", asfResponseHash: "hash-b" } },
    }),
  ];
  const result = summarizeErrorRows(rows, 10);
  assert.equal(result.total_errors, 10);
  assert.equal(result.sample_count, 3);
  assert.equal(result.sampled, true);
  assert.equal(result.unique_queries_in_sample, 2);
  assert.deepEqual(result.by_version.map((row) => row.app_version), ["1.5", "1.4"]);
  assert.equal(result.by_type.find((row) => row.type === "http_503").count, 2);
  assert.ok(result.recent_errors[0].installation_id.length < "install-1234567890123456".length);
});
