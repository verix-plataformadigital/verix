import { describe, expect, it } from "vitest";
import { summarizePresence, summarizeQueries, type TelemetryRow } from "../../src/services/telemetry/telemetry-analytics";

const row = (event: string, query_id: string | null, occurred_at: string, extra: Partial<TelemetryRow> = {}): TelemetryRow => ({
  event, query_id, occurred_at, installation_id: "install-A", ...extra,
});

describe("canonical telemetry analytics", () => {
  it("correlates a full vehicle lookup lifecycle as one query", () => {
    const result = summarizeQueries([
      row("vehicle_lookup", "q-1", "2026-10-09T10:00:00Z"),
      row("vehicle_insurance_pending", "q-1", "2026-10-09T10:00:01Z"),
      row("imt_loaded", "q-1", "2026-10-09T10:00:02Z"),
      row("vehicle_insurance_yes", "q-1", "2026-10-09T10:00:03Z"),
    ]);
    expect(result.rawEvents).toBe(4);
    expect(result.uniqueQueries).toBe(1);
    expect(result.counts).toMatchObject({ started: 1, insured: 1, uninsured: 0, errors: 0, pending: 0, imtWithResult: 1 });
    expect(result.queries[0]?.outcome).toBe("insured");
  });

  it("counts repeated terminal events once and exposes duplicates separately", () => {
    const result = summarizeQueries([
      row("vehicle_lookup", "q-2", "2026-10-09T10:00:00Z"),
      row("vehicle_insurance_yes", "q-2", "2026-10-09T10:00:03Z"),
      row("vehicle_insurance_yes", "q-2", "2026-10-09T10:00:04Z"),
    ]);
    expect(result.uniqueQueries).toBe(1);
    expect(result.counts.insured).toBe(1);
    expect(result.counts.duplicateFinalEvents).toBe(1);
    expect(result.queries[0]?.finalEventCount).toBe(2);
  });

  it("does not silently choose between contradictory final outcomes", () => {
    const result = summarizeQueries([
      row("vehicle_lookup", "q-3", "2026-10-09T10:00:00Z"),
      row("vehicle_insurance_yes", "q-3", "2026-10-09T10:00:03Z"),
      row("vehicle_insurance_no", "q-3", "2026-10-09T10:00:04Z"),
    ]);
    expect(result.counts.insured).toBe(0);
    expect(result.counts.uninsured).toBe(0);
    expect(result.counts.conflictingFinals).toBe(1);
    expect(result.queries[0]?.outcome).toBe("conflicting_final");
  });

  it("keeps missing query IDs visible but excludes them from query totals", () => {
    const result = summarizeQueries([
      row("heartbeat", null, "2026-10-09T10:00:00Z"),
      row("cinemometer_calculation", null, "2026-10-09T10:00:01Z"),
      row("vehicle_lookup", "q-4", "2026-10-09T10:00:02Z"),
    ]);
    expect(result.rawEvents).toBe(3);
    expect(result.eventsWithoutQueryId).toBe(2);
    expect(result.uniqueQueries).toBe(1);
    expect(result.counts.started).toBe(1);
  });

  it("does not treat a pending-only query as a completed result", () => {
    const result = summarizeQueries([
      row("vehicle_lookup", "q-5", "2026-10-09T10:00:00Z"),
      row("vehicle_insurance_pending", "q-5", "2026-10-09T10:00:01Z"),
    ]);
    expect(result.counts.started).toBe(1);
    expect(result.counts.pending).toBe(1);
    expect(result.counts.insured + result.counts.uninsured + result.counts.errors).toBe(0);
  });

  it("derives active installations from latest heartbeat within TTL, not heartbeat volume", () => {
    const now = Date.parse("2026-10-09T10:10:00Z");
    const result = summarizePresence([
      row("heartbeat", null, "2026-10-09T10:09:00Z", { installation_id: "A" }),
      row("heartbeat", null, "2026-10-09T10:09:30Z", { installation_id: "A" }),
      row("heartbeat", null, "2026-10-09T10:01:00Z", { installation_id: "B" }),
      row("heartbeat", null, "2026-10-09T10:12:00Z", { installation_id: "C" }),
      row("app_open", null, "2026-10-09T10:09:45Z", { installation_id: "D" }),
    ], now);
    expect(result.heartbeatEvents).toBe(4);
    expect(result.installationsWithValidHeartbeat).toBe(3);
    expect(result.activeInstallations).toBe(1);
  });
});
