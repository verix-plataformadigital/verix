import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const app = readFileSync('verix-app.html', 'utf8');
const cleanup = readFileSync('supabase/migrations/20261027192500_remove_asf_global_pacing_queue.sql', 'utf8');

// Preserve the production no-queue contract checks. This branch is diagnostic only.
assert.doesNotMatch(proxy, /reservarLugarASF|verix_asf_reserve_slot|ASF_GLOBAL_INTERVAL_MS/);
assert.match(proxy, /const url = ASF_ORIGIN \+ ASF_PATH \+ "\?query=" \+ encodeURIComponent\(query\)/);
assert.match(proxy, /method: "POST"/);
assert.match(app, /const ASF_TIMEOUT_MS = 15000;/);
assert.doesNotMatch(app, /const ASF_TIMEOUT_MS = 148000/);
assert.doesNotMatch(app, /if \(type === 'asf_pacing_queue_busy'\) return true/);
assert.match(cleanup, /DROP FUNCTION IF EXISTS public\.verix_asf_reserve_slot\(integer, integer\)/);
assert.match(cleanup, /DROP TABLE IF EXISTS public\.verix_asf_pacing_state/);
console.log('ASF no-queue contract passed.');

function sanitizeMessage(value, plate) {
  return String(value ?? 'unknown')
    .replaceAll(plate, '[TEST_PLATE]')
    .replace(/[A-Z0-9]{6,8}/g, '[IDENTIFIER]')
    .slice(0, 180);
}
async function queryDirect(plate, index) {
  const date = '2026/10/28';
  const query = 'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
    plate + '", date: "' + date +
    '") { nodes { id entity startDate endDate policy license code logo } } } } } }';
  const started = Date.now();
  try {
    const response = await fetch('https://ext01.asf.com.pt/api/src/?query=' + encodeURIComponent(query), {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },
      body: null,
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });
    const raw = await response.text();
    let errors = [];
    let dataPresent = false;
    let nodesCount = null;
    try {
      const parsed = JSON.parse(raw);
      errors = Array.isArray(parsed?.errors) ? parsed.errors.slice(0, 2).map(e => ({
        message: sanitizeMessage(e?.message, plate),
        path: Array.isArray(e?.path) ? e.path.slice(0, 8) : null,
        code: String(e?.extensions?.code ?? e?.code ?? '').slice(0, 60) || null
      })) : [];
      dataPresent = Object.prototype.hasOwnProperty.call(parsed ?? {}, 'data');
      const nodes = parsed?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
      nodesCount = Array.isArray(nodes) ? nodes.length : null;
    } catch {}
    return {
      sequence: index, source: 'github-runner-direct', httpStatus: response.status,
      elapsedMs: Date.now() - started, graphqlErrorCount: errors.length,
      errors, dataPresent, nodesCount, retryAfter: response.headers.get('retry-after')
    };
  } catch (e) {
    return { sequence: index, source: 'github-runner-direct', elapsedMs: Date.now() - started,
      networkError: String(e instanceof Error ? e.message : e).slice(0, 180) };
  }
}

async function querySupabase(index, sequence) {
  const url = 'https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/asf-egress-scope-probe-20261028' +
    '?token=egress-scope-28oct26-4d91b8c07e3f6a2c71d5&index=' + index;
  const started = Date.now();
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) });
    const raw = await response.text();
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch {}
    return { ...parsed, sequence, source: 'supabase-edge', relayHttpStatus: response.status,
      relayElapsedMs: Date.now() - started };
  } catch (e) {
    return { sequence, source: 'supabase-edge', relayElapsedMs: Date.now() - started,
      relayError: String(e instanceof Error ? e.message : e).slice(0, 180) };
  }
}

// Cross-egress discriminator: alternate five unique synthetic registrations from
// GitHub's runner and five from Supabase. If the threshold is global, the sixth
// combined call should normally fail; if it is per-egress bucket, each source
// should get five calls. Stop on first upstream error; never log raw response/policy data.
if (process.env.GITHUB_ACTIONS === 'true') {
  const directPlates = ['UU44UU', 'TT33TT', 'SS22SS', 'RR11RR', 'QQ00QQ'];
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await queryDirect(directPlates[i], results.length + 1));
    const direct = results[results.length - 1];
    if (direct.networkError || direct.httpStatus === 429 || direct.httpStatus >= 500 || direct.graphqlErrorCount > 0) break;
    results.push(await querySupabase(i + 1, results.length + 1));
    const proxy = results[results.length - 1];
    if (proxy.relayError || proxy.relayHttpStatus !== 200 || proxy.graphqlErrorCount > 0) break;
  }
  console.log('LIVE_ASF_CROSS_EGRESS_DIAGNOSTIC=' + JSON.stringify({
    maxRequests: 10, actualRequests: results.length, syntheticInputsOnly: true,
    alternatingSources: true, stopAtFirstFailure: true, results
  }));
}