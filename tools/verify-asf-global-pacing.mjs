import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const app = readFileSync('verix-app.html', 'utf8');
const cleanup = readFileSync('supabase/migrations/20261027192500_remove_asf_global_pacing_queue.sql', 'utf8');

assert.doesNotMatch(proxy, /reservarLugarASF|verix_asf_reserve_slot|ASF_GLOBAL_INTERVAL_MS/);
assert.match(proxy, /const url = ASF_ORIGIN \+ ASF_PATH \+ "\?query=" \+ encodeURIComponent\(query\)/);
assert.match(proxy, /method: "POST"/);
assert.match(app, /const ASF_TIMEOUT_MS = 15000;/);
assert.doesNotMatch(app, /const ASF_TIMEOUT_MS = 148000/);
assert.doesNotMatch(app, /if \(type === 'asf_pacing_queue_busy'\) return true/);
assert.match(cleanup, /DROP FUNCTION IF EXISTS public\.verix_asf_reserve_slot\(integer, integer\)/);
assert.match(cleanup, /DROP TABLE IF EXISTS public\.verix_asf_pacing_state/);
console.log('ASF no-queue contract passed.');

const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
function safeMessage(value, plate) {
  return String(value ?? 'unknown').replaceAll(plate, '[TEST_PLATE]').replace(/[A-Z0-9]{6,8}/g, '[IDENTIFIER]').slice(0, 180);
}
function queryFor(plate) {
  return 'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
    plate + '", date: "2026/10/28") { nodes { id entity startDate endDate policy license code logo } } } } } }';
}
function parseResult(raw, plate, sequence, client) {
  let body = raw, meta = {};
  if (client === 'curl') {
    const marker = '\n__META__';
    const cut = raw.lastIndexOf(marker);
    if (cut >= 0) {
      body = raw.slice(0, cut);
      try { meta = JSON.parse(raw.slice(cut + marker.length)); } catch {}
    }
  }
  let errors = [], dataPresent = false, nodesCount = null, bodyKind = 'non_json';
  try {
    const parsed = JSON.parse(body);
    bodyKind = 'json';
    errors = Array.isArray(parsed?.errors) ? parsed.errors.slice(0, 2).map(e => ({
      message: safeMessage(e?.message, plate),
      path: Array.isArray(e?.path) ? e.path.slice(0, 8) : null,
      code: String(e?.extensions?.code ?? e?.code ?? '').slice(0, 60) || null
    })) : [];
    dataPresent = Object.prototype.hasOwnProperty.call(parsed ?? {}, 'data');
    const nodes = parsed?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
    nodesCount = Array.isArray(nodes) ? nodes.length : null;
  } catch {}
  return {
    sequence, client, httpStatus: client === 'curl' ? Number(meta.status) : undefined,
    elapsedMs: client === 'curl' ? Math.round(Number(meta.time) * 1000) : undefined,
    bodyKind, graphqlErrorCount: errors.length, errors, dataPresent, nodesCount
  };
}
async function nodeRequest(plate, sequence) {
  const started = Date.now();
  try {
    const response = await fetch('https://ext01.asf.com.pt/api/src/?query=' + encodeURIComponent(queryFor(plate)), {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'User-Agent': AGENT
      },
      body: null,
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });
    const raw = await response.text();
    return { ...parseResult(raw, plate, sequence, 'node-fetch'), httpStatus: response.status, elapsedMs: Date.now() - started };
  } catch (e) {
    return { sequence, client: 'node-fetch', elapsedMs: Date.now() - started, networkError: String(e).slice(0, 160) };
  }
}
function curlRequest(plate, sequence) {
  const url = 'https://ext01.asf.com.pt/api/src/?query=' + encodeURIComponent(queryFor(plate));
  const format = '\n__META__{"status":%{http_code},"time":%{time_total},"contentType":"%{content_type}"}';
  const started = Date.now();
  const proc = spawnSync('curl', [
    '--silent', '--show-error', '--max-time', '12', '--request', 'POST',
    '--header', 'Accept: application/json, text/plain, */*',
    '--header', 'Cache-Control: no-cache',
    '--header', 'Pragma: no-cache',
    '--header', 'User-Agent: ' + AGENT,
    '--write-out', format,
    url
  ], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  if (proc.error || proc.status !== 0) {
    return { sequence, client: 'curl', elapsedMs: Date.now() - started,
      networkError: String(proc.error?.message ?? proc.stderr ?? 'curl failed').slice(0, 180) };
  }
  return { ...parseResult(proc.stdout, plate, sequence, 'curl'), elapsedMs: Date.now() - started };
}

// Same GitHub runner/public IP and same User-Agent/headers; only HTTP client/TLS stack changes.
// If the 5-request boundary follows the egress IP, alternating Node and curl still fails at call 6.
// If it follows client fingerprint/session, separate Node/curl buckets may each pass five.
if (process.env.GITHUB_ACTIONS === 'true') {
  const nodePlates = ['UU44UU', 'SS22SS', 'QQ00QQ', 'OO88OO', 'MM66MM'];
  const curlPlates = ['TT33TT', 'RR11RR', 'PP99PP', 'NN77NN', 'LL55LL'];
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await nodeRequest(nodePlates[i], results.length + 1));
    const node = results[results.length - 1];
    if (node.networkError || node.httpStatus === 429 || node.httpStatus >= 500 || node.graphqlErrorCount > 0) break;
    results.push(curlRequest(curlPlates[i], results.length + 1));
    const curl = results[results.length - 1];
    if (curl.networkError || curl.httpStatus === 429 || curl.httpStatus >= 500 || curl.graphqlErrorCount > 0) break;
  }
  console.log('LIVE_ASF_SAME_EGRESS_DIFFERENT_HTTP_CLIENTS=' + JSON.stringify({
    maxRequests: 10, actualRequests: results.length, syntheticInputsOnly: true,
    sameGitHubRunnerEgress: true, sameUserAgentAndHeaders: true,
    alternatedClients: true, stopAtFirstFailure: true, results
  }));
}