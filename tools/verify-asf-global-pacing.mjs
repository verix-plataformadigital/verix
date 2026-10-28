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

// One temporary, synthetic-input probe, executed only in GitHub Actions. This invokes
// a test-only Supabase function that sends exactly two requests to ASF from Supabase:
// current encodeURIComponent serialization vs the raw URL string passed by the APK.
// The diagnostic response excludes the synthetic input and all insurance/policy data.
if (process.env.GITHUB_ACTIONS === 'true') {
  const endpoint = 'https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/asf-url-encoding-ab-20261028?k=9d428f6b7b4b02f08f0e6f2d6e8a411e7f8c663c1d5b4e9a';
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(30000) });
  const body = await response.text();
  assert.equal(response.status, 200, `Live ASF serialization probe failed: HTTP ${response.status}`);
  const report = JSON.parse(body);
  assert.equal(report.requestCount, 2, 'Probe must send exactly two upstream requests');
  assert.equal(report.results?.length, 2, 'Probe must return both serialization variants');
  console.log('LIVE_ASF_URL_SERIALIZATION_AB=' + JSON.stringify(report));
}
