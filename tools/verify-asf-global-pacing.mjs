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
