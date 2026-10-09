import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('verix-app.html');
const admin = read('admin_v2.html');
const ingest = read('supabase/functions/telemetry-v2/index.ts');
const stats = read('supabase/functions/stats-v2/index.ts');
const migration = read('supabase/migrations/20261009113000_rebuild_telemetry_metrics_and_atomic_ingest.sql');

const telemetryMatch = app.match(/<script id="verix-telemetry-v2">([\s\S]*?)<\/script>/);
assert.ok(telemetryMatch, 'embedded VÉRIX telemetry script exists');
const telemetry = telemetryMatch[1];
new vm.Script(telemetry, { filename: 'verix-telemetry-v2.js' });

const inlineScripts = [...admin.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
assert.ok(inlineScripts.length > 0, 'Admin has executable inline JavaScript');
inlineScripts.forEach((script, i) => new vm.Script(script, { filename: 'admin-inline-' + i + '.js' }));

const ackStart = telemetry.indexOf('  function parseAcknowledgement(');
const ackEnd = telemetry.indexOf('\n\n  function recordAcknowledgement', ackStart);
assert.ok(ackStart >= 0 && ackEnd > ackStart, 'acknowledgement parser can be isolated');
const parseSource = telemetry.slice(ackStart, ackEnd).trim();
const parseAcknowledgement = vm.runInNewContext('(' + parseSource + ')');

const fullAck = parseAcknowledgement(200, JSON.stringify({ ok: true, accepted: 3, rejected: 0 }), 3);
assert.equal(fullAck.ok, true);
assert.equal(fullAck.accepted, 3);
assert.equal(fullAck.rejected, 0);
assert.equal(parseAcknowledgement(200, JSON.stringify({ ok: true, accepted: 2, rejected: 1 }), 3).rejected, 1);
assert.equal(parseAcknowledgement(200, JSON.stringify({ ok: true, accepted: 1, rejected: 0 }), 3), false,
  'a partial/unaccounted HTTP 200 cannot clear the queue');
assert.equal(parseAcknowledgement(500, JSON.stringify({ ok: true, accepted: 3, rejected: 0 }), 3), false);
assert.equal(parseAcknowledgement(200, 'not json', 3), false);

const beaconStart = telemetry.indexOf('  function flushBeacon()');
const beaconEnd = telemetry.indexOf('\n\n  function rateLimited', beaconStart);
assert.ok(beaconStart >= 0 && beaconEnd > beaconStart, 'beacon handler exists');
const beaconBody = telemetry.slice(beaconStart, beaconEnd);
assert.ok(!beaconBody.includes('queue.splice'), 'sendBeacon cannot discard unacknowledged queue items');
assert.ok(beaconBody.includes('Keep the durable queue'), 'beacon replay is explicitly documented');

assert.ok(ingest.includes('db.rpc(\n      "verix2_ingest_telemetry"'), 'ingest uses atomic database RPC');
assert.ok(ingest.includes('accepted: validEventCount'), 'acknowledgement includes all valid envelopes');
assert.ok(ingest.includes('inserted,') && ingest.includes('duplicates:'), 'inserted rows and duplicates are distinct');
assert.ok(ingest.includes('"imt_navigation_start","imt_navigation_loaded","imt_navigation_error"'), 'IMT navigation lifecycle events are allowlisted');
assert.ok(ingest.includes('out.navigationOutcome') && ingest.includes('out.durationMs'), 'navigation outcome and duration survive server sanitization');
assert.ok(ingest.includes('["inspecao", "livrete"].includes'), 'IMT sources are validated');
assert.ok(ingest.includes('clientTime > receivedAt.getTime()'), 'future client timestamps are clamped');
assert.ok(!ingest.includes('ts < now - 24 * 60 * 60 * 1000'), 'offline lookup starts are not selectively dropped by age');

assert.ok(stats.includes('rpc("verix2_error_investigation"'), 'error investigation uses complete SQL aggregation');
assert.ok(stats.includes('p_app_version: "1.5"'), 'error investigation targets active app version 1.5');
assert.ok(migration.includes("'app15_errors',(SELECT count(*) FROM err)"), 'version-specific error event count is SQL-aggregated');

assert.ok(migration.includes("WHERE event='vehicle_lookup' AND query_id IS NOT NULL"), 'query cohort starts only at lookup-start events');
assert.ok(migration.includes("'conflicting_final'"), 'contradictory terminal outcomes have an explicit state');
assert.ok(migration.includes("'query_events_missing_id_30d'"), 'missing query identifiers are measured');
assert.ok(migration.includes("'query_outcomes_without_start_30d'"), 'orphan lifecycle events are measured');
assert.ok(migration.includes("'imt_navigation_by_source_30d'"), 'IMT navigation is grouped by source');
assert.ok(migration.includes("'imt_navigation_errors_30d'"), 'IMT navigation failures are measured');
assert.ok(app.includes("imt_navigation_loaded") && app.includes("cross_origin_unverified"), 'cross-origin IMT navigation is labelled unverified');
assert.ok(!app.includes("Uma matrícula pesquisada = 1 resultado IMT"), 'query submission is not falsely reported as an IMT result');
assert.ok(migration.includes("'actions_30d',count(*) FILTER(WHERE event<>'heartbeat')"), 'activity excludes presence heartbeats');
assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry'), 'atomic transaction function exists');

assert.ok(!admin.includes('app14_errors') && !admin.includes('latest_app14'), 'Admin does not read obsolete app 1.4 diagnostics');
assert.ok(admin.includes('INSTALAÇÕES NO PERÍODO'), 'Admin labels installation counts accurately');
assert.ok(admin.includes('EVENTOS BRUTOS'), 'Admin distinguishes raw errors from query counts');
assert.ok(admin.includes('query_outcomes_without_start_30d'), 'Admin surfaces telemetry data quality');

console.log('Telemetry reconstruction checks passed: syntax (client/Admin), ack contract, queue safety, atomic ingest wiring, version alignment, metric labels and data-quality counters.');
