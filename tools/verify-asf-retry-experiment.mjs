import assert from "node:assert/strict";
import fs from "node:fs";

const operational = fs.readFileSync("verix-app.html", "utf8");
const experiment = fs.readFileSync("verix-app-test-retries.html", "utf8");
const built = fs.readFileSync("dist/verix-app-test-retries.html", "utf8");

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "Protected source markers not found: " + start);
  return source.slice(a, b);
}

assert.equal(
  between(experiment, "  function interpretarRespostaASF(json)", "  // CONSULTA ASF = mesmo endpoint/mutation"),
  between(operational, "  function interpretarRespostaASF(json)", "  // CONSULTA ASF = mesmo endpoint/mutation"),
  "Experimental HTML changed the ASF response parser."
);
assert.equal(
  between(experiment, "    var resposta = await efetuarPedidoHttpASF({", "    var diag = resposta && resposta.__asfDiagnostic"),
  between(operational, "    var resposta = await efetuarPedidoHttpASF({", "    var diag = resposta && resposta.__asfDiagnostic"),
  "Experimental HTML changed the ASF query payload."
);

const proxyUrl = source => source.match(/ASF_PROXY_URL\s*=\s*['"]([^'"]+)/)?.[1] || "";
assert.equal(proxyUrl(experiment), proxyUrl(operational), "Experimental HTML points to a different ASF relay.");
assert.equal(
  experiment.match(/ASF_MAX_ATTEMPTS\s*=\s*\d+;/)?.[0],
  operational.match(/ASF_MAX_ATTEMPTS\s*=\s*\d+;/)?.[0],
  "Maximum attempts changed."
);
assert.equal(
  experiment.match(/ASF_RETRY_DELAYS_MS\s*=\s*\[[^\]]+\];/)?.[0],
  operational.match(/ASF_RETRY_DELAYS_MS\s*=\s*\[[^\]]+\];/)?.[0],
  "Existing transport retry delays changed."
);

assert.ok(experiment.includes("function asfRespostaIndisponivelTransitoria"), "Transient ASF predicate is missing.");
assert.ok(experiment.includes("message.indexOf('indispon') >= 0"), "Portuguese availability-message matching is missing.");
assert.ok(experiment.includes("message.indexOf('unavailable') >= 0"), "English availability-message matching is missing.");
assert.ok(!experiment.includes("if (json.data !== undefined && json.data !== null) return false;"),
  "Retry detector must handle partial-data GraphQL errors that still report unavailability.");
assert.ok(experiment.includes("respostaGraphqlIndisponivel;"), "Availability retry is not enabled.");
assert.ok(experiment.includes("Math.min(10000, retryAfterMs)"), "Retry-After safety cap is missing.");
assert.ok(experiment.includes("TESTE ASF · 1 consulta + até 2 repetições automáticas"), "Experimental warning badge is missing.");
assert.ok(built.includes("TESTE ASF · 1 consulta + até 2 repetições automáticas"), "Built experiment label is missing.");

const manifest = JSON.parse(fs.readFileSync("dist/build-manifest.json", "utf8"));
const entry = (manifest.files || []).find(file => file.output === "dist/verix-app-test-retries.html");
assert.ok(entry, "Experimental page is missing from the secure build manifest.");
assert.equal(manifest.build_id, built.match(/var BUILD_ID = '([^']+)'/)?.[1], "Experiment BUILD_ID differs from operational release.");
assert.ok(entry.sha256 && entry.size_bytes > 0, "Experimental artifact metadata is incomplete.");

console.log("PASS: ASF parser, query payload, relay URL and existing limits unchanged; test HTML securely built with matching BUILD_ID.");
