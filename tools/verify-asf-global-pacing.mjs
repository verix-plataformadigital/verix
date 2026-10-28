import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const app = readFileSync('verix-app.html', 'utf8');
const cleanup = readFileSync('supabase/migrations/20261027192500_remove_asf_global_pacing_queue.sql', 'utf8');

// The ASF relay must forward directly instead of placing requests in a long queue.
assert.ok(proxy.includes('const url = ASF_ORIGIN + ASF_PATH + "?query=" + encodeURIComponent(query)'));
assert.ok(proxy.includes('method: "POST"'));
assert.ok(!/reservarLugarASF|verix_asf_reserve_slot|ASF_GLOBAL_INTERVAL_MS/.test(proxy));

// A client timeout must not be extended to the former 130 s queue window.
assert.ok(app.includes('const ASF_TIMEOUT_MS = 15000;'));
assert.ok(!app.includes('const ASF_TIMEOUT_MS = 148000'));
assert.ok(!app.includes("if (type === 'asf_pacing_queue_busy') return true"));

// Remove the database scheduler created by the temporary queue experiment.
assert.ok(cleanup.includes('DROP FUNCTION IF EXISTS public.verix_asf_reserve_slot(integer, integer)'));
assert.ok(cleanup.includes('DROP TABLE IF EXISTS public.verix_asf_pacing_state'));

console.log('ASF no-queue contract passed.');

// One low-volume compatibility probe against documented/publicly identified ASF hostnames.
// This diagnostic revision tests only origin alias behavior; production code is unchanged.
// The deliberately synthetic plate is used only to classify the API envelope.
// Do not log full response bodies or any vehicle/insurance fields.
const syntheticQuery =
  'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "ZZZ9999", date: "2026/10/28") { nodes { id entity startDate endDate policy license code logo } } } } } }';

const candidates = [
  { name: 'ext01-control', origin: 'https://ext01.asf.com.pt', path: '/api/src/', method: 'POST' },
  { name: 'www-ext01-candidate', origin: 'https://www.ext01.asf.com.pt', path: '/api/src/', method: 'POST' },
  { name: 'consumer-portal-candidate', origin: 'https://consumidor.asf.com.pt', path: '/api/src/', method: 'POST' },
  { name: 'www-consumer-portal-candidate', origin: 'https://www.consumidor.asf.com.pt', path: '/api/src/', method: 'POST' },
  { name: 'www-asf-candidate', origin: 'https://www.asf.com.pt', path: '/api/src/', method: 'POST' }
];

for (const candidate of candidates) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  const url = candidate.origin + candidate.path + (candidate.method === 'POST' ? '?query=' + encodeURIComponent(syntheticQuery) : '');
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: candidate.method,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },
      ...(candidate.method === 'POST' ? { body: null } : {}),
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
      const contentType = response.headers.get('content-type') || '';
      const bodyStart = raw.trim().toLowerCase();
      if (contentType.toLowerCase().includes('text/html') ||
          bodyStart.startsWith('<!doctype html') || bodyStart.startsWith('<html')) bodyKind = 'html';
      else if (!raw.trim()) bodyKind = 'empty';
    }
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const nodes = payload?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
    console.log(JSON.stringify({
      test: candidate.name,
      finalHost: (() => { try { return new URL(response.url).host; } catch { return 'unknown'; } })(),
      status: response.status,
      redirected: response.redirected,
      allowHeader: response.headers.get('allow') || '',
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
      causeCode: String(error?.cause?.code || ''),
      causeName: String(error?.cause?.name || ''),
      causeMessage: String(error?.cause?.message || '').slice(0, 180),
      elapsedMs: Date.now() - started
    }));
  } finally {
    clearTimeout(timer);
  }
  await new Promise(resolve => setTimeout(resolve, 1200));
}
