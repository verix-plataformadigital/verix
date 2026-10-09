/**
 * Canonical, deterministic interpretation of VÉRIX V2 telemetry.
 *
 * This module deliberately separates raw event volume from user actions and
 * query outcomes. Events without query_id are never promoted to independent
 * queries; retries and repeated terminal events are grouped by query_id.
 */
export type TelemetryRow = {
  event_id?: string;
  event?: string | null;
  query_id?: string | null;
  installation_id?: string | null;
  session_id?: string | null;
  module?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type QueryOutcome = "insured" | "uninsured" | "error" | "pending" | "incomplete" | "conflicting_final";
export type QuerySummary = {
  queryId: string;
  installationId: string | null;
  startedAt: string | null;
  lastEventAt: string | null;
  outcome: QueryOutcome;
  rawEventCount: number;
  finalEventCount: number;
  duplicateFinalCount: number;
  hasImtResult: boolean;
  eventNames: string[];
};

const START_EVENTS = new Set(["vehicle_lookup"]);
const FINAL_OUTCOMES: Record<string, Exclude<QueryOutcome, "pending" | "incomplete" | "conflicting_final">> = {
  vehicle_insurance_yes: "insured",
  vehicle_insurance_no: "uninsured",
  vehicle_insurance_error: "error",
};
const PENDING_EVENTS = new Set(["vehicle_insurance_pending"]);
const IMT_EVENTS = new Set(["imt_loaded"]);
const timestamp = (row: TelemetryRow): number => {
  const value = Date.parse(String(row.occurred_at ?? row.created_at ?? ""));
  return Number.isFinite(value) ? value : -1;
};
const eventName = (row: TelemetryRow): string => String(row.event ?? "").trim().toLowerCase();
const queryId = (row: TelemetryRow): string => String(row.query_id ?? "").trim();

/** Count canonical queries, not raw event rows. Query IDs are the unit of identity. */
export function summarizeQueries(rows: readonly TelemetryRow[]) {
  const groups = new Map<string, TelemetryRow[]>();
  let eventsWithoutQueryId = 0;
  for (const row of rows) {
    const id = queryId(row);
    if (!id) {
      eventsWithoutQueryId += 1;
      continue;
    }
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }

  const queries: QuerySummary[] = [];
  for (const [id, group] of groups) {
    const ordered = [...group].sort((a, b) => timestamp(a) - timestamp(b));
    const finals = ordered.filter((row) => FINAL_OUTCOMES[eventName(row)] !== undefined);
    const distinctFinals = new Set(finals.map((row) => FINAL_OUTCOMES[eventName(row)]));
    const latest = ordered[ordered.length - 1];
    const start = ordered.find((row) => START_EVENTS.has(eventName(row)));
    const hasPending = ordered.some((row) => PENDING_EVENTS.has(eventName(row)));
    const hasImtResult = ordered.some((row) => IMT_EVENTS.has(eventName(row)));
    let outcome: QueryOutcome = "incomplete";
    if (distinctFinals.size > 1) outcome = "conflicting_final";
    else if (finals.length) outcome = FINAL_OUTCOMES[eventName(finals[finals.length - 1])] ?? "incomplete";
    else if (hasPending) outcome = "pending";

    queries.push({
      queryId: id,
      installationId: String(latest.installation_id ?? start?.installation_id ?? "") || null,
      startedAt: start?.occurred_at ?? start?.created_at ?? null,
      lastEventAt: latest.occurred_at ?? latest.created_at ?? null,
      outcome,
      rawEventCount: group.length,
      finalEventCount: finals.length,
      duplicateFinalCount: Math.max(0, finals.length - 1),
      hasImtResult,
      eventNames: [...new Set(ordered.map(eventName).filter(Boolean))],
    });
  }

  const counts = {
    started: queries.filter((q) => q.startedAt !== null).length,
    insured: queries.filter((q) => q.outcome === "insured").length,
    uninsured: queries.filter((q) => q.outcome === "uninsured").length,
    errors: queries.filter((q) => q.outcome === "error").length,
    pending: queries.filter((q) => q.outcome === "pending").length,
    incomplete: queries.filter((q) => q.outcome === "incomplete").length,
    conflictingFinals: queries.filter((q) => q.outcome === "conflicting_final").length,
    imtWithResult: queries.filter((q) => q.hasImtResult).length,
    duplicateFinalEvents: queries.reduce((sum, q) => sum + q.duplicateFinalCount, 0),
  };

  return {
    rawEvents: rows.length,
    eventsWithoutQueryId,
    uniqueQueries: queries.length,
    counts,
    queries: queries.sort((a, b) => (b.lastEventAt ?? "").localeCompare(a.lastEventAt ?? "")),
  };
}

/** Raw activity metrics must be named as events, never as people or queries. */
export function summarizePresence(rows: readonly TelemetryRow[], nowMs: number, ttlMs = 5 * 60_000) {
  const latestByInstallation = new Map<string, number>();
  let heartbeats = 0;
  for (const row of rows) {
    if (eventName(row) !== "heartbeat") continue;
    heartbeats += 1;
    const installation = String(row.installation_id ?? "").trim();
    const at = timestamp(row);
    if (!installation || at < 0) continue;
    latestByInstallation.set(installation, Math.max(latestByInstallation.get(installation) ?? -1, at));
  }
  const activeInstallations = [...latestByInstallation.values()].filter((at) => nowMs >= at && nowMs - at <= ttlMs).length;
  return {
    heartbeatEvents: heartbeats,
    installationsWithValidHeartbeat: latestByInstallation.size,
    activeInstallations,
    ttlMs,
  };
}
