import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261009025000_telemetry_pipeline_rebuild.sql");
const ingest = read("../supabase/functions/telemetry-v2/index.ts");
const stats = read("../supabase/functions/stats-v2/index.ts");
const admin = read("../admin_v2.html");

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.verix2_ingest_events\(p_events jsonb\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.verix2_telemetry_metrics_v3\(p_now timestamptz DEFAULT now\(\)\)/);
assert.match(migration, /p_now - interval ''7 days'' AS s7/);
assert.match(migration, /p_now - interval ''30 days'' AS s30/);
assert.match(migration, /terminal_rollup AS/);
assert.match(migration, /query_finals AS/);
assert.match(migration, /speed_measurements AS/);
assert.match(migration, /coverage_by_version/);
assert.match(migration, /orphan_terminal_queries_30d/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.verix2_ingest_events\(jsonb\) TO service_role/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.verix2_telemetry_metrics_v3\(timestamptz\) TO service_role/);

assert.match(ingest, /db\.rpc\("verix2_ingest_events"/);
assert.doesNotMatch(ingest, /db\.from\("verix2_events"\)\.upsert/);
assert.doesNotMatch(ingest, /db\.from\("verix2_installations"\)\.upsert/);
assert.doesNotMatch(ingest, /db\.from\("verix2_sessions"\)\.upsert/);
assert.match(stats, /rpc\("verix2_telemetry_metrics_v3"/);
assert.match(stats, /canonicalSpeedMeasurements\(events\)/);
assert.match(stats, /summarizeErrorRows\(rows,totalCount\)/);
assert.match(admin, /coverage_by_version/);
assert.match(admin, /sampled/);
assert.doesNotMatch(admin, /app14_/);

console.log("Telemetry contract checks passed.");
