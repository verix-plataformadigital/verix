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
const beaconStart = app.indexOf("function flushBeacon()", telemetryEnd);
const beaconEnd = app.indexOf("function rateLimited", beaconStart);
assert.ok(beaconStart >= 0 && beaconEnd > beaconStart, "sendBeacon handler must exist");
assert.doesNotMatch(app.slice(beaconStart, beaconEnd), /queue\.splice\(/, "sendBeacon must never dequeue without a server receipt");
assert.ok(app.includes("VERIX_T2_REJECTED_QUEUE"), "permanent rejections must have bounded non-sensitive local diagnostics");

console.log("PASS: atomic ingest receipt, ID-based client acknowledgement, loss-safe beacon queue, query-quality metrics and Admin labels.");
