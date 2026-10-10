import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = fs.readFileSync("supabase/functions/telemetry-v2/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261009034000_repair_telemetry_integrity_and_query_metrics.sql", "utf8");
const admin = fs.readFileSync("admin_v2.html", "utf8");
const stats = fs.readFileSync("supabase/functions/stats-v2/index.ts", "utf8");
const insuranceNoCasesMigration = fs.readFileSync("supabase/migrations/20261009080000_insurance_no_cases.sql", "utf8");
const errorPlateCountMigration = fs.readFileSync("supabase/migrations/20261009092500_deduplicate_error_plate_consultations.sql", "utf8");
const packageConfig = JSON.parse(fs.readFileSync("package.json", "utf8"));
const currentAppVersion = packageConfig.version.split(".").slice(0, 2).join(".");
assert.ok(stats.includes('const CURRENT_APP_VERSION = "' + currentAppVersion + '"'), "stats current version must match package.json major.minor");
assert.match(stats, /canonicalAppVersion\(e\?\.app_version\)===CURRENT_APP_VERSION/);
assert.match(stats, /current_version_errors:new Set\(currentVersionRows\.map/);
assert.match(stats, /current_app_version:CURRENT_APP_VERSION/);
assert.doesNotMatch(stats, /app14|["\']1\.4["\']/i, "stats must not hard-code the obsolete version filter");
assert.doesNotMatch(admin, /VERSÃO 1\.4|ERROS DA 1\.4|app14|versão 1\.4/i, "Admin must not display or consume obsolete 1.4 error metrics");
assert.match(admin, /inv\.current_version_errors/);
assert.match(admin, /inv\.current_version_installations/);
assert.match(admin, /inv\.current_version_plates/);
assert.match(admin, /d\.current_app_version/);

assert.match(endpoint, /db\.rpc\(\s*["']verix2_ingest_telemetry["']/);
assert.match(endpoint, /p_events:\s*events/);
assert.match(endpoint, /insuranceNoCases\.push/);
assert.match(endpoint, /\.from\("verix_insurance_no_cases"\)[\s\S]*?ignoreDuplicates:\s*true/);
assert.match(insuranceNoCasesMigration, /ENABLE ROW LEVEL SECURITY/);
assert.match(insuranceNoCasesMigration, /REVOKE ALL ON TABLE public\.verix_insurance_no_cases FROM PUBLIC, anon, authenticated/);
assert.match(insuranceNoCasesMigration, /interval '90 days'/);
assert.match(insuranceNoCasesMigration, /cron\.schedule/);
assert.match(stats, /detail==="insurance-no-cases"/);
assert.match(stats, /const pageSize = 1000;/, "90-day no-record list must paginate past PostgREST's default row cap");
assert.match(stats, /qs\.set\("offset",String\(page\*pageSize\)\)/, "no-record list must advance through complete result pages");
assert.match(stats, /if\(pageRows\.length<pageSize\) return cases;/, "no-record list must stop only after a short final page");
assert.match(stats, /insurance_no_cases_page_limit/, "an unexpectedly huge list must fail explicitly instead of silently truncating");
assert.match(admin, /MATRÍCULAS COM RESULTADO “SEM REGISTO”/);
assert.match(admin, /renderInsuranceNoCases/);
assert.match(admin, /id="errorPlates"/, "Admin must expose a dedicated ASF error-plate list");
assert.ok(admin.includes("const plateCases=inv.current_version_plate_cases;"), "Admin must distinguish missing error details from an empty loaded list");
assert.match(stats, /current_version_plate_cases:plateCases/, "stats must return error plate cases to Admin");
assert.ok(stats.includes("const candidates=[e?.metadata?.asfDiagnostic?.matricula,e?.metadata?.matriculaNormalizada,e?.metadata?.matricula]"), "error analytics must prefer a valid plate from supported metadata fields");
assert.ok(stats.includes('replace(/[ -]/g,"")'), "stats display normalization removes only expected separators");
assert.ok(stats.includes('current_version_invalid_plate_cases:invalidPlateCases'), "stats must return invalid plate inputs separately");
assert.ok(stats.includes('current_version_missing_plate_cases:missingPlateCases'), "stats must return errors without captured plates separately");
assert.match(admin, /id="errorInvalidPlates"/, "Admin must display invalid-format plate inputs in a separate table");
assert.match(admin, /id="errorMissingPlates"/, "Admin must display errors without a captured plate separately");
assert.match(admin, /ENTRADAS COM FORMATO INVÁLIDO/);
assert.match(admin, /ERROS SEM MATRÍCULA CAPTURADA/);

const normalizePlateForTest = value => String(value ?? "").trim().toUpperCase().replace(/[\\s-]/g, "");
const validPlateForTest = value => /^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$/.test(normalizePlateForTest(value));
for (const value of ["AA-00-00","AA0000","00-00-AA","0000AA","00-AA-00","00AA00","AA-00-AA","AA00AA"]) {
  assert.equal(validPlateForTest(value), true, "Portuguese plate format must be accepted: " + value);
}
for (const value of ["12-ABC-34","AA/00/00","89","177ZN","1234"]) {
  assert.equal(validPlateForTest(value), false, "non-Portuguese or partial plate format must be classified as invalid: " + value);
}
assert.match(endpoint, /if \(event !== "vehicle_insurance_error" && event !== "vehicle_plate_invalid"\) \{[\s\S]*?delete metadata\.matriculaNormalizada;/, "only ASF errors and explicit format rejections may retain plate text");
assert.match(endpoint, /insuranceNoCases\.push/, "valid no-record outcomes must enter the dedicated 90-day registry");
assert.match(admin, /O resultado, por si só, não confirma a ausência de seguro/, "no-record list must warn that no record alone is not proof");
assert.match(admin, /Um erro técnico fica separado e não entra aqui\./, "admin must distinguish technical ASF errors from no-record results");
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


// Portuguese vehicle series, machinery suffixes, trailers, diplomatic and export series.
const strictPlateBaseTest = value => {
  const raw=String(value??"").trim().toUpperCase();
  if (/^[A-Z]{2}[ -]?[0-9]{2}[ -]?[0-9]{2}$/.test(raw)
    || /^[0-9]{2}[ -]?[0-9]{2}[ -]?[A-Z]{2}$/.test(raw)
    || /^[0-9]{2}[ -]?[A-Z]{2}[ -]?[0-9]{2}$/.test(raw)) return true;
  const m=raw.match(/^([A-Z]{2})[ -]?[0-9]{2}[ -]?([A-Z]{2})$/);
  if(!m)return false;
  if(/^(?:AA|EE|II|OO|UU)$/.test(m[1])||/^(?:AA|EE|II|OO|UU)$/.test(m[2]))return true;
  return !/[AEIOU]/.test(m[1][1])&&!/[AEIOU]/.test(m[2][1]);
};
const strictPlateTest = value => {
  const raw=String(value??"").trim().toUpperCase();
  if(strictPlateBaseTest(raw))return true;
  const machine=raw.match(/^(.+?)[ -]?([A-H])$/);
  if(machine&&strictPlateBaseTest(machine[1]))return true;
  if(/^[0-9]{3}[ -](?:CD|CC|FM)[0-9]{3}$/.test(raw))return true;
  if(/^[0-9]+[ -]?[LPAM]$/.test(raw))return true;
  return /^(?:AV|BE|BN|BR|CB|FA|GD|LE|PT|SA|SE|VC|VR|VI|AN|H|A|M|L|P|C|E)[ -]?[0-9]{1,6}$/i.test(raw);
};
for(const v of ["AA-00-00","00-00-AA","00-AA-00","AA-01-AA","AB-12-CD","AA-01-AE","AA-00-00-A","00-AA-00-B","VC-123456","BN-12345","L-123456","001-CD001","001-CC001","001-FM001","12345-L","456-P","789-A","100-M"]) assert.equal(strictPlateTest(v),true,"should accept "+v);
for(const v of ["Aa-2a-ae","AA/00/00","AA--00--00","BA-12-CA","AB-12-AE","AA-00-00-Z","BG-12345","VS-12345","X-12345","L-1234567","L/12345","001-XX001","001CD001","12-X"]) assert.equal(strictPlateTest(v),false,"should reject "+v);
assert.ok(stats.includes("validPortugueseTrailerPlate"), "stats must classify legal trailer formats");
assert.ok(stats.includes("validPortuguesePlateBase"), "stats must apply the current-series vowel restriction");
assert.ok(endpoint.includes("isValidPortugueseTrailerPlateFormat"), "backend must recognize legal trailer codes");
assert.ok(endpoint.includes("Industrial machinery plates"), "backend must recognize the industrial class suffix");
assert.ok(endpoint.includes("MNE privileged registration"), "backend must recognize official diplomatic registrations");
assert.ok(endpoint.includes("Export registration"), "backend must recognize Portuguese export series");
const app = fs.readFileSync("verix-app.html", "utf8");
assert.doesNotMatch(app, /\b(?:APP_VERSION|appVersion|app_version)\s*[:=]\s*["\']1\.4(?:\.\d+)?["\']/i, "production runtime must not advertise the obsolete app version");
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
assert.match(app, /function cleanMetadata\(meta, event\)/, "client metadata sanitizer must know which event is being sent");
assert.match(app, /function insurancePlateMetadata\(value, asfDiagnostic\)/, "insurance outcome wrappers must normalize the plate");
assert.match(app, /push\('vehicle_insurance_no', 'consulta', meta\)/, "no-record event must include plate metadata");
assert.match(app, /push\('vehicle_insurance_error', 'consulta', meta\)/, "ASF error event must include plate metadata");
assert.match(app, /event === 'vehicle_insurance_no' \|\| event === 'vehicle_insurance_error'/, "plate metadata must be limited to no-record/error events");


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
assert.match(presenceMigration, /last_presence >= p_now-interval '90 seconds'/, "historical browser-presence migration must remain available for audit");
const currentOnlineMigration = fs.readFileSync("supabase/migrations/20261010070000_fix_rolling_windows_and_online_consultation_metric.sql", "utf8");
assert.match(currentOnlineMigration, /'online_now',\(SELECT count\(DISTINCT installation_id\)/, "current online status must count distinct installations");
assert.match(currentOnlineMigration, /event='vehicle_lookup'/, "online status must require a real consultation");
assert.match(currentOnlineMigration, /interval '3 minutes'/, "online status must use the requested three-minute window");
assert.ok(admin.includes("Instalações que fizeram uma consulta nos últimos 3 minutos."), "Online agora must explain the consultation-based three-minute rule");
const rollingPeriodsMigration = fs.readFileSync("supabase/migrations/20261010073000_make_7d_30d_windows_rolling.sql", "utf8");
assert.match(rollingPeriodsMigration, /p_now - interval '7 days' AS s7/, "previous rolling-period behavior must remain documented in migration history");
assert.match(rollingPeriodsMigration, /p_now - interval '30 days' AS s30/, "previous rolling-period behavior must remain documented in migration history");
const alignedPeriodsMigration = fs.readFileSync("supabase/migrations/20261010081254_align_period_windows_with_history_total.sql", "utf8");
const validPlateErrorSummaryMigration = fs.readFileSync("supabase/migrations/20261010084904_count_only_valid_plate_errors_in_summary.sql", "utf8");
assert.match(alignedPeriodsMigration, /greatest\(p_now - interval '24 hours', public\.verix2_all_start\(p_now\)\) AS s24/, "24-hour period must not include events before the total-history baseline");
assert.match(alignedPeriodsMigration, /greatest\(p_now - interval '7 days', public\.verix2_all_start\(p_now\)\) AS s7/, "7-day period must not include events before the total-history baseline");
assert.match(alignedPeriodsMigration, /greatest\(p_now - interval '30 days', public\.verix2_all_start\(p_now\)\) AS s30/, "30-day period must not include events before the total-history baseline");
assert.match(validPlateErrorSummaryMigration, /'errors_valid_plate'/, "analytics must expose a separate valid-plate error metric");
assert.match(validPlateErrorSummaryMigration, /query_quality_total/, "valid-plate error metric must cover lifetime history");
assert.match(validPlateErrorSummaryMigration, /fc\.metadata/, "lifetime error analysis must retain final outcome metadata");
assert.match(admin, /errs=Number\(p\.errors_valid_plate\?\?0\)/, "main summary must count only error queries with a valid Portuguese plate format");
assert.match(admin, /Só conta erros com matrícula de formato português válido/, "summary error card must explain the filter");
assert.match(admin, /não é possível reconstruir o texto original/, "admin must explain why some old unrecorded plate inputs cannot be recovered");
assert.ok(errorPlateCountMigration.includes("count(DISTINCT e.query_id) qty"), "error plate totals must count unique consultation IDs");
assert.ok(errorPlateCountMigration.includes("count(*) event_qty"), "raw error event volume must remain visible separately");
assert.ok(errorPlateCountMigration.includes("^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$"), "error plate table must allow only complete Portuguese plate formats");
assert.ok(endpoint.includes("function sanitizeErrorPlateMetadata("), "server must classify captured plate inputs before persistence");
assert.ok(endpoint.includes("const candidates = [metadata.matricula, diag?.matricula, metadata.matriculaNormalizada]"), "server must prefer the original captured plate input when validating its format");
assert.ok(endpoint.includes('replace(/[\\s-]/g, "")'), "server must ignore spaces and hyphens only when validating Portuguese plate formats");
assert.ok(endpoint.includes("metadata.matricula = raw;"), "server must retain malformed input on ASF error events for separate admin classification");
assert.ok(endpoint.includes("delete metadata.matriculaNormalizada;"), "invalid input must not be marked as a normalized valid registration");
assert.ok(endpoint.includes('if (event === "vehicle_insurance_error") sanitizeErrorPlateMetadata(metadata);'), "server must apply plate validation to ASF error events");
assert.ok(admin.includes("CONSULTAS','EVENTOS"), "Admin must distinguish consultation totals from raw event totals");
assert.ok(stats.includes("queryIds:new Set<string>()"), "error time buckets must deduplicate repeated events by query ID");
assert.ok(stats.includes("event_count:b.events"), "error time buckets must expose raw event count separately");

assert.ok(stats.includes("error_queries_24h:new Set(rows.map"), "error total must count unique query IDs separately from event rows");
assert.ok(stats.includes("current_version_error_events:currentVersionRows.length"), "version errors must expose raw events separately from distinct queries");
assert.ok(stats.includes("latestErrorByQuery"), "error plate details must not repeat the same consultation");
assert.ok(stats.includes("valid_plate_error_queries_24h:countDistinctQueries(validPlateErrorRows)"), "admin error summary must count only valid-format plate error consultations");
assert.ok(stats.includes("valid_plate_error_plates_24h:validPlateErrorPlates"), "admin summary plate list must contain valid-format plate errors only");
assert.ok(admin.includes("err=Number(p.errors_valid_plate??0)"), "insurance summary must count only valid-format plate errors");
assert.ok(admin.includes("fmt(x.errors_valid_plate??0)"), "period comparison must count only valid-format plate errors");
assert.ok(admin.includes("inv.current_version_valid_error_queries"), "Errors summary must exclude invalid-format plate inputs from counts");
assert.ok(admin.includes("inv.valid_plate_error_types_24h||[]"), "Error type summaries must exclude invalid-format plate inputs");
assert.ok(stats.includes('qs.set("offset",String(page*pageSize))'), "error investigation must page through all raw telemetry instead of truncating at 1,000 rows");
assert.ok(stats.includes("validPortuguesePlate"), "error plate diagnostics must use complete Portuguese plate formats");
assert.ok(endpoint.includes("function isValidPortugueseVehiclePlateFormat(value: unknown)") && endpoint.includes("isValidPortugueseVehiclePlateFormat(raw)"), "server must reject incomplete formats and apply current-series restrictions");



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
