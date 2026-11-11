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
assert.match(admin, /total_no_record_results/);
assert.match(admin, /A ausência de registo não confirma, por si só, que o veículo não tem seguro/);

assert.match(lifetimeMigration, /CREATE TABLE IF NOT EXISTS public\.verix_lifetime_counters/);
assert.match(lifetimeMigration, /CREATE TABLE IF NOT EXISTS public\.verix_lifetime_query_state/);
assert.match(lifetimeMigration, /pg_advisory_xact_lock/);
assert.match(lifetimeMigration, /interval '45 days'/);
assert.match(lifetimeMigration, /SECURITY INVOKER/);
assert.match(lifetimeMigration, /verix2_ingest_telemetry/);
assert.match(lifetimeMigration, /verix_lifetime_metrics_read/);
assert.match(lifetimeMigration, /REVOKE ALL ON FUNCTION/);
assert.doesNotMatch(endpoint, /verix_insurance_no_cases|operationalInsuranceNoCases|cleanOperationalPlate/);
assert.doesNotMatch(endpoint, /matricula|matriculaNormalizada/i);
assert.match(endpoint, /p_installations:\s*\[\]/);
assert.match(endpoint, /p_sessions:\s*\[\]/);
assert.match(endpoint, /event_id: eventId,[\s\S]*?query_id: queryId,[\s\S]*?event,[\s\S]*?occurred_at: occurredAt/);
assert.doesNotMatch(endpoint, /installations\.values\(\)|sessions\.values\(\)/);
assert.match(stats, /detail === "lifetime-counters"/);
assert.match(admin, /Total de pesquisas efetuadas/);
assert.match(admin, /Resultados sem registo ASF/);
assert.match(admin, /detail=lifetime-counters/);
const dailyMetricsMigration = fs.readFileSync("supabase/migrations/20261109231356_rolling_30_day_daily_operational_metrics_20261109.sql", "utf8");
assert.match(stats, /detail === "daily-metrics-30d"/);
assert.match(stats, /verix_daily_metrics_30d_read/);
assert.match(admin, /Estatísticas de hoje/);
assert.ok(admin.includes('desde as 00:00 (Europe/Lisbon)'));
assert.ok(admin.includes('const today=data.days[data.days.length-1]'));
assert.ok(admin.includes('pct(noRecord,consultations)'));
assert.match(admin, /Histórico diário · últimos 30 dias/);
assert.match(admin, /Sem recolha/);
assert.match(admin, /detail=daily-metrics-30d/);
assert.match(dailyMetricsMigration, /CREATE TABLE IF NOT EXISTS public\.verix_daily_metrics/);
assert.match(dailyMetricsMigration, /ON CONFLICT \(stat_date\) DO UPDATE/);
assert.match(dailyMetricsMigration, /interval '30 days'/);
assert.match(dailyMetricsMigration, /verix_daily_metrics_30d_retention/);
const dashboardLoadStart = admin.indexOf("async function loadDashboard(force){");
const dashboardLoadEnd = admin.indexOf("async function loadInsuranceCases", dashboardLoadStart);
assert.ok(dashboardLoadStart >= 0 && dashboardLoadEnd > dashboardLoadStart, "counter dashboard loader must remain defined");
const counterDashboardLoader = admin.slice(dashboardLoadStart, dashboardLoadEnd);
assert.match(counterDashboardLoader, /detail=lifetime-counters/);
assert.doesNotMatch(counterDashboardLoader, /loadInsuranceCases|loadErrors/);

const app = fs.readFileSync("verix-app.html", "utf8");
const telemetryStart = app.indexOf("function parseReceipt(text)");
const telemetryEnd = app.indexOf("function rateLimited", telemetryStart);
assert.ok(telemetryStart >= 0 && telemetryEnd > telemetryStart, "production telemetry client must expose its receipt pipeline");
const clientTransport = app.slice(telemetryStart, telemetryEnd);
assert.match(clientTransport, /receipt:\s*parseReceipt\(await response\.text\(\)\)/);
assert.match(clientTransport, /queue = queue\.filter\(function \(item\)/);
assert.match(clientTransport, /!acknowledged\[item\.eventId\]/);
assert.match(clientTransport, /recordRejectedEvents\(batch, receipt\)/);
const beaconStart = app.indexOf("function flushBeacon()", telemetryStart);
const beaconEnd = app.indexOf("function rateLimited", beaconStart);
assert.ok(beaconStart >= 0 && beaconEnd > beaconStart, "sendBeacon handler must exist");
assert.doesNotMatch(app.slice(beaconStart, beaconEnd), /queue\.splice\(/, "sendBeacon must never dequeue without a server receipt");
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

console.log("PASS: atomic ingest receipt, ID-based client acknowledgement, loss-safe beacon queue, query-quality metrics and Admin labels.");
