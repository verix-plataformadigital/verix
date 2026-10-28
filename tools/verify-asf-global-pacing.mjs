import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const app = readFileSync('verix-app.html', 'utf8');
const cleanup = readFileSync('supabase/migrations/20261027192500_remove_asf_global_pacing_queue.sql', 'utf8');

// The ASF relay must forward directly instead of placing requests in a long queue.
assert.doesNotMatch(proxy, /reservarLugarASF|verix_asf_reserve_slot|ASF_GLOBAL_INTERVAL_MS/);
assert.match(proxy, /const url = ASF_ORIGIN \\+ ASF_PATH \\+ "\\?query=" \\+ encodeURIComponent\\(query\\)/);
assert.match(proxy, /method: "POST"/);

// A client timeout must not be extended to the former 130 s queue window.
assert.match(app, /const ASF_TIMEOUT_MS = 15000;/);
assert.doesNotMatch(app, /const ASF_TIMEOUT_MS = 148000/);
assert.doesNotMatch(app, /if \\(type === 'asf_pacing_queue_busy'\\) return true/);

// Remove the database scheduler created by the temporary queue experiment.
assert.match(cleanup, /DROP FUNCTION IF EXISTS public\\.verix_asf_reserve_slot\\(integer, integer\\)/);
assert.match(cleanup, /DROP TABLE IF EXISTS public\\.verix_asf_pacing_state/);

console.log('ASF no-queue contract passed.');

// One low-volume compatibility probe against the publicly identified hostnames.
// The deliberately synthetic plate is used only to classify the API envelope.
// Do not log full response bodies or any vehicle/insurance fields.
const syntheticQuery =
  'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "ZZZ9999", date: "2026/10/28") { nodes { id entity startDate endDate policy license code logo } } } } } }';

const candidates = [
  { name: 'ext01-control', origin: 'https://ext01.asf.com.pt' },
  { name: 'ext02-candidate', origin: 'https://ext02.asf.com.pt' },
  { name: 'www-ext02-candidate', origin: 'https://www.ext02.asf.com.pt' }
];

for (const candidate of candidates) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  const url = candidate.origin + '/api/src/?query=' + encodeURIComponent(syntheticQuery);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },
      body: null,
      redirect: 'follow',
      signal: controller.signal
    });
    const raw = await response.text();
    let payload = null;
    let bodyKind = 'non_json';
    try {
      payload = JSON.parse(raw);
      bodyKind = 'json';
    } catch {
      if (/text\\/html/i.test(response.headers.get('content-type') || '') ||
          /^(?:<!doctype html|<html\\b)/i.test(raw.trim())) bodyKind = 'html';
      else if (!raw.trim()) bodyKind = 'empty';
    }
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const nodes = payload?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
    console.log(JSON.stringify({
      test: candidate.name,
      finalHost: (() => { try { return new URL(response.url).host; } catch { return 'unknown'; } })(),
      status: response.status,
      contentType: (response.headers.get('content-type') || '').split(';')[0],
      bodyKind,
      graphqlErrorCount: errors.length,
      graphqlErrorMessages: errors.slice(0, 2).map(e => String(e?.message || 'unknown').slice(0, 100)),
      dataPresent: Boolean(payload && Object.hasOwn(payload, 'data')),
      nodesCount: Array.isArray(nodes) ? nodes.length : null,
      elapsedMs: Date.now() - started
    }));
  } catch (error) {
    console.log(JSON.stringify({
      test: candidate.name,
      transportError: error?.name || 'Error',
      message: String(error?.message || error).slice(0, 140),
      elapsedMs: Date.now() - started
    }));
  } finally {
    clearTimeout(timer);
  }
  await new Promise(resolve => setTimeout(resolve, 1200));
}
