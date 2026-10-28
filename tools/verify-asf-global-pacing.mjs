import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const app = readFileSync('verix-app.html', 'utf8');
const cleanup = readFileSync('supabase/migrations/20261027192500_remove_asf_global_pacing_queue.sql', 'utf8');

// The ASF relay must forward directly instead of placing requests in a long queue.
assert.doesNotMatch(proxy, /reservarLugarASF|verix_asf_reserve_slot|ASF_GLOBAL_INTERVAL_MS/);
assert.match(proxy, /const url = ASF_ORIGIN \+ ASF_PATH \+ "\?query=" \+ encodeURIComponent\(query\)/);
assert.match(proxy, /method: "POST"/);

// A client timeout must not be extended to the former 130 s queue window.
assert.match(app, /const ASF_TIMEOUT_MS = 15000;/);
assert.doesNotMatch(app, /const ASF_TIMEOUT_MS = 148000/);
assert.doesNotMatch(app, /if \(type === 'asf_pacing_queue_busy'\) return true/);

// Remove the database scheduler created by the temporary queue experiment.
assert.match(cleanup, /DROP FUNCTION IF EXISTS public\.verix_asf_reserve_slot\(integer, integer\)/);
assert.match(cleanup, /DROP TABLE IF EXISTS public\.verix_asf_pacing_state/);

console.log('ASF no-queue contract passed.');

// A bounded, one-shot reproduction, executed only in GitHub Actions. The temporary
// Supabase function uses a synthetic plate, sends the same request sequentially, and
// stops immediately after the first upstream failure (maximum eight requests).
// It returns sanitized status/GraphQL diagnostics only, never raw insurance data.
if (process.env.GITHUB_ACTIONS === 'true') {
  const endpoint = 'https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/asf-url-encoding-ab-20261028?k=9d428f6b7b4b02f08f0e6f2d6e8a411e7f8c663c1d5b4e9a';
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(30000) });
  const body = await response.text();
  assert.equal(response.status, 200, `Live ASF reproduction failed: HTTP ${response.status}`);
  const report = JSON.parse(body);
  assert.ok(report.requestCount >= 1 && report.requestCount <= 8, 'Probe must be bounded to 1–8 requests');
  assert.equal(report.results?.length, report.requestCount, 'Result count must match actual upstream requests');
  console.log('LIVE_ASF_SEQUENTIAL_REPRODUCTION=' + JSON.stringify(report));
}
