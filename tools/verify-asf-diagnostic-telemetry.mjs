import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync('verix-app.html', 'utf8');
const frozenEngine = readFileSync('tests/fixtures/asf-engine-baseline.txt', 'utf8');
const startMarker = '  function asfTentativaRetryable(status, errorType)';
const endMarker = '  function anunciarEstadoConsultaASF(mensagem)';

function between(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.ok(startAt >= 0 && endAt > startAt, `Missing protected source markers: ${start}`);
  return source.slice(startAt, endAt);
}

// The operational ASF query/parser block is frozen byte-for-byte.
assert.equal(between(html, startMarker, endMarker), frozenEngine,
  'Protected ASF engine changed. Do not update the baseline without explicit approval.');

// The telemetry sanitizer must preserve existing diagnostics without storing raw response bodies.
const cleaner = between(html, '  function cleanMetadata(meta, event)', '  function push(event, module, meta)');
for (const field of [
  'asfTotalMs', 'asfQueueWaitMs', 'asfQueuePosition',
  'asfResponseContentType', 'asfResponseHash', 'asfStatusText',
  'asfRelayLatencyMs', 'asfParsePath', 'asfResponseClass',
  'asfGraphqlErrorCount', 'asfGraphqlCodes', 'asfGraphqlMessages',
  'responseHash', 'responseContentType', 'statusText'
]) {
  assert.ok(cleaner.includes(field), `ASF diagnostic field is not forwarded: ${field}`);
}

// The active browser endpoint is the current versioned function, not the retired route.
assert.match(html, /var ENDPOINT = 'https:\/\/onilkakbgpklxvxuxmks\.supabase\.co\/functions\/v1\/telemetry-v2';/);
assert.doesNotMatch(html, /\/functions\/v1\/telemetry(?:['"?\s]|$)/,
  'Found an exact reference to the retired unversioned telemetry endpoint.');

// Confirm the server-side sanitizer recognizes the same fields.
const server = readFileSync('supabase/functions/telemetry-v2/index.ts', 'utf8');
for (const field of [
  'asfTotalMs', 'asfQueueWaitMs', 'asfResponseContentType',
  'asfResponseHash', 'asfStatusText', 'asfRelayLatencyMs',
  'asfGraphqlErrorCount', 'asfGraphqlCodes', 'asfGraphqlMessages',
  'responseHash', 'responseContentType', 'statusText'
]) {
  assert.ok(server.includes(field), `Server telemetry sanitizer does not recognize: ${field}`);
}


const proxy = readFileSync('supabase/functions/asf-proxy-v1/index.ts', 'utf8');
const frozenProxyQuery = readFileSync('tests/fixtures/asf-proxy-query-baseline.txt', 'utf8');
assert.equal(
  between(proxy, '    const query =', '\n\n    const url ='),
  frozenProxyQuery,
  'ASF relay GraphQL mutation changed. Do not update the baseline without explicit approval.'
);
assert.ok(proxy.includes('const ASF_ORIGIN = "https://ext01.asf.com.pt";'));
assert.ok(proxy.includes('const ASF_PATH = "/api/src/";'));


const experimentalHtml = readFileSync('verix-app-test-retries.html', 'utf8');
assert.equal(
  between(experimentalHtml, '  function interpretarRespostaASF(json)', '  // CONSULTA ASF = mesmo endpoint/mutation'),
  between(html, '  function interpretarRespostaASF(json)', '  // CONSULTA ASF = mesmo endpoint/mutation'),
  'Experimental HTML changed the ASF result parser.'
);
assert.equal(
  between(experimentalHtml, '    var resposta = await efetuarPedidoHttpASF({', '    var diag = resposta && resposta.__asfDiagnostic'),
  between(html, '    var resposta = await efetuarPedidoHttpASF({', '    var diag = resposta && resposta.__asfDiagnostic'),
  'Experimental HTML changed the ASF query payload.'
);
assert.match(experimentalHtml, /ASF_MAX_ATTEMPTS = 3;/);
assert.match(experimentalHtml, /ASF_RETRY_DELAYS_MS = \[300, 900\];/);
assert.ok(experimentalHtml.includes('function asfRespostaIndisponivelTransitoria'));
assert.ok(experimentalHtml.includes('respostaGraphqlIndisponivel && !retryAfterASF'), 'Transient-only retry guard missing.');
assert.ok(experimentalHtml.includes('retryAfterASF'), 'Retry-After safeguard missing.');
assert.ok(experimentalHtml.includes('TESTE ASF · 1 consulta + até 2 repetições automáticas'),
  'Experimental build is not visibly labelled.');

const experimentalScripts = Array.from(
  experimentalHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi),
  (match) => match[1]
);
const retryScript = experimentalScripts.find((script) => script.includes('function asfRespostaIndisponivelTransitoria'));
assert.ok(retryScript, 'Could not locate the experimental retry script.');
new Script(retryScript, { filename: 'verix-app-test-retries:inline-script.js' });
console.log('PASS: ASF browser engine and relay query unchanged; experimental HTML syntax checked; diagnostic telemetry and bounded retry verified.');
