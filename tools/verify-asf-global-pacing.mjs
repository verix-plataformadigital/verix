import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const app = readFileSync('verix-app.html', 'utf8');
const cleanup = readFileSync('supabase/migrations/20261027192500_remove_asf_global_pacing_queue.sql', 'utf8');

assert.doesNotMatch(proxy, /reservarLugarASF|verix_asf_reserve_slot|ASF_GLOBAL_INTERVAL_MS/);
assert.ok(proxy.includes('const url = ASF_ORIGIN + ASF_PATH + "?query=" + encodeURIComponent(query)'));
assert.match(proxy, /method: "POST"/);
assert.match(app, /const ASF_TIMEOUT_MS = 15000;/);
assert.doesNotMatch(app, /const ASF_TIMEOUT_MS = 148000/);
assert.ok(!app.includes("if (type === 'asf_pacing_queue_busy') return true"));
assert.ok(cleanup.includes("DROP FUNCTION IF EXISTS public.verix_asf_reserve_slot(integer, integer)"));
assert.ok(cleanup.includes("DROP TABLE IF EXISTS public.verix_asf_pacing_state"));
console.log('ASF no-queue contract passed.');

// Cadence control: six DIFFERENT synthetic registrations from this GitHub
// runner. Same method, query shape, headers, pacing; stop at first upstream error.
// Only sanitized status and GraphQL diagnostics are printed; no raw payload or plate.
if (process.env.GITHUB_ACTIONS === 'true') {
  const endpoint = 'https://ext01.asf.com.pt/api/src/?query=';
  const plates = ['ZZ99ZZ', 'YY88YY', 'XX77XX', 'WW66WW', 'VV55VV', 'UU44UU'];
  const date = '2026/10/28';
  const results = [];
  for (let index = 0; index < plates.length; index++) {
    const plate = plates[index];
    const query = 'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
      plate + '", date: "' + date +
      '") { nodes { id entity startDate endDate policy license code logo } } } } } }';
    const url = endpoint + encodeURIComponent(query);
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        body: null,
        redirect: 'follow',
        signal: AbortSignal.timeout(12000)
      });
      const raw = await response.text();
      let bodyKind = 'non_json';
      let errors = [];
      let dataPresent = false;
      let nodesCount = null;
      try {
        const parsed = JSON.parse(raw);
        bodyKind = 'json';
        errors = Array.isArray(parsed?.errors) ? parsed.errors.slice(0, 3).map(error => ({
          message: String(error?.message ?? 'unknown').slice(0, 180)
            .replaceAll(plate, '[TEST_PLATE]')
            .replace(/[A-Z0-9]{6,8}/g, '[IDENTIFIER]'),
          code: String(error?.extensions?.code ?? error?.code ?? '').slice(0, 60) || null,
          path: Array.isArray(error?.path) ? error.path.slice(0, 8) : null
        })) : [];
        dataPresent = Object.prototype.hasOwnProperty.call(parsed ?? {}, 'data');
        const nodes = parsed?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
        nodesCount = Array.isArray(nodes) ? nodes.length : null;
      } catch {}
      results.push({
        index: index + 1, httpStatus: response.status, elapsedMs: Date.now() - started,
        contentType: (response.headers.get('content-type') || '').split(';')[0],
        bodyKind, graphqlErrorCount: errors.length, errors, dataPresent, nodesCount,
        retryAfter: response.headers.get('retry-after')
      });
      if (response.status === 429 || response.status >= 500 || errors.length > 0) break;
    } catch (error) {
      results.push({
        index: index + 1, httpStatus: null, elapsedMs: Date.now() - started,
        networkError: String(error instanceof Error ? error.message : error).slice(0, 180)
      });
      break;
    }
    if (index < plates.length - 1) await new Promise(resolve => setTimeout(resolve, 13000));
  }
  console.log('LIVE_ASF_GITHUB_EGRESS_DISTINCT_PLATES=' + JSON.stringify({
    maxRequests: plates.length,
    requestCount: results.length,
    syntheticInputs: true,
    uniqueQueryEachTime: true,
    sequential: true,
    stopAtFirstFailure: true,
    results
  }));
}
