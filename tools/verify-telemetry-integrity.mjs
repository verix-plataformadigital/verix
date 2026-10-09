import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = fs.readFileSync("supabase/functions/telemetry-v2/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261009034000_repair_telemetry_integrity_and_query_metrics.sql", "utf8");
const admin = fs.readFileSync("admin_v2.html", "utf8");

assert.match(endpoint, /db\.rpc\(\s*["']verix2_ingest_telemetry["']/);
assert.match(endpoint, /p_events:\s*events/);
assert.match(endpoint, /p_installations:\s*\[\.\.\.installations\.values\(\)\]/);
assert.match(endpoint, /p_sessions:\s*\[\.\.\.sessions\.values\(\)\]/);
assert.doesNotMatch(endpoint, /db\.from\(["']verix2_(?:events|installations|sessions)["']\)\.upsert/);
assert.match(endpoint, /receipt\?\.events_inserted/);
assert.match(endpoint, /accepted:\s*inserted/);
assert.match(endpoint, /duplicates,/);
assert.match(endpoint, /rejected,/);
assert.match(migration, /SECURITY INVOKER/);
assert.match(migration, /verix2_ingest_telemetry\(jsonb, jsonb, jsonb\)/);
assert.match(migration, /WHERE event='vehicle_lookup' AND query_id IS NOT NULL/);
assert.doesNotMatch(migration, /SELECT DISTINCT ON\(query_id\)/);
assert.equal((migration.match(/NOT EXISTS\(SELECT 1 FROM public\.verix2_events lookup_event WHERE lookup_event\.event='vehicle_lookup' AND lookup_event\.query_id=fc\.query_id\)/g) || []).length, 3, "orphan finals must be checked against all recorded lookups, not only the 30-day analytics slice");
for (const metric of ["'pending'","'incomplete'","'contradictory'","'duplicate_finals'","'orphan_finals'"]) assert.ok(migration.includes(metric), "missing SQL metric "+metric);
for (const label of ["Incompletas","Contraditórias","Finais duplicados","Finais órfãos","INSTALAÇÕES"]) assert.ok(admin.includes(label), "missing Admin label "+label);

const app = fs.readFileSync("verix-app.html", "utf8");
const telemetryStart = app.indexOf("function parseReceipt(text)");
const telemetryEnd = app.indexOf("function rateLimited", telemetryStart);
assert.ok(telemetryStart >= 0 && telemetryEnd > telemetryStart, "production telemetry client must expose its receipt pipeline");
const clientTransport = app.slice(telemetryStart, telemetryEnd);
assert.match(clientTransport, /return parseReceipt\(await response\.text\(\)\)/);
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

const presenceMigration = fs.readFileSync("supabase/migrations/20261009045708_fix_browser_presence_kpi.sql", "utf8");
assert.match(endpoint, /"session_close"/, "server must accept browser-close presence events");
assert.match(telemetryScript, /push\('session_close', null\)/, "pagehide must emit a browser-close event");
assert.match(telemetryScript, /navigator\.sendBeacon\([\s\S]*events: \[closingEvent\]/, "browser-close event must be sent immediately through Beacon");
assert.match(presenceMigration, /'online_now',\(SELECT count\(\*\)/, "online_now must count sessions, not installations");
assert.match(presenceMigration, /last_presence >= p_now-interval '90 seconds'/, "online presence must expire after the heartbeat lease");
assert.match(presenceMigration, /event IN \('app_open','heartbeat','session_close'\)/, "online presence must use lifecycle events only");
assert.match(presenceMigration, /last_close IS NULL OR last_presence > last_close/, "a later close event must remove a session from the active count");
assert.ok(admin.includes("Sessões VÉRIX com browser aberto."), "Ativos agora must describe browser sessions, not installations");

const hourlyMigration = fs.readFileSync("supabase/migrations/20261009051204_hourly_consultations_and_presence.sql", "utf8");
assert.match(hourlyMigration, /generate_series\(0,23\)/, "hourly chart must include all 24 hours, including zero-activity hours");
assert.match(hourlyMigration, /count\(DISTINCT e\.query_id\) FILTER/, "hourly consultation count must deduplicate query IDs");
assert.match(hourlyMigration, /e\.event='vehicle_lookup'/, "hourly consultations must count actual lookup starts");
assert.match(hourlyMigration, /count\(DISTINCT e\.installation_id\) FILTER/, "hourly presence must count distinct installations");
assert.match(hourlyMigration, /e\.event IN \('app_open','heartbeat'\)/, "hourly presence must use app-open/heartbeat events");
assert.ok(admin.includes("CONSULTAS E ONLINE POR HORA"), "dashboard must describe the updated hourly metrics");
assert.ok(admin.includes("CONSULTAS E PRESENÇA POR HORA"), "usage page must describe the updated hourly metrics");
assert.match(admin, /Number\(x\.consultations\|\|0\)/, "hour chart must use consultation count");
assert.match(admin, /fmt\(x\.users\|\|0\)/, "hour chart must show online installations");
assert.match(admin, /Hora com mais consultas/, "dashboard insight must refer to consultations, not generic actions");

console.log("PASS: atomic telemetry ingest, loss-safe beacon queue, browser presence KPI, hourly query deduplication, 24-hour presence chart, and Admin labels.");
