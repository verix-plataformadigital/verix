import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const endpoint = fs.readFileSync("supabase/functions/telemetry-v2/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261009034000_repair_telemetry_integrity_and_query_metrics.sql", "utf8");
const admin = fs.readFileSync("admin_v2.html", "utf8");
const adminPwaEntry = fs.existsSync("dist/admin/index.html")
  ? fs.readFileSync("dist/admin/index.html", "utf8")
  : "";
const app = fs.readFileSync("verix-app.html", "utf8");
const telemetrySource = fs.readFileSync("telemetry/browser-runtime.ts", "utf8");
const builtApp = fs.readFileSync("dist/verix-app.html", "utf8");
const livePresence = fs.readFileSync("verix-presence-v1.mjs", "utf8");
const livePresenceCleanupMigration = fs.readFileSync("supabase/migrations/20261019110000_realtime_presence_metric_cleanup.sql", "utf8");
const livePresenceOperationalMetricsMigration = fs.readFileSync("supabase/migrations/20261019094000_realtime_presence_installation_metrics.sql", "utf8");
const stats = fs.readFileSync("supabase/functions/stats-v2/index.ts", "utf8");
const overviewOptimizationMigration = fs.readFileSync("supabase/migrations/20261014150000_optimize_admin_dashboard_fast_overview.sql", "utf8");
const insuranceNoCasesMigration = fs.readFileSync("supabase/migrations/20261009080000_insurance_no_cases.sql", "utf8");
const insurance24hRetentionMigration = fs.readFileSync("supabase/migrations/20261019125854_insurance_no_cases_24h_retention.sql", "utf8");
const adminManifest = JSON.parse(fs.readFileSync("admin.webmanifest", "utf8"));
const operationalManifest = JSON.parse(fs.readFileSync("site.webmanifest", "utf8"));
const scopedAdminManifest = fs.existsSync("dist/admin/manifest.webmanifest") ? JSON.parse(fs.readFileSync("dist/admin/manifest.webmanifest", "utf8")) : null;
const serviceWorker = fs.readFileSync("sw.js", "utf8");
const stalePendingMigration = fs.readFileSync("supabase/migrations/20261018092000_fix_stale_pending_query_status.sql", "utf8");
const errorPlateCountMigration = fs.readFileSync("supabase/migrations/20261009092500_deduplicate_error_plate_consultations.sql", "utf8");
const adminV3Migration = fs.readFileSync("supabase/migrations/20261018200000_admin_dashboard_v3_rebuild.sql", "utf8");
const adminV3ErrorJoinMigration = fs.readFileSync("supabase/migrations/20261019103810_optimize_admin_v3_error_event_join.sql", "utf8");
const adminHistoryResetMigration = fs.readFileSync("supabase/migrations/20261019063600_admin_total_history_since_stable_reset.sql", "utf8");
const adminV3TotalResetMigration = fs.readFileSync("supabase/migrations/20261019110344_admin_v3_total_since_reset.sql", "utf8");
const adminV3RecoverLegacyConsultationsMigration = fs.readFileSync("supabase/migrations/20261019114442_admin_v3_recover_legacy_orphan_consultations.sql", "utf8");
const adminV3RestoreInputClassificationMigration = fs.readFileSync("supabase/migrations/20261019120225_admin_v3_restore_invalid_input_classification.sql", "utf8");
const adminLiveSummaryStreamlinedMigration = fs.readFileSync("supabase/migrations/20261019111618_admin_live_summary_remove_in_progress.sql", "utf8");
const adminLiveInsuranceDeltaMigration = fs.readFileSync("supabase/migrations/20261019125025_admin_live_insurance_delta.sql", "utf8");
const adminErrorClassificationMigration = fs.readFileSync("supabase/migrations/20261019070000_admin_filter_user_input_invalid_plates.sql", "utf8");
const packageConfig = JSON.parse(fs.readFileSync("package.json", "utf8"));
const currentAppVersion = packageConfig.version.split(".").slice(0, 2).join(".");
assert.ok(stats.includes('const CURRENT_APP_VERSION = "' + currentAppVersion + '"'), "stats current version must match package.json major.minor");
assert.match(stats, /canonicalAppVersion\(e\?\.app_version\)===CURRENT_APP_VERSION/);
assert.match(stats, /current_version_errors:new Set\(currentVersionRows\.map/);
assert.match(stats, /current_app_version:CURRENT_APP_VERSION/);
assert.doesNotMatch(stats, /app14|["\']1\.4["\']/i, "stats must not hard-code the obsolete version filter");
assert.doesNotMatch(admin, /VERSÃO 1\.4|ERROS DA 1\.4|app14|versão 1\.4/i, "Admin must not display or consume obsolete 1.4 error metrics");
assert.match(admin, /detail=dashboard-v3/, "new Admin must consume the V3 dashboard contract");
assert.ok(admin.includes("Evolução diária — desde 9 de outubro") && admin.includes("function renderDailyTrend()") && admin.includes("rows=rows.filter(row=>row.day>=ASF_TREND_START_DAY).slice(-30)"), "Usage page must limit daily charts and summaries to 9 October onward");
assert.ok(stats.includes('detail === "daily-trend-30d"') && stats.includes('verix2_admin_daily_trend_30d'), "Admin stats endpoint must expose the authenticated 30-day trend payload");
const dailyTrendMigration = fs.readFileSync("supabase/migrations/20261019181805_admin_daily_trend_30d_unique_total.sql", "utf8");
assert.ok(dailyTrendMigration.includes("uniqueInstallations30d") && dailyTrendMigration.includes("activeInstallations") && dailyTrendMigration.includes("consultations"), "daily trend migration must supply total distinct installations and daily consultation/install counts");
assert.ok(admin.includes('id="dailyTrendComparison"') && admin.includes('function renderDailyTrendPlot') && admin.includes('dailyTrendUsersChart'), "30-day trend must render separate readable daily charts for searches and active installations");
assert.ok(admin.includes("trendDailyDelta") && admin.includes("Valores diários de pesquisas e utilizadores") && admin.includes("Valores diários ASF — números exatos"), "Daily trend must provide exact ASF and usage values with day-over-day change");
assert.ok(admin.includes("Semana anterior:") && admin.includes("Dia em curso"), "30-day trend must compare full weeks and mark today's partial counts rather than treating them as a complete day");

const trendDateParserMatch = admin.match(/function trendDayParts\(value\)\{[\s\S]*?\n\}/);
assert.ok(trendDateParserMatch, "30-day trend must contain its date parser");
const trendDayParts = vm.runInNewContext("(" + trendDateParserMatch[0] + ")");
assert.equal(JSON.stringify(trendDayParts("2026-10-20")), JSON.stringify({year:2026,month:10,day:20}), "30-day trend date parser must accept ISO calendar dates returned by PostgreSQL");
assert.equal(trendDayParts("not-a-date"), null, "30-day trend date parser must reject invalid calendar-date strings");
assert.ok(adminPwaEntry.includes('rel="manifest" href="./manifest.webmanifest?v=20261019-admin5"'), "GitHub Pages Admin must link its own manifest under /admin/");
assert.ok(admin.includes("isSharedGithubPagesOrigin") && admin.includes("isAdminScopedPath"), "Admin installation guard must allow installation only from its dedicated /admin/ path");
assert.ok(admin.includes("VERIX_ADMIN_PWA_INSTALLED_V5"), "Admin installation flag must be versioned so old same-origin attempts cannot hide the new install control");
assert.ok(!adminPwaEntry.includes('id="installAdminLogin"'), "Admin install control must not appear on the sign-in screen");
assert.ok(adminPwaEntry.includes('id="installAdminApp"'), "Admin install control must be available inside the authenticated dashboard");
const adminAppStart = adminPwaEntry.indexOf('<div id="app"');
const adminInstallPosition = adminPwaEntry.indexOf('id="installAdminApp"');
assert.ok(adminAppStart >= 0 && adminInstallPosition > adminAppStart, "Admin install control must be inside the authenticated application");
assert.ok(admin.includes("navigator.serviceWorker.register('./sw.js'"), "Admin must register the fresh-navigation service worker when opened directly");
assert.ok(admin.includes("new URL('./admin/'") && admin.includes("window.location.replace(destination.toString())") && admin.includes("isAdminEntry"), "GitHub Pages Admin entry must route into the dedicated /admin/ path");
for (const file of ["supabase/functions/admin-auth-v2/index.ts","supabase/functions/stats-v2/index.ts","supabase/functions/telemetry-v2/index.ts"]) {
  assert.ok(fs.readFileSync(file, "utf8").includes('"https://verix-plataformadigital.github.io"'), "backend CORS allowlist must include the GitHub Pages Admin origin: " + file);
}
assert.ok(livePresence.includes("verix-admin-pwa") && livePresence.includes("verix-admin-edge-v1") && livePresence.includes("verix-admin-v5") && livePresence.includes("currentPath"), "live presence must classify GitHub Pages /admin/ separately from operational VÉRIX");
assert.equal(adminManifest.start_url, "./admin/index.html?app=verix-admin-v5", "installed Admin launches directly at the sign-in page");
assert.equal(adminManifest.scope, "./admin/", "Admin PWA scope must be narrower than the operational app scope");
assert.equal(adminManifest.id, "/verix/admin/", "Admin PWA identity must differ from the operational VÉRIX app");
assert.equal(operationalManifest.id, "/verix/operational-v4/", "Operational PWA must use its explicit stable install identity");
assert.notEqual(adminManifest.id, operationalManifest.id, "Admin and Operational install identities must not collide");
assert.equal(operationalManifest.start_url, "./index.html?app=verix-operational-v4", "Operational start URL must have a unique fallback identity");
assert.ok(scopedAdminManifest, "Admin must have a separate manifest file within its own scope");
assert.ok(fs.existsSync("dist/admin/verix-presence-v1.js"), "Admin bundle must include its own realtime-presence runtime");
assert.ok(fs.existsSync("dist/admin/AI-ACCESS-POLICY.md"), "Admin bundle must include its own policy document");
assert.ok(fs.existsSync("dist/admin/assets/admin-icon-192.png") && fs.existsSync("dist/admin/assets/admin-icon-512.png"), "Admin bundle must include its own install icons");
assert.equal(scopedAdminManifest.id, "/verix/admin/", "Admin-scoped manifest must use the distinct Admin ID");
assert.equal(scopedAdminManifest.start_url, "./index.html?app=verix-admin-v5", "Admin-scoped manifest must use its unique launch URL");
assert.equal(scopedAdminManifest.scope, "./", "Admin-scoped manifest scope must be restricted to /admin/");
assert.notEqual(scopedAdminManifest.start_url, operationalManifest.start_url, "Admin and Operational fallback launch URLs must differ");
assert.ok(adminPwaEntry.includes("manifest.webmanifest?v=20261019-admin5"), "GitHub Pages Admin entry must link its own installable manifest");
assert.equal(adminManifest.display, "standalone", "Admin PWA opens without browser chrome when supported");
assert.ok(serviceWorker.includes("isAdminManifest") && serviceWorker.includes("fetch(request, { cache: 'no-store' })"), "Admin navigation and manifest must not be cached");
assert.match(admin, /id="livePresenceCards"/, "Admin must show dedicated realtime presence metrics");
assert.match(admin, /Online agora/, "Admin must show the current online-installation count");
assert.match(admin, /id="livePresenceOnline"/, "Admin must display online presence");
assert.match(admin, /id="livePresenceActive"/, "Admin must display recent active installations");
assert.doesNotMatch(admin, /Instalações a consultar|Consultas em curso|livePresenceConsulting|consultationsInProgress|installationsQueryingNow|activeInstallationsLast3Minutes/, "Admin must not display short-lived pending-query counters or duplicate three-minute installation counts");
assert.match(admin, /Vistas na última hora/, "Admin must label last-hour sightings without implying that the installations remain online");
assert.match(admin, /id="livePresenceHour"/, "Admin must bind the last-hour installation count");
assert.doesNotMatch(admin, /liveUsers\.onlineNow/, "Admin must not use the stale heartbeat-derived online count");
assert.match(app, /verix-presence-v1\.js\?v=/, "desktop/mobile app must load realtime presence runtime");
assert.match(livePresence, /from ['"]@supabase\/supabase-js['"]/, "presence source must use the official Supabase SDK");
assert.match(livePresence, /presenceState\(\)/, "Admin counts must come from current Realtime Presence state");
assert.match(livePresence, /ACTIVE_WINDOW_MS = 120000/, "active now must require recent activity");
assert.match(livePresence, /trackedChannel\.track\(currentPayload\(\)\)/, "app must publish live presence using the channel that initiated the call");
assert.match(livePresence, /TRACK_MIN_INTERVAL_MS = 30000/, "presence updates must be throttled to avoid high-frequency channel sync");
assert.match(livePresence, /URGENT_TRACK_MIN_INTERVAL_MS = 2500/, "meaningful clicks can refresh activity presence without removing background throttling");
assert.match(livePresence, /now - lastTrackAt < 1200 && pendingTrackTimer === null/, "a pending throttled heartbeat must not suppress an urgent search click");
assert.match(livePresence, /event\.type === 'click' \|\| event\.type === 'submit'/, "clicks and submits must trigger an urgent live-presence refresh");
assert.match(livePresence, /track\(true\)/, "urgent activity must bypass only the background track cooldown");
assert.match(livePresence, /function scheduleReconnect\(delayMs\)/, "presence must attempt to recover a broken Realtime connection with bounded cooldowns");
assert.match(livePresence, /pendingTrackTimer/, "activity bursts must be coalesced into one delayed presence update");
assert.equal((livePresence.match(/trackedChannel !== channel/g) || []).length, 2, "late track callbacks must not affect a replacement presence channel");
assert.match(livePresence, /if \(!forceNow && lastTrackAt && elapsed < TRACK_MIN_INTERVAL_MS\)/, "ordinary background presence updates must retain the 30-second throttle");
assert.match(livePresence, /if \(forceNow && pendingTrackTimer !== null\)/, "urgent presence updates must cancel a queued throttled update before sending");
assert.match(livePresence, /scheduleReconnect\(32000\)/, "track failures must wait beyond the 30-second rate-limit window before reconnecting");
assert.match(livePresence, /window\.addEventListener\('pageshow'/, "presence must rejoin after browser back-forward cache restores a page");
assert.match(admin, /Instalações com consulta · última hora/, "Admin must retain the distinct installations that consulted vehicles during the last hour");
assert.match(stats, /installationsSeenLastHour: Number\(liveSummary\?\.installationsSeenLastHour \|\| 0\)/, "stats must expose the distinct last-hour presence metric");
assert.match(stats, /consultationsLast3Minutes: Number\(liveSummary\?\.consultationsLast3Minutes \|\| 0\)/, "stats must expose recent query volume from the consolidated live summary");
assert.doesNotMatch(stats, /consultationsInProgress: Number\(liveSummary|installationsQueryingNow: Number\(liveSummary|activeInstallationsLast3Minutes: Number\(liveActivity/, "stats must not return short-lived in-progress counters or the redundant active-installations query count");
const dashboardV3Route = stats.slice(stats.indexOf('detail === "dashboard-v3"'), stats.indexOf('detail === "error-ledger-v3"'));
assert.doesNotMatch(dashboardV3Route, /verix2_admin_live_activity_v3/, "V3 dashboard must use one consolidated live-summary RPC rather than separate redundant live queries");
assert.match(adminLiveSummaryStreamlinedMigration, /'consultationsLast3Minutes'/, "the consolidated live summary must retain recent query volume");
assert.match(adminLiveSummaryStreamlinedMigration, /'installationsConsultedLastHour'/, "the consolidated live summary must retain distinct installations that consulted in the last hour");
assert.doesNotMatch(adminLiveSummaryStreamlinedMigration, /\brecent_lookups\b|\bin_progress\s+AS\s*\(/, "the current live-summary migration must not calculate fleeting in-progress queries");
assert.doesNotMatch(stats, /onlineNow: Number\(liveSummary|onlineSessions: Number\(liveSummary|activeNow: Number\(liveSummary/, "stats must not keep legacy heartbeat-based online estimates");
assert.match(livePresenceCleanupMigration, /'installationsSeenLastHour'/, "database summary must retain a separate last-hour presence receipt count");
assert.match(livePresenceOperationalMetricsMigration, /'installationsQueryingNow'/, "database summary must count installations with consultations in progress");
assert.match(livePresenceOperationalMetricsMigration, /'installationsSeenLastHour'/, "last-hour metric must include all received installation events, not only heartbeats");
assert.doesNotMatch(livePresenceOperationalMetricsMigration, /\bDELETE FROM public\.verix2_events\b|\bTRUNCATE\b|\bDROP TABLE\b/i, "live presence changes must preserve telemetry history");
assert.doesNotMatch(livePresenceCleanupMigration, /'onlineNow'|'onlineSessions'|'activeNow'|'activeInstallationsLastHour'/, "legacy database presence estimates must be removed");
assert.doesNotMatch(livePresenceCleanupMigration, /\bDELETE FROM public\.verix2_events\b|\bTRUNCATE\b|\bDROP TABLE\b/i, "presence cleanup must not delete telemetry history or tables");
assert.match(admin, /detail=error-ledger-v3/, "new Admin must consume the paginated detailed error ledger");
assert.match(stats, /verix2_admin_insurance_delta_v1/, "dashboard must merge recent insurance outcomes into the cached period aggregates");
assert.match(stats, /p_force_refresh: forceRefresh/, "manual Admin refresh must request a refreshed aggregate snapshot");
assert.ok(adminLiveInsuranceDeltaMigration.includes("candidate_ids AS MATERIALIZED") && adminLiveInsuranceDeltaMigration.includes("state_before AS") && adminLiveInsuranceDeltaMigration.includes("state_now AS"), "live insurance delta must compare cached and current query state to avoid double-counting");
assert.ok(admin.includes('id="insuranceCasesDisclosure"') && admin.includes("insuranceCasesDisclosure').addEventListener('toggle'"), "recent no-record insurance list must load only when expanded");
assert.match(admin, /Histórico Total/, "new Admin must expose the history period");
assert.match(admin, /data-period="today"/);
assert.match(admin, /data-period="week"/);
assert.match(admin, /data-period="total"/);
assert.match(admin, /<h2>Estado operacional<\/h2>/, "the Overview must have a compact live-state section");
assert.match(admin, /<h2>Indicadores do período<\/h2>/, "the Overview must label selected-period metrics separately");
assert.match(admin, /Atividade recente/, "the Overview must give rolling-window metrics their own compact section");
assert.match(admin, /Base acumulada da aplicação/, "the registered-installation count must be identified as an all-time base total");
assert.match(admin, /todayHourlyPanel[^>]*hidden|todayHourlyPanel/, "today-only hourly chart must have its own conditional panel");
assert.doesNotMatch(admin, /Métricas por período|Resumo por período/, "the Admin must not mix three historical windows into a page whose global period selector is active");


assert.match(endpoint, /db\.rpc\(\s*["']verix2_ingest_telemetry["']/);
assert.match(endpoint, /p_events:\s*events/);
assert.ok(endpoint.includes('if (!(await consumeRate(`vehicle:${installationKey}`, 30))) {'), "vehicle rate-limit guard must remain syntactically balanced");
assert.match(endpoint, /const blockedLookupQueries = new Map/);
assert.match(endpoint, /event === "vehicle_insurance_pending" && \(!queryId \|\| !appVersion\)/, "pending events require a query ID and app version");
assert.match(endpoint, /const consultationOutcomeEvents = events\.filter/);
assert.match(endpoint, /\.eq\("event", "vehicle_lookup"\)\s*\.in\("query_id", candidateQueryIds\)/, "pending/final outcomes must be checked against a stored lookup when split across batches");
assert.match(endpoint, /blockedDependentEventIds\.has\(insuranceNoCases\[i\]\.event_id\)/, "orphan no-record outcomes must not enter the retention registry");
assert.match(endpoint, /lookup_missing/);
assert.match(stalePendingMigration, /max\(occurred_at\) AS pending_at/);
assert.ok(stalePendingMigration.includes("pending_at >= p_now - interval '10 minutes'"), "only recently updated consultations may remain pending");
assert.ok(stalePendingMigration.includes("ELSE 'incomplete'"), "stale pending consultations must be reclassified as incomplete");
assert.match(endpoint, /insuranceNoCases\.push/);
assert.match(endpoint, /\.from\("verix_insurance_no_cases"\)[\s\S]*?ignoreDuplicates:\s*true/);
assert.match(insuranceNoCasesMigration, /ENABLE ROW LEVEL SECURITY/);
assert.match(insuranceNoCasesMigration, /REVOKE ALL ON TABLE public\.verix_insurance_no_cases FROM PUBLIC, anon, authenticated/);
assert.match(insuranceNoCasesMigration, /interval '90 days'/);
assert.match(insuranceNoCasesMigration, /cron\.schedule/);
assert.ok(insurance24hRetentionMigration.includes("ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours')"), "no-record registry expiry must default to 24 hours");
assert.ok(insurance24hRetentionMigration.includes("DELETE FROM public.verix_insurance_no_cases") && insurance24hRetentionMigration.includes("WHERE created_at < now() - interval '24 hours'"), "old no-record plate rows must be physically deleted after 24 hours");
assert.ok(insurance24hRetentionMigration.includes("schedule := '*/5 * * * *'"), "expired plate rows must be cleaned automatically every five minutes");
assert.ok(!endpoint.includes("expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)"), "database must set created_at/expires_at consistently");
assert.match(stats, /detail==="insurance-no-cases"/);
assert.match(stats, /const pageSize=1000, maxPages=100;/, "legacy complete-list path must paginate with bounded pages");
assert.match(stats, /qs\.set\("offset",String\(offset\)\)/, "no-record list page fetch must honour the requested offset");
assert.match(stats, /fetchPage\(pageSize,page\*pageSize\)/, "legacy complete-list pagination must advance each page");
assert.match(stats, /if\(rows\.length<pageSize\)return cases;/, "legacy complete-list pagination must stop after a short final page");
assert.match(stats, /insurance_no_cases_page_limit/, "an unexpectedly huge list must fail explicitly instead of silently truncating");
assert.match(admin, /Matrículas com resultado “sem registo”/);
assert.match(admin, /renderInsuranceNoCases/);
assert.match(admin, /id="errorPlates"/, "Admin must expose a dedicated ASF error ledger");
assert.match(admin, /renderErrorLedger/);
assert.match(stats, /current_version_plate_cases:plateCases/, "stats must return error plate cases to Admin");
assert.ok(stats.includes("e?.metadata?.matriculaCapturada"), "error analytics must prefer the captured input field");
assert.ok(stats.includes('"Não capturada"'), "error analytics must include failed queries with no captured plate");
assert.ok(!stats.includes(".filter((e:any)=>validPortuguesePlate(e.matricula))"), "error plate list must not discard foreign or unrecognized captured inputs");
assert.match(endpoint, /if \(event !== "vehicle_insurance_error"\) \{[\s\S]*?delete metadata\.matriculaNormalizada;/, "no-record events must not retain plate metadata in the general event stream");
assert.match(endpoint, /insuranceNoCases\.push/, "valid no-record outcomes must enter the dedicated 90-day registry");
assert.match(admin, /O resultado, por si só, não confirma a ausência de seguro/, "no-record list must warn that no record alone is not proof");
assert.match(admin, /Um erro técnico não significa que o veículo não tenha seguro/, "error list must distinguish failures from insurance status");
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
for (const label of ["Incompletas","Contraditórias","Finais duplicados","Consultas iniciadas","Instalações ativas","Legislação copiada"]) assert.ok(admin.includes(label), "missing Admin label "+label);

assert.doesNotMatch(telemetrySource, /\b(?:APP_VERSION|appVersion|app_version)\s*[:=]\s*["\']1\.4(?:\.\d+)?["\']/i, "production runtime must not advertise the obsolete app version");
assert.ok(app.includes("<!-- VERIX_TELEMETRY_RUNTIME_INJECT -->"), "source HTML must have exactly one build-time telemetry marker");
assert.doesNotMatch(app, /<script[^>]*id=["']verix-telemetry-v2["']/i, "source HTML must not duplicate the telemetry implementation");
assert.match(telemetrySource, /var ENDPOINT = ['"]https:\/\/onilkakbgpklxvxuxmks\.supabase\.co\/functions\/v1\/telemetry-v2['"]/);
assert.doesNotMatch(telemetrySource, /\/functions\/v1\/telemetry(?!-v2)/, "supported code must never call the obsolete endpoint");
const telemetryStart = telemetrySource.indexOf("function parseReceipt(text)");
const telemetryEnd = telemetrySource.indexOf("function rateLimited", telemetryStart);
assert.ok(telemetryStart >= 0 && telemetryEnd > telemetryStart, "production telemetry client must expose its receipt pipeline");
const clientTransport = telemetrySource.slice(telemetryStart, telemetryEnd);
assert.match(clientTransport, /return parseReceipt\(await response\.text\(\)\)/);
assert.match(clientTransport, /queue = queue\.filter\(function \(item\)/);
assert.match(clientTransport, /!acknowledged\[item\.eventId\]/);
assert.match(clientTransport, /recordRejectedEvents\(batch, receipt\)/);
const beaconStart = telemetrySource.indexOf("function flushBeacon()", telemetryStart);
const beaconEnd = telemetrySource.indexOf("function rateLimited", beaconStart);
assert.ok(beaconStart >= 0 && beaconEnd > beaconStart, "sendBeacon handler must exist");
assert.doesNotMatch(telemetrySource.slice(beaconStart, beaconEnd), /queue\.splice\(/, "sendBeacon must never dequeue without a server receipt");
assert.ok(telemetrySource.includes("VERIX_T2_REJECTED_QUEUE"), "permanent rejections must have bounded non-sensitive local diagnostics");
assert.match(telemetrySource, /function cleanMetadata\(meta, event\)/, "client metadata sanitizer must know which event is being sent");
assert.match(telemetrySource, /function insurancePlateMetadata\(value, asfDiagnostic\)/, "insurance outcome wrappers must normalize the plate");
assert.match(telemetrySource, /push\('vehicle_insurance_no', 'consulta', meta\)/, "no-record event must include plate metadata");
assert.match(telemetrySource, /push\('vehicle_insurance_error', 'consulta', meta\)/, "ASF error event must include plate metadata");
assert.match(telemetrySource, /event === 'vehicle_insurance_no' \|\| event === 'vehicle_insurance_error'/, "plate metadata must be limited to no-record/error events");
assert.match(telemetrySource, /event === 'vehicle_insurance_no' \|\| event === 'vehicle_insurance_error'\) \{\s*flushNow\(\)/, "insurance outcome events must be flushed immediately");
assert.match(telemetrySource, /event === 'vehicle_lookup' \|\| queue\.length >= BATCH_SIZE\) \{\s*flush\(\)/, "lookup start events should use the shared 50ms debounce so pending events can join the batch");
assert.doesNotMatch(telemetrySource, /event === 'vehicle_lookup'[\s\S]{0,80}flushNow\(\)/, "lookup start must not launch a separate immediate telemetry request");


const scriptOpen = '<script id="verix-telemetry-v2">';
const scriptStart = builtApp.indexOf(scriptOpen);
const scriptEnd = builtApp.indexOf("</script>", scriptStart + scriptOpen.length);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "secure build must inject TypeScript telemetry into the portable app");
const telemetryScript = builtApp.slice(scriptStart + scriptOpen.length, scriptEnd);
assert.doesNotThrow(() => new Function(telemetryScript), "production telemetry script must parse as JavaScript");
assert.match(telemetryScript, /var HEARTBEAT_MS = 60000;/, "heartbeat cadence should reduce requests while remaining within the 90-second online lease");

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
const recentQueryPresenceMigration = fs.readFileSync("supabase/migrations/20261010222630_consulted_installations_last_3m.sql", "utf8");
const activeHourlyMigration = fs.readFileSync("supabase/migrations/20261013100000_hourly_usage_bucket_dates.sql", "utf8");
assert.match(endpoint, /"session_close"/, "server must accept browser-close presence events");
assert.match(telemetryScript, /push\('session_close', null\)/, "pagehide must emit a browser-close event");
assert.match(telemetryScript, /navigator\.sendBeacon\([\s\S]*events: \[closingEvent\]/, "browser-close event must be sent immediately through Beacon");
assert.match(presenceMigration, /'online_now',\(SELECT count\(\*\)/, "online_now must count sessions, not installations");
assert.match(presenceMigration, /last_presence >= p_now-interval '90 seconds'/, "online presence must expire after the heartbeat lease");
assert.match(presenceMigration, /event IN \('app_open','heartbeat','session_close'\)/, "online presence must use lifecycle events only");
assert.match(presenceMigration, /last_close IS NULL OR last_presence > last_close/, "a later close event must remove a session from the active count");
assert.ok(admin.includes("Consultas iniciadas · últimos 3 min"), "Admin must expose consultation-based activity over three minutes in a separately labelled rolling window");
assert.doesNotMatch(admin, /Atividade recente — janelas móveis|activityLiveCards/, "the Activity page must not repeat rolling metrics already presented on the Overview");
assert.ok(admin.includes("Aberturas da aplicação e heartbeats não contam como utilização"), "active-use metrics must explicitly exclude passive browser presence");
assert.ok(stats.includes('rpc("verix2_consulted_installations_3m",{p_now:now})'), "stats must request query-based online presence");
assert.ok(stats.includes("consulted_3m:recentConsulted3m"), "stats must return query-based online presence separately from browser sessions");
assert.ok(stats.includes('[2,"recent_query_presence"]'), "a failed recent-presence query must mark the dashboard as partial");
assert.ok(stats.includes('rpc("verix2_admin_hourly_active_interactions",{p_now:now})'), "stats must request hourly active-use data");
assert.ok(stats.includes("usage:{...usage,hourly}"), "hourly active-use data must be lazy-loaded with usage analytics");
assert.ok(stats.includes('hourlyAvailable:hourlyResult.status==="fulfilled"'), "the usage response must expose whether hourly data loaded successfully");
const activeEventsMatch = activeHourlyMigration.match(/active_use AS \([\s\S]*?AND e\.event IN \(([\s\S]*?)\n    \)\n  GROUP BY 1\n\)/);
assert.ok(activeEventsMatch, "hourly active-use migration must define an explicit interaction-event set");
assert.ok(!/['"]app_open['"]|['"]heartbeat['"]|['"]session_close['"]/.test(activeEventsMatch[1]), "hourly active-use must exclude passive lifecycle events");
assert.match(activeHourlyMigration, /'bucket_start', h\.bucket_start/, "each hourly metric must include its real timestamp");
assert.match(activeHourlyMigration, /date_trunc\('hour', e\.occurred_at AT TIME ZONE 'UTC'\) AT TIME ZONE 'UTC'/, "hourly counts must use chronological hour buckets rather than hour-of-day grouping");
assert.ok(admin.includes("function renderHourly("), "new Admin must render hourly data through one shared chart renderer");
assert.ok(admin.includes("r.consultations") && admin.includes("r.activeUsers"), "hourly chart must use consultation and active-installation counts");
assert.match(stats, /admin-simple-2026-10-14-r16/, "dashboard cache contract must support the latest Admin revision");
assert.match(recentQueryPresenceMigration, /count\(DISTINCT e\.installation_id\)/, "recent-query presence must count distinct installations");
assert.match(recentQueryPresenceMigration, /e\.event = 'vehicle_lookup'/, "recent-query presence must count actual consultation starts");
assert.match(recentQueryPresenceMigration, /e\.query_id IS NOT NULL/, "recent-query presence must ignore lookup events without a query ID");
assert.match(recentQueryPresenceMigration, /p_now - interval '3 minutes'/, "recent-query presence must use the requested three-minute window");
assert.match(recentQueryPresenceMigration, /SECURITY INVOKER/, "recent-query presence SQL function must not bypass caller privileges");
assert.match(recentQueryPresenceMigration, /REVOKE ALL ON FUNCTION public\.verix2_consulted_installations_3m\(timestamptz\)\s+FROM PUBLIC, anon, authenticated/, "recent-query metric must not be publicly executable");
assert.match(recentQueryPresenceMigration, /GRANT EXECUTE ON FUNCTION public\.verix2_consulted_installations_3m\(timestamptz\)\s+TO service_role/, "recent-query metric must be available to the server-side stats function");
assert.ok(errorPlateCountMigration.includes("count(DISTINCT e.query_id) qty"), "error plate totals must count unique consultation IDs");
assert.ok(errorPlateCountMigration.includes("count(*) event_qty"), "raw error event volume must remain visible separately");
assert.ok(errorPlateCountMigration.includes("^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$"), "error plate table must allow only complete Portuguese plate formats");
assert.ok(endpoint.includes("function sanitizeErrorPlateMetadata("), "server must sanitize invalid error plate fragments before persistence");
assert.ok(endpoint.includes('if (event === "vehicle_insurance_error") sanitizeErrorPlateMetadata(metadata);'), "server must apply plate validation to ASF error events");
assert.ok(admin.includes("Eventos de erro"), "Admin must distinguish raw error events from query-level errors");
assert.ok(stats.includes("queryIds:new Set<string>()"), "error time buckets must deduplicate repeated events by query ID");
assert.ok(stats.includes("event_count:b.events"), "error time buckets must expose raw event count separately");

assert.ok(stats.includes("error_queries_24h:new Set(rows.map"), "error total must count unique query IDs separately from event rows");
assert.ok(stats.includes("current_version_error_events:currentVersionRows.length"), "version errors must expose raw events separately from distinct queries");
assert.ok(stats.includes("latestErrorByQuery"), "error plate details must not repeat the same consultation");

assert.ok(stats.includes("function buildErrorPlateCases(rows:any[]"), "error plate details must use a separated all-version helper");
assert.ok(stats.includes("error_plate_cases_24h:buildErrorPlateCases(rows,plateOf,validPortuguesePlate,shortId)"), "stats must expose all-version error plate cases");
assert.ok(stats.includes("normalized.find((value:string)=>validPortuguesePlate(value))"), "plate extraction must prefer complete valid plates over partial fragments");
const errorCasesStart = stats.indexOf("function buildErrorPlateCases");
const errorCasesEnd = stats.indexOf("\nasync function loadErrorInvestigation24h", errorCasesStart);
assert.ok(errorCasesStart >= 0 && errorCasesEnd > errorCasesStart, "error-plate helper must be delimited");
const errorCasesSource = stats.slice(errorCasesStart, errorCasesEnd)
  .replace("function buildErrorPlateCases(rows:any[],plateOf:(e:any)=>string,validPortuguesePlate:(value:unknown)=>boolean,shortId:(value:any)=>string){", "function buildErrorPlateCases(rows,plateOf,validPortuguesePlate,shortId){")
  .replace("new Map<string,{event:any;matricula:string}>()", "new Map()");
const buildErrorPlateCases = vm.runInNewContext("(" + errorCasesSource + ")");
const plateValidatorStart = stats.indexOf("const validPortuguesePlate=(value:unknown)=>{");
const plateValidatorEnd = stats.indexOf("\n  const plateOf=", plateValidatorStart);
assert.ok(plateValidatorStart >= 0 && plateValidatorEnd > plateValidatorStart, "Admin error plate validator must be delimited");
const plateValidatorSource = stats.slice(plateValidatorStart, plateValidatorEnd)
  .replace("const validPortuguesePlate=(value:unknown)=>{", "(value)=>{")
  .replace("const plate=normalizePlate(value);", "const plate=String(value??\"\").toUpperCase().replace(/[^A-Z0-9]/g,\"\");")
  .replace(/;\\s*$/, "");
const isPortuguesePlate = vm.runInNewContext(plateValidatorSource);
for (const [plate, expected] of [
  ["AA1234", true], ["1234AB", true], ["12AB34", true],
  ["AB12CD", true], ["AA12AA", true],
  ["KW1234", false], ["12WY34", false],
  ["AB00CD", false], ["AB12CA", false]
]) {
  assert.equal(isPortuguesePlate(plate), expected, "Portuguese plate validation: " + plate);
}
const fixturePlateOf = e => {
  const candidates = [e?.metadata?.matriculaCapturada, e?.metadata?.asfDiagnostic?.matricula, e?.metadata?.matriculaNormalizada, e?.metadata?.matricula];
  const normalized = candidates.map(value => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 30)).filter(value => value.length > 0);
  return normalized.find(isPortuguesePlate) || normalized[0] || "";
};
const errorPlateFixtures = [
  { event_id:"valid-old", query_id:"query-one", occurred_at:"2026-10-14T10:00:00.000Z", app_version:"1.4", browser:"Chrome", metadata:{matricula:"AA-12-34",asfDiagnostic:{asfErrorType:"network",asfHttpStatus:504,asfMessage:"timeout"}} },
  { event_id:"partial-retry", query_id:"query-one", occurred_at:"2026-10-14T10:01:00.000Z", app_version:"1.5", browser:"Edge", metadata:{matricula:"O"} },
  { event_id:"legacy-valid", query_id:"query-two", occurred_at:"2026-10-14T10:02:00.000Z", app_version:"1.3", browser:"Chrome", metadata:{matricula:"1234-AA",asfDiagnostic:{asfErrorType:"http_500",asfHttpStatus:500}} }
];
const allVersionPlateCases = buildErrorPlateCases(errorPlateFixtures, fixturePlateOf, isPortuguesePlate, value => String(value || ""));
assert.equal(allVersionPlateCases.length, 2, "all versions are included and incomplete retries do not hide valid plates");
assert.ok(allVersionPlateCases.some(item => item.query_id === "query-one" && item.matricula === "AA1234" && item.app_version === "1.4"), "a later incomplete retry must preserve the valid earlier plate");
assert.ok(allVersionPlateCases.some(item => item.query_id === "query-two" && item.app_version === "1.3"), "valid error plates from older versions must remain visible");
assert.ok(admin.includes("detail=error-ledger-v3"), "Admin consumes paginated all-version technical error details");
assert.ok(admin.includes("error-record-summary") && admin.includes("error-record-body"), "error records must be collapsed until their plate summary is selected");
assert.ok(admin.includes('id="refreshBtn"'), "Admin exposes a manual refresh");
assert.ok(admin.includes("errorCountTag"), "Admin shows the count of returned error events");

assert.ok(stats.includes('qs.set("offset",String(page*pageSize))'), "error investigation must page through all raw telemetry instead of truncating at 1,000 rows");
assert.ok(stats.includes("validPortuguesePlate"), "error plate diagnostics must use complete Portuguese plate formats");
assert.ok(endpoint.includes("^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}"), "server must reject incomplete and malformed plate fragments");



const hourlyMigration = fs.readFileSync("supabase/migrations/20261009051204_hourly_consultations_and_presence.sql", "utf8");
assert.match(hourlyMigration, /generate_series\(0,23\)/, "hourly chart must include all 24 hours, including zero-activity hours");
assert.match(hourlyMigration, /count\(DISTINCT e\.query_id\) FILTER/, "hourly consultation count must deduplicate query IDs");
assert.match(hourlyMigration, /e\.event='vehicle_lookup'/, "hourly consultations must count actual lookup starts");
assert.match(hourlyMigration, /count\(DISTINCT e\.installation_id\) FILTER/, "hourly presence must count distinct installations");
assert.match(hourlyMigration, /e\.event IN \('app_open','heartbeat'\)/, "hourly presence must use app-open/heartbeat events");
assert.ok(admin.includes("<h2>Atividade por hora</h2>") && admin.includes("consultationLabel.textContent=String(consultationValue)"), "dashboard chart must show exact consultation values next to the bars without hover");
assert.match(admin, /hour-values span\{display:block/);
assert.match(admin, /grid-template-rows:23px 72px 15px/, "responsive chart layout must reserve space for visible values, bars and hour labels");
assert.match(admin, /<details class="hourly-values">\s*<summary>Ver tabela com os valores exatos<\/summary>/, "the full hourly table must be available in a collapsed expander");
const hourlyPanelStart = admin.indexOf('id="activityHourlyPanel"');
const hourlyPanel = hourlyPanelStart >= 0 ? admin.slice(hourlyPanelStart, hourlyPanelStart + 5000) : "";
assert.match(hourlyPanel, /<details class="hourly-values">\s*<summary>Ver tabela com os valores exatos<\/summary>/, "the hourly detail table must stay collapsed even while daily exact-value tables are open");
assert.match(admin, /<details class="hourly-values" open>\s*<summary>Valores diários de pesquisas e utilizadores<\/summary>/, "the daily usage table must open by default so exact values are immediately visible");
assert.ok(admin.includes("Distribuição horária de hoje"), "usage page must identify its chart as today-only");
assert.match(admin, /#overviewLiveCards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "recent live metrics must not leave half the card row blank");
assert.match(admin, /\.main-area\{min-width:0;padding:17px/, "Admin overview must use condensed vertical spacing");
assert.match(admin, /\.base-info\{margin:-4px 0 16px;padding:0;border:0;background:transparent/, "registered installation total must be a compact note, not a full-width card");
assert.match(admin, /id="aggregateUpdatedAt"/, "the selected-period header must show when cached historical metrics were calculated");
assert.match(admin, /aggregateFreshness\.textContent='Dados históricos até '\+prettyDate/, "the visible freshness label must use the payload generation timestamp");
assert.doesNotMatch(admin, /id="lastUpdated"|\$\('lastUpdated'\)/, "the old duplicate timestamp at the bottom of the page must be removed");
assert.match(adminV3Migration, /count\(DISTINCT e\.query_id\)/, "the backend contract must deduplicate consultations by query ID");
assert.ok(admin.includes("activeUsers"), "hourly chart must use the active-installation count");

assert.ok(telemetrySource.includes("function cinTelemetrySnapshot()"), "Cinemometer telemetry must construct a structured snapshot");
assert.ok(telemetrySource.includes("out.cin = {"), "client metadata sanitizer must retain the Cinemometer snapshot");
assert.match(telemetrySource, /push\('cinemometer_speed_entry', 'cinemometro', \{ cin: snapshot \}\)/, "speed entries must include structured measurement metadata");
assert.match(telemetrySource, /push\('cinemometer_calculation', 'cinemometro', \{ cin: snapshot \}\)/, "calculations must include structured measurement metadata");
const snapshotStart = telemetrySource.indexOf("function cinTelemetrySnapshot()");
const snapshotEnd = telemetrySource.indexOf("\n  function insurancePlateMetadata", snapshotStart);
assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart, "Cinemometer snapshot helper must be delimited");
const snapshot = telemetrySource.slice(snapshotStart, snapshotEnd);
assert.doesNotMatch(snapshot, /cinSessaoOperadorNome|cinSessaoOperadorNo|cinSessaoOperadorPosto|cinMarca|cinModelo|cinSerie|cinLocalidade|cinDistrito|cinVia|cinSentido|cinKm/, "telemetry snapshot must not collect operator identifiers, apparatus serials, or exact locations");


// V3 Admin regression contract: period semantics, safe data visibility, and the new metrics API.
assert.match(adminV3Migration, /verix2_admin_dashboard_v3_compute/);
assert.match(adminV3ErrorJoinMigration, /error_event_rows AS \([\s\S]*?LEFT JOIN meta_ev e ON e\.event = 'vehicle_insurance_error'\s+AND e\.occurred_at >= p\.start_at AND e\.occurred_at < p\.end_at/, "Admin V3 error summaries must filter to error events before joining period aggregates");
assert.doesNotMatch(adminV3ErrorJoinMigration, /error_event_rows AS \([\s\S]*?LEFT JOIN ev e ON e\.occurred_at >= p\.start_at/, "Admin V3 error summaries must not join every telemetry event for an error-only aggregate");
assert.match(adminV3Migration, /verix2_admin_dashboard_v3\(/);
assert.match(adminV3Migration, /verix2_admin_error_ledger_v3/);
assert.match(adminV3Migration, /interval '365 days'/, "history retention must support the yearly window");
assert.match(adminV3Migration, /interval '24 hours'/, "new no-record plate details must have a 24-hour retention");
assert.doesNotMatch(adminV3Migration, /DELETE FROM public\.verix_insurance_no_cases|TRUNCATE/i, "migration must not directly delete or truncate plate records");
assert.match(adminV3Migration, /ALTER COLUMN expires_at SET DEFAULT \(now\(\) \+ interval '24 hours'\)/, "new plate details must expire after 24 hours");
assert.doesNotMatch(adminV3Migration, /UPDATE public\.verix_insurance_no_cases/i, "existing plate details must not be rewritten");
assert.doesNotMatch(adminV3Migration, /DELETE FROM public\.verix2_events|TRUNCATE TABLE public\.verix2_events/i, "migration must preserve all raw telemetry events");
assert.match(adminV3Migration, /verix2_admin_live_activity_v3/, "three-minute active consultations must be computed separately from the cached dashboard");
assert.match(adminV3Migration, /meta_ev AS MATERIALIZED/, "large client/forensics JSON must be excluded from the main dashboard activity CTE");
assert.match(adminV3Migration, /AND e\.event IN \('vehicle_insurance_error', 'legislation_copy'\)/, "only error and legislation-copy rows should carry event metadata in the aggregate query");
assert.match(adminV3Migration, /schedule := '\*\/5 \* \* \* \*'/, "shared dashboard refresh must run every five minutes, not every minute");
assert.match(adminV3Migration, /interval '6 minutes'/, "cached metrics must remain available between scheduled refreshes");
assert.match(adminV3Migration, /WHERE a\.ordinality <= 8/, "the error ledger must cap diagnostic attempt details");
assert.match(adminV3Migration, /'message', left\(a\.value->>'message', 300\)/, "error messages must be length-bounded");
assert.doesNotMatch(adminV3Migration, /'rawResponse'\s*,|'requestBody'\s*,|'requestHeaders'\s*,|'callerStack'\s*,/, "the detailed error API must not expose raw requests, headers, or call stacks");
assert.match(stats, /detail === "dashboard-v3"/);
assert.match(stats, /detail === "error-ledger-v3"/);
assert.ok(stats.includes('qs.set("created_at","gte."+new Date(Date.parse(now)-24*60*60*1000).toISOString());'), "no-record visibility window must be based on server receipt time");
const adminInlineScript = admin.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(adminInlineScript, "new Admin must have one executable script block");
assert.doesNotThrow(() => new Function(adminInlineScript[1]), "new Admin JavaScript must parse");
assert.ok(admin.includes("Um erro técnico não significa que o veículo não tenha seguro"), "error view must distinguish a technical failure from insurance status");
assert.ok(admin.includes("desde o reset da versão estável") && admin.includes('id="historyResetPoint"'), "the total period must disclose the stable reset point");
assert.ok(adminHistoryResetMigration.includes("SELECT reset_all_at FROM public.verix2_admin_dashboard_cache WHERE singleton = true"), "total history must read its saved reset timestamp");
assert.ok(adminHistoryResetMigration.includes("AS total_start"), "dashboard total metrics must use the reset timestamp as their lower bound");
assert.ok(adminHistoryResetMigration.includes("ELSE coalesce((SELECT reset_all_at FROM public.verix2_admin_dashboard_cache"), "the paginated error ledger must use the same reset timestamp");
assert.ok(adminV3TotalResetMigration.includes("(SELECT reset_all_at FROM public.verix2_admin_dashboard_cache WHERE singleton = true)") && adminV3TotalResetMigration.includes(") AS total_start"), "the latest Admin V3 aggregate must use the saved reset timestamp instead of a rolling year as the total-history boundary");
assert.ok(adminV3TotalResetMigration.includes("ranges,total,start"), "the total-history migration must validate the effective start boundary");
assert.match(adminV3RecoverLegacyConsultationsMigration, /query_start_candidates AS[\s\S]*?event = 'vehicle_insurance_pending'[\s\S]*?NOT EXISTS[\s\S]*?l\.event = 'vehicle_lookup'/, "historic pending IDs are recovered only when no lookup exists anywhere");
assert.match(adminV3RecoverLegacyConsultationsMigration, /insurance,total,consultations/, "legacy consultation recovery must validate the actual Admin total");
assert.doesNotMatch(adminV3RecoverLegacyConsultationsMigration, /DELETE FROM public\.verix2_events|TRUNCATE TABLE public\.verix2_events/i, "legacy consultation recovery must preserve raw telemetry");
assert.ok(adminV3RestoreInputClassificationMigration.includes("error_candidate_rows AS MATERIALIZED") && adminV3RestoreInputClassificationMigration.includes("error_classified AS MATERIALIZED"), "Admin error counters must explicitly classify invalid plate input");
assert.ok(adminV3RestoreInputClassificationMigration.includes("AND NOT q.user_input_invalid") && adminV3RestoreInputClassificationMigration.includes("'userInputInvalidConsultations'"), "invalid-format HTTP 400 consultations must be excluded from technical-error counts and reported separately");
assert.ok(adminV3RestoreInputClassificationMigration.includes("SET work_mem TO '64MB'") === false, "dynamic restoration must preserve the existing live function rather than hard-code a separate query implementation");
assert.ok(adminV3RestoreInputClassificationMigration.includes("query_start_candidates") === false, "error classification patch must not replace the existing history-start logic");


assert.match(adminErrorClassificationMigration, /verix2_admin_plate_format_valid/, "admin error classification must validate Portuguese plate formats");
assert.ok(adminErrorClassificationMigration.includes("v = 'AA00AA'"), "the filter must exclude only the reserved first current-format combination, not all 00 center blocks");
assert.ok(adminErrorClassificationMigration.includes("c.error_type = 'http_400'") && adminErrorClassificationMigration.includes("c.http_status_raw = '400'"), "only explicit HTTP 400 events qualify for the invalid-input exclusion");
assert.ok(adminErrorClassificationMigration.includes("c.has_plate_input") && adminErrorClassificationMigration.includes("NOT c.has_valid_plate_format"), "the filter must require a captured but malformed plate");
assert.ok(adminErrorClassificationMigration.includes("'userInputInvalidConsultations'") && adminErrorClassificationMigration.includes("'excludedUserInputConsultations'"), "invalid user input counts must remain visible separately");
assert.ok(admin.includes("Formato PT não reconhecido (excluído)") && admin.includes("erros técnicos"), "the Admin must present the distinction between unrecognized Portuguese plate formats and technical errors");

console.log("PASS: telemetry integrity, Admin V3 period and error contracts, and frontend JavaScript syntax.");


// Regression contract for the dashboard aggregation optimization.

assert.match(overviewOptimizationMigration, /overview_counts AS MATERIALIZED/, "fast dashboard must aggregate headline metrics in a shared pass");
assert.match(overviewOptimizationMigration, /count\(DISTINCT e\.installation_id\) FILTER \(WHERE e\.occurred_at >= b\.s24\) AS unique_24h/, "24-hour active installations must preserve the existing rolling boundary");
assert.match(overviewOptimizationMigration, /count\(DISTINCT e\.installation_id\) FILTER \(WHERE e\.occurred_at >= b\.s7\) AS unique_7d/, "7-day active installations must preserve the existing rolling boundary");
assert.match(overviewOptimizationMigration, /count\(\*\) FILTER \(WHERE e\.occurred_at >= b\.s24\) AS events_24h/, "24-hour event totals must use the same cutoff");
assert.match(overviewOptimizationMigration, /count\(\*\) FILTER \(WHERE e\.occurred_at >= b\.s7\) AS events_7d/, "7-day event totals must use the same cutoff");
assert.match(overviewOptimizationMigration, /UNION SELECT installation_id FROM public\.verix2_events\s+WHERE occurred_at>=p_now-interval '10 minutes' AND occurred_at>=\(SELECT s30 FROM b\) AND occurred_at<p_now/, "recent activity must use the time index and preserve the all-time reset boundary");
assert.match(overviewOptimizationMigration, /SET search_path TO 'public', 'pg_catalog'/, "optimized security-definer function must retain a pinned search_path");
assert.match(overviewOptimizationMigration, /SET work_mem TO '64MB'/, "optimized fast dashboard must retain its reviewed work_mem setting");
assert.doesNotMatch(overviewOptimizationMigration, /ALTER TABLE|DROP TABLE|TRUNCATE|DELETE FROM/i, "dashboard optimization must not mutate telemetry rows or schema");
