import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261027190000_asf_global_pacing_queue.sql', 'utf8');
const app = readFileSync('verix-app.html', 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.verix_asf_pacing_state/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.verix_asf_reserve_slot/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.verix_asf_reserve_slot\(integer, integer\) FROM PUBLIC, anon, authenticated/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.verix_asf_reserve_slot\(integer, integer\) TO service_role/);
assert.match(migration, /12200/);
assert.match(proxy, /await reservarLugarASF\(\)/);
assert.match(proxy, /await esperarASF\(queueWaitMs\)/);
assert.match(proxy, /asf_pacing_queue_busy/);
assert.match(proxy, /X-Verix-ASF-Queue-Wait-Ms/);
assert.match(proxy, /method: "POST"[\s\S]*?body: null/);
assert.match(app, /const ASF_TIMEOUT_MS = 148000;/);
assert.match(app, /tentativa\.errorType === 'graphql_service_unavailable' && tentativaNo >= 2/);
assert.match(app, /asf_pacing_queue_busy/);
console.log('ASF global pacing contract: OK');
