const TERMINAL_EVENTS = new Set([
  "vehicle_insurance_yes",
  "vehicle_insurance_no",
  "vehicle_insurance_error",
]);
const START_EVENTS = new Set(["vehicle_lookup", "vehicle_insurance_pending"]);
const SPEED_EVENTS = new Set(["cinemometer_speed_entry", "cinemometer_calculation"]);

function timestampOf(event) {
  const value = Date.parse(event?.occurred_at ?? event?.occurredAt ?? "");
  return Number.isFinite(value) ? value : null;
}

function queryIdOf(event) {
  return String(event?.query_id ?? event?.queryId ?? event?.metadata?.queryId ?? "").trim();
}

function speedOf(event) {
  const raw = event?.metadata?.cin?.velocidade_registada;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function operationScope(event) {
  const cin = event?.metadata?.cin ?? {};
  const operationId = String(cin.operation_id ?? cin.operationId ?? "").trim();
  if (!operationId) return null;
  return [
    String(event?.installation_id ?? event?.installationId ?? ""),
    String(event?.session_id ?? event?.sessionId ?? ""),
    operationId,
  ].join("|");
}

/**
 * Prefer one explicit speed-entry event over its paired calculation event.
 * Pairing is intentionally local to the same installation/session/operation,
 * speed value and a short time window. Unmatched calculations remain valid
 * observations; a global preference for speed-entry events loses them.
 */
export function canonicalSpeedMeasurements(events) {
  const rows = (Array.isArray(events) ? events : [])
    .filter((event) => event?.event === "cinemometer_calculation" && speedOf(event) !== null)
    .map((event, index) => ({
      event,
      index,
      at: timestampOf(event),
      speed: speedOf(event),
      operationId: String(event?.metadata?.cin?.operation_id ?? "").trim(),
      installationId: String(event?.installation_id ?? "").trim(),
      sessionId: String(event?.session_id ?? "").trim(),
    }))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.index - b.index);

  // Repeated recalculations with the same stable operation ID and speed are
  // one measurement. Without a complete stable scope, preserve each event
  // rather than guessing that two separate operations are duplicates.
  const seenOperations = new Set();
  return rows
    .filter((row) => {
      if (!row.operationId || !row.installationId || !row.sessionId) return true;
      const key = [row.installationId, row.sessionId, row.operationId, row.speed].join("|");
      if (seenOperations.has(key)) return false;
      seenOperations.add(key);
      return true;
    })
    .map((row) => row.event)
    .sort((a, b) => (timestampOf(a) ?? 0) - (timestampOf(b) ?? 0));
}

/**
 * Groups detailed Cinemometer events without merging operations across
 * installations or browser sessions. If an operation id is unavailable, the
 * group is explicitly session-scoped; events without any stable scope stay
 * separate instead of being merged into one fictitious "sem_sessao" session.
 */
export function groupCinemometerEvents(events) {
  const groups = new Map();
  (Array.isArray(events) ? events : []).forEach((event, index) => {
    const operationId = String(event?.metadata?.cin?.operation_id ?? "").trim();
    const installationId = String(event?.installation_id ?? "");
    const sessionId = String(event?.session_id ?? "");
    let key;
    let groupingBasis;
    if (operationId) {
      key = ["operation", installationId, sessionId, operationId].join(":");
      groupingBasis = "operation";
    } else if (installationId && sessionId) {
      key = ["session", installationId, sessionId].join(":");
      groupingBasis = "session";
    } else {
      key = ["event", String(event?.event_id ?? event?.eventId ?? index)].join(":");
      groupingBasis = "event";
    }
    if (!groups.has(key)) groups.set(key, { key, grouping_basis: groupingBasis, events: [] });
    groups.get(key).events.push(event);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    events: group.events.sort((a, b) => (timestampOf(a) ?? 0) - (timestampOf(b) ?? 0)),
    first_seen: group.events.length ? group.events[0].occurred_at ?? group.events[0].occurredAt ?? null : null,
    last_seen: group.events.length ? group.events[group.events.length - 1].occurred_at ?? group.events[group.events.length - 1].occurredAt ?? null : null,
  })).sort((a, b) => String(b.last_seen ?? "").localeCompare(String(a.last_seen ?? "")));
}

/**
 * Query metrics are cohort-based: a query belongs to a window by its start
 * event, not by whichever event happened to arrive first. A pending-only query
 * is an inferred start; terminal-only and conflicting queries are quality
 * signals, never silently counted as a clean start/result.
 */
export function summarizeQueryLifecycle(events, windows) {
  const groups = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!START_EVENTS.has(event?.event) && !TERMINAL_EVENTS.has(event?.event)) continue;
    const queryId = queryIdOf(event);
    const at = timestampOf(event);
    if (!queryId || at === null) continue;
    if (!groups.has(queryId)) groups.set(queryId, []);
    groups.get(queryId).push(event);
  }

  const queries = [...groups.entries()].map(([query_id, rows]) => {
    const starts = rows.filter((row) => START_EVENTS.has(row.event));
    const lookups = starts.filter((row) => row.event === "vehicle_lookup");
    const pendingEvents = starts.filter((row) => row.event === "vehicle_insurance_pending");
    const terminalRows = rows.filter((row) => TERMINAL_EVENTS.has(row.event));
    const outcomes = [...new Set(terminalRows.map((row) => row.event))];
    const conflicting = outcomes.length > 1;
    const finalRows = conflicting ? [] : terminalRows.slice().sort((a, b) =>
      (timestampOf(a) ?? 0) - (timestampOf(b) ?? 0)
    );
    const startRows = lookups.length ? lookups : pendingEvents;
    const startAt = startRows.length ? Math.min(...startRows.map(timestampOf)) : null;
    const rawFinal = finalRows.length ? finalRows[finalRows.length - 1] : null;
    const terminalAt = rawFinal ? timestampOf(rawFinal) : null;
    const outOfOrderFinal = terminalAt !== null && startAt !== null && terminalAt < startAt;
    const final = rawFinal && !outOfOrderFinal ? rawFinal : null;
    return {
      query_id,
      start_at: startAt,
      start_source: lookups.length ? "vehicle_lookup" : pendingEvents.length ? "inferred_from_pending" : null,
      final_event: final?.event ?? null,
      final_at: final ? timestampOf(final) : null,
      terminal_at: terminalAt,
      out_of_order_final: outOfOrderFinal,
      terminal_event_count: terminalRows.length,
      conflicting,
      has_start: starts.length > 0,
      has_lookup: lookups.length > 0,
      has_pending_event: pendingEvents.length > 0,
    };
  });

  const result = {};
  for (const [name, window] of Object.entries(windows ?? {})) {
    const start = Date.parse(window?.start ?? "");
    const end = Date.parse(window?.end ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new TypeError(`Invalid telemetry window: ${name}`);
    }
    const cohort = queries.filter((query) => query.start_at !== null && query.start_at >= start && query.start_at < end);
    const cleanFinals = cohort.filter((query) => query.final_event && !query.conflicting);
    result[name] = {
      started: cohort.length,
      confirmed_starts: cohort.filter((query) => query.start_source === "vehicle_lookup").length,
      inferred_starts: cohort.filter((query) => query.start_source === "inferred_from_pending").length,
      finals: cleanFinals.length,
      insured: cleanFinals.filter((query) => query.final_event === "vehicle_insurance_yes").length,
      uninsured: cleanFinals.filter((query) => query.final_event === "vehicle_insurance_no").length,
      errors: cleanFinals.filter((query) => query.final_event === "vehicle_insurance_error").length,
      pending: cohort.filter((query) => !query.final_event && !query.conflicting).length,
      conflicting_finals: cohort.filter((query) => query.conflicting).length,
      duplicate_terminal_events: cohort.reduce((sum, query) => sum + Math.max(0, query.terminal_event_count - 1), 0),
      orphan_terminal_queries: queries.filter((query) => !query.has_start && query.terminal_at !== null && query.terminal_at >= start && query.terminal_at < end).length,
      completed_in_window: queries.filter((query) => query.final_at !== null && query.final_at >= start && query.final_at < end && !query.conflicting).length,
      out_of_order_final_queries: cohort.filter((query) => query.out_of_order_final).length,
    };
  }
  return result;
}

/** Summarize the rows returned for an error investigation without pinning it to one app version. */
export function summarizeErrorRows(rows, totalCount = rows?.length ?? 0) {
  const input = Array.isArray(rows) ? rows : [];
  const distinct = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
  const byVersion = new Map();
  const byType = new Map();
  const byHash = new Map();
  const byInstallation = new Map();
  const bursts = new Map();
  const queryIds = new Set();
  for (const row of input) {
    const version = String(row?.app_version ?? "Unknown");
    const type = String(row?.metadata?.asfDiagnostic?.asfErrorType ?? "unknown");
    const hash = String(row?.metadata?.asfDiagnostic?.asfResponseHash ?? "sem-hash");
    const installation = String(row?.installation_id ?? "unknown");
    const queryId = String(row?.query_id ?? "");
    const add = (map, key, value = 1) => map.set(key, (map.get(key) ?? 0) + value);
    add(byVersion, version);
    add(byType, type);
    add(byHash, hash);
    add(byInstallation, installation);
    if (queryId) queryIds.add(queryId);
    const at = timestampOf(row);
    if (at !== null) {
      const bucket = new Date(Math.floor(at / 300000) * 300000).toISOString();
      add(bursts, bucket);
    }
  }
  const shortId = (value) => {
    const string = String(value ?? "");
    return string.length > 14 ? string.slice(0, 8) + "…" + string.slice(-4) : string;
  };
  const top = (map, key) => [...map.entries()]
    .map(([value, count]) => ({ [key]: value, count }))
    .sort((a, b) => b.count - a.count);
  const recent = input.slice().sort((a, b) => (timestampOf(b) ?? 0) - (timestampOf(a) ?? 0)).slice(0, 12).map((row) => {
    const diagnostic = row?.metadata?.asfDiagnostic ?? {};
    return {
      occurred_at: row?.occurred_at ?? null,
      installation_id: shortId(row?.installation_id),
      query_id: shortId(row?.query_id),
      app_version: row?.app_version ?? "Unknown",
      browser: row?.browser ?? row?.metadata?.client?.browser ?? "Unknown",
      error_type: diagnostic.asfErrorType ?? "unknown",
      transport: diagnostic.asfTransport ?? null,
      relay_latency_ms: diagnostic.asfRelayLatencyMs ?? null,
      http_status: diagnostic.asfHttpStatus ?? null,
      duration_ms: diagnostic.asfDurationMs ?? null,
      response_hash: diagnostic.asfResponseHash ?? null,
      response_class: diagnostic.asfResponseClass ?? null,
      graphql_error_count: diagnostic.asfGraphqlErrorCount ?? null,
      response_bytes: diagnostic.asfResponseBytes ?? null,
      parse_path: diagnostic.asfParsePath ?? null,
      build_id: row?.metadata?.build_id ?? diagnostic.build_id ?? null,
    };
  });
  const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : input.length;
  return {
    total_errors: total,
    sample_count: input.length,
    sampled: total > input.length,
    unique_queries_in_sample: queryIds.size,
    affected_installations_in_sample: byInstallation.size,
    distinct_versions_in_sample: byVersion.size,
    by_version: top(byVersion, "app_version"),
    by_type: top(byType, "type"),
    by_hash: top(byHash, "hash").slice(0, 10),
    by_installation: top(byInstallation, "installation_id").map((row) => ({ installation_id: shortId(row.installation_id), count: row.count })).slice(0, 10),
    bursts_5m: top(bursts, "start").slice(0, 12).map((row) => ({ start: row.start, count: row.count })),
    recent_errors: recent,
  };
}
