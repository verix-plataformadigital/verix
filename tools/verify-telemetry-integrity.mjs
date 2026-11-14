import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = fs.readFileSync("supabase/functions/telemetry-v2/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261009034000_repair_telemetry_integrity_and_query_metrics.sql", "utf8");
const sessionIsolation = fs.readFileSync("supabase/migrations/20261103103629_telemetry_session_identity_conflict_isolation.sql", "utf8");
const cacheCorrection = fs.readFileSync("supabase/migrations/20261103102940_correct_admin_cache_refresh_and_insurance_retention_comment.sql", "utf8");
const admin = fs.readFileSync("admin_v2.html", "utf8");
const stats = fs.readFileSync("supabase/functions/stats-v2/index.ts", "utf8");

assert.match(endpoint, /@supabase\/supabase-js@2\.118\.0/);
assert.match(endpoint, /db:\s*\{\s*retry:\s*false\s*\}/);
assert.match(endpoint, /\.abortSignal\(AbortSignal\.timeout\(5000\)\)/);
assert.match(endpoint, /\.abortSignal\(AbortSignal\.timeout\(5000\)\)/);
assert.match(endpoint, /telemetry_backend_timeout/);
assert.match(endpoint, /sessions_detached/);
assert.match(endpoint, /db\.rpc\(\s*["']verix2_ingest_telemetry["']/);
assert.match(endpoint, /p_events:\s*events/);
assert.match(endpoint, /p_installations:\s*\[\]/);
assert.match(endpoint, /p_sessions:\s*\[\]/);
assert.doesNotMatch(endpoint, /db\.from\(["']verix2_(?:events|installations|sessions)["']\)\.upsert/);
assert.match(endpoint, /receipt\?\.events_inserted/);
assert.match(endpoint, /accepted:\s*inserted/);
assert.match(endpoint, /duplicates,/);
assert.match(endpoint, /rejected,/);
assert.match(sessionIsolation, /v_conflicting_session_ids/);
assert.match(sessionIsolation, /v_race_conflicting_session_ids/);
assert.match(sessionIsolation, /sessions_detached/);
assert.match(sessionIsolation, /jsonb_set/);
assert.match(sessionIsolation, /WHERE current_session\.installation_id = EXCLUDED\.installation_id/);
assert.doesNotMatch(sessionIsolation, /RAISE EXCEPTION 'telemetry session ID conflicts with its stored installation ID'/);
assert.match(cacheCorrection, /cron\.alter_job/);
assert.match(cacheCorrection, /verix2_admin_dashboard_v3\(now\(\), false\)/);
assert.match(cacheCorrection, /90 days/);
assert.match(migration, /SECURITY INVOKER/);
assert.match(migration, /verix2_ingest_telemetry\(jsonb, jsonb, jsonb\)/);
assert.match(migration, /WHERE event='vehicle_lookup' AND query_id IS NOT NULL/);
assert.doesNotMatch(migration, /SELECT DISTINCT ON\(query_id\)/);
assert.equal((migration.match(/NOT EXISTS\(SELECT 1 FROM public\.verix2_events lookup_event WHERE lookup_event\.event='vehicle_lookup' AND lookup_event\.query_id=fc\.query_id\)/g) || []).length, 3, "orphan finals must be checked against all recorded lookups, not only the 30-day analytics slice");
for (const metric of ["'pending'","'incomplete'","'contradictory'","'duplicate_finals'","'orphan_finals'"]) assert.ok(migration.includes(metric), "missing SQL metric "+metric);
const lifetimeMigration = fs.readFileSync("supabase/migrations/20261109224456_counter_only_lifetime_metrics.sql", "utf8");
const semanticMigration = fs.readFileSync("supabase/migrations/20261109231000_rename_no_record_counter_semantics.sql", "utf8");
assert.match(semanticMigration, /RENAME COLUMN total_vehicles_without_insurance TO total_no_record_results/);
assert.match(semanticMigration, /'no_record'/);
assert.match(stats, /detail === "lifetime-counters"/);
assert.match(admin, /total_no_record_results/);

// Daily-only Admin contract: lifetime counters and daily aggregates, no live presence client.
for (const id of ["totalSearches","totalNoRecord","todayConsultations","todayNoRecord","todayErrors","dailyRows"]) {
  assert.ok(admin.includes('id="' + id + '"'), "missing Admin daily metric " + id);
}
assert.match(admin, /Total de pesquisas efetuadas/);
assert.match(admin, /Resultados sem registo ASF/);
assert.match(admin, /A ausência de registo ASF não confirma, por si só, que o veículo não tem seguro/);
assert.match(admin, /detail=lifetime-counters/);
assert.match(admin, /admin-telemetry-v3\?view=dashboard/);
assert.doesNotMatch(admin, /verix-presence-v1\.js|VERIX_LIVE_PRESENCE/);
assert.doesNotMatch(admin, /liveQueries5m|livePresenceOnline|presenceConnection|operationalSection|Operação em tempo real|Em direto/);
assert.match(admin, /const DAILY_API=/);
assert.doesNotMatch(admin, /const LIVE_API=/);
assert.doesNotMatch(admin, /setInterval\(/);
assert.doesNotMatch(admin, /response\.presence/);
assert.match(admin, /id="refreshBtn"/);
assert.doesNotMatch(admin, /data-period=|Histórico Total|>7 dias|daily-metrics-30d|todayErrorTypes/);
assert.match(admin, /consulta é contabilizada uma vez/);

// The rolling five-minute counter uses the existing short-lived hashed state.
// Raw event/session tables stay retired; only first lookup time is retained.
const recentMetricsMigration = fs.readFileSync("supabase/migrations/20261113123024_admin_live_consultations_last_5m.sql", "utf8");
assert.match(recentMetricsMigration, /ADD COLUMN IF NOT EXISTS lookup_at timestamptz/);
assert.match(recentMetricsMigration, /verix_lifetime_query_state_lookup_at_idx/);
assert.match(recentMetricsMigration, /WHEN v_new_search AND NOT v_old_search THEN p_occurred_at/);
assert.match(recentMetricsMigration, /verix_admin_recent_consultations/);
assert.match(recentMetricsMigration, /interval '5 minutes'/);
assert.match(recentMetricsMigration, /REVOKE ALL ON FUNCTION public\.verix_admin_recent_consultations/);
const adminTelemetry = fs.readFileSync("supabase/functions/admin-telemetry-v3/index.ts", "utf8");
assert.match(adminTelemetry, /verix_admin_dashboard_snapshot_v1/);
assert.doesNotMatch(adminTelemetry, /consultations_started_last_5m|consultations_started_last_1h/);
assert.doesNotMatch(adminTelemetry, /verix_admin_recent_consultations|verix_admin_consultations_last_hour|verix_daily_metrics_30d_read/);
assert.doesNotMatch(adminTelemetry, /verix2_admin_live_presence/);
const dashboardSnapshotMigration = fs.readFileSync("supabase/migrations/20261114102619_verix_admin_dashboard_snapshot_rpc.sql", "utf8");
assert.match(dashboardSnapshotMigration, /verix_admin_dashboard_snapshot_v1/);
assert.match(dashboardSnapshotMigration, /verix_admin_recent_consultations/);
assert.match(dashboardSnapshotMigration, /verix_admin_consultations_last_hour/);
assert.match(dashboardSnapshotMigration, /verix_daily_metrics_30d_read/);
assert.match(dashboardSnapshotMigration, /REVOKE ALL ON FUNCTION public\.verix_admin_dashboard_snapshot_v1/);
assert.match(dashboardSnapshotMigration, /GRANT EXECUTE ON FUNCTION public\.verix_admin_dashboard_snapshot_v1/);
const dailyOnlySnapshotMigration = fs.readFileSync("supabase/migrations/20261114111500_admin_daily_snapshot_only.sql", "utf8");
assert.match(dailyOnlySnapshotMigration, /verix_daily_metrics_30d_read/);
assert.doesNotMatch(dailyOnlySnapshotMigration, /verix_admin_recent_consultations|verix_admin_consultations_last_hour/);
const categoryGrantMigration = fs.readFileSync("supabase/migrations/20261114102343_grant_service_role_daily_error_type_access.sql", "utf8");
assert.match(categoryGrantMigration, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.verix_daily_error_types TO service_role/);

const app = fs.readFileSync("verix-app.html", "utf8");
assert.doesNotMatch(app, /VERIX_SECURITY_WARMUP|scheduleTokenRenewal|refreshTokenWhenAvailable|scheduleTokenRenewalRetry|refreshTokenAhead|securityRenewalTimer/);
assert.match(app, /window\.VERIX_SECURITY\.getToken\(false\)/, "ASF requests must acquire the token on demand");
assert.match(app, /window\.VERIX_SECURITY\.getToken\(true\)/, "401 handling must retain the forced token refresh");
const telemetryStart = app.indexOf("function parseReceipt(text)");
const telemetryEnd = app.indexOf("function rateLimited", telemetryStart);
assert.ok(telemetryStart >= 0 && telemetryEnd > telemetryStart, "production telemetry client must expose its receipt pipeline");
const clientTransport = app.slice(telemetryStart, telemetryEnd);
assert.match(clientTransport, /receipt:\s*parseReceipt\(await response\.text\(\)\)/);
assert.match(clientTransport, /queue = queue\.filter\(function \(item\)/);
assert.match(clientTransport, /!acknowledged\[item\.eventId\]/);
assert.match(clientTransport, /recordRejectedEvents\(batch, receipt\)/);
assert.doesNotMatch(clientTransport, /sendBeacon|flushBeacon|pagehide/, "partial batches must stay in local queue, not trigger an invocation per close");
assert.match(clientTransport, /LAST_PARTIAL_UPLOAD_DAY_KEY/);
assert.match(clientTransport, /partialBatch && Object\.keys\(retryIds\)\.length === 0/);
assert.match(app, /if \(queue\.length\) flush\(0\)/);
assert.match(app, /if \(queue\.length >= BATCH_SIZE\) flush\(0\)/);
assert.ok(app.includes("VERIX_T2_REJECTED_QUEUE"), "permanent rejections must have bounded non-sensitive local diagnostics");


const scriptOpen = '<script id="verix-telemetry-v2">';
const scriptStart = app.indexOf(scriptOpen);
const scriptEnd = app.indexOf("</script>", scriptStart + scriptOpen.length);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "production telemetry script must have clear boundaries");
const telemetryScript = app.slice(scriptStart + scriptOpen.length, scriptEnd);
assert.doesNotThrow(() => new Function(telemetryScript), "production telemetry script must parse as JavaScript");

const parserMatch = clientTransport.match(/function parseReceipt\(text\) \{[\s\S]*?\n  \}/);
assert.ok(parserMatch, "receipt parser must be independently testable");
const parseReceipt = new Function("return (" + parserMatch[0] + ");")();
const validReceipt = {
  ok: true,
  acknowledged_event_ids: ["e-inserted", "e-duplicate"],
  rejected_event_ids: ["e-invalid", "e-rate-limited"],
  retry_event_ids: ["e-rate-limited"],
  rejection_reasons: { "e-invalid": "invalid_event", "e-rate-limited": "rate_limited" }
};
assert.deepEqual(parseReceipt(JSON.stringify(validReceipt)), validReceipt);
assert.equal(parseReceipt('{"ok":true}'), null, "HTTP 200 without an application receipt must not clear the queue");
assert.equal(parseReceipt('not-json'), null, "malformed receipt must not clear the queue");

const outOfOrderErrorMigration = fs.readFileSync("supabase/migrations/20261111112703_preserve_daily_error_type_for_out_of_order_telemetry.sql", "utf8");
assert.match(outOfOrderErrorMigration, /final_state_at timestamptz/);
assert.match(outOfOrderErrorMigration, /final_error_type text/);
assert.match(outOfOrderErrorMigration, /error_type_counted boolean NOT NULL DEFAULT true/);
assert.match(outOfOrderErrorMigration, /p_error_type text/);
assert.match(outOfOrderErrorMigration, /v_new_error_type_counted/);
assert.match(outOfOrderErrorMigration, /verix_daily_error_types/);
assert.match(outOfOrderErrorMigration, /interval '30 days'/);
assert.match(outOfOrderErrorMigration, /GRANT EXECUTE ON FUNCTION public\.verix2_ingest_telemetry/);

const errorTypeWindowMigration = fs.readFileSync("supabase/migrations/20261111113251_restart_error_type_collection_after_ordered_aggregation_fix.sql", "utf8");
assert.ok(errorTypeWindowMigration.includes('IF NOT EXISTS (SELECT 1 FROM public.verix_daily_error_types)'));
assert.match(errorTypeWindowMigration, /SET error_types_since = clock_timestamp\(\)/);

console.log("PASS: atomic ingest receipt, ID-based client acknowledgement, loss-safe beacon queue, query-quality metrics and Admin labels.");
