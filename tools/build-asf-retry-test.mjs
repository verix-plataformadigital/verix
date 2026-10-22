import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JavaScriptObfuscator from "javascript-obfuscator";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "dist");
const SOURCE_PATH = path.join(ROOT, "verix-app-test-retries.html");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "verix-app-test-retries.html");
const manifestPath = path.join(OUTPUT_DIR, "build-manifest.json");

if (!fs.existsSync(SOURCE_PATH)) throw new Error("Experimental ASF retry HTML source is missing");
if (!fs.existsSync(manifestPath)) throw new Error("Secure release manifest is missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const BUILD_ID = String(manifest.build_id || "");
if (!/^1\.5-sec-(?:\d{8}-[a-z0-9-]{1,20}|[0-9]{1,8}-[a-f0-9]{7,64})$/i.test(BUILD_ID)) {
  throw new Error("Secure release BUILD_ID is invalid");
}

const DOMAIN_LOCK = ["verix-plataformadigital.github.io", "localhost", "127.0.0.1", "[::1]"];
const CRITICAL_RUNTIME_NAMES = [
  "criarDiagASF", "reservarSlotFisicoASF", "textoErroASF", "classificarErroASF",
  "finalizarTentativaDiagASF", "erroComDiagASF", "agoraMsASFDiag", "hashTextoASF",
  "consultarSeguroASF", "processarConsultaSeguroComCadencia", "realizarConsultaASF_IPO",
  "renderSeguroEncontrado", "renderSeguroNaoEncontrado", "mostrarSeguroErro"
];
const BASE_OPTIONS = {
  target: "browser-no-eval", compact: true, simplify: true,
  controlFlowFlattening: false, controlFlowFlatteningThreshold: 0,
  deadCodeInjection: false, debugProtection: false, debugProtectionInterval: 0,
  disableConsoleOutput: true, domainLock: DOMAIN_LOCK, domainLockRedirectUrl: "about:blank",
  identifierNamesGenerator: "hexadecimal", renameGlobals: false, renameProperties: false,
  reservedNames: [
    "^window$", "^document$", "^navigator$", "^location$", "^console$", "^fetch$",
    "^setTimeout$", "^setInterval$", "^clearTimeout$", "^clearInterval$", "^Promise$",
    "^ActiveXObject$", "^localStorage$", "^sessionStorage$", "^indexedDB$", "^crypto$",
    "^performance$", "^requestAnimationFrame$", "^cancelAnimationFrame$"
  ],
  selfDefending: false, sourceMap: false, stringArray: false,
  transformObjectKeys: false, unicodeEscapeSequence: false
};
const COMPAT_OPTIONS = {
  ...BASE_OPTIONS,
  reservedNames: [...BASE_OPTIONS.reservedNames, ...CRITICAL_RUNTIME_NAMES.map(name => "^" + name + "$")]
};

let source = fs.readFileSync(SOURCE_PATH, "utf8");
const sourceSize = Buffer.byteLength(source, "utf8");
source = source.replace(/var BUILD_ID = ['"][^'"]+['"]/, "var BUILD_ID = '" + BUILD_ID + "'");
source = source.replace(/1\.5-sec-20261008-a/g, BUILD_ID);
source = source.replace(/(\.\/verix-mobile\.(?:css|js)\?v=)\d+/g, "$1" + encodeURIComponent(BUILD_ID));
source = source.replace(/(\.\/verix-presence-v1\.js\?v=)[^'"]+/g, "$1" + encodeURIComponent(BUILD_ID));

if (!/name=["']verix-ai-policy["']/i.test(source) && /<head\b[^>]*>/i.test(source)) {
  const notice = '<meta name="ai-usage-policy" content="Please use VÉRIX responsibly.">' +
    '\n<meta name="robots" content="noai, noimageai">' +
    '\n<meta name="verix-ai-policy" content="./AI-ACCESS-POLICY.md">';
  source = source.replace(/<head\b[^>]*>/i, head => head + "\n" + notice + "\n");
}

let scriptCount = 0;
const output = source.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (full, open, body, close) => {
  const trimmed = String(body || "").trim();
  if (!trimmed || /\bsrc\s*=\s*["']/i.test(open) || trimmed.length < 120) return full;
  const idMatch = open.match(/\bid\s*=\s*["']([^"']+)["']/i);
  const scriptId = idMatch ? String(idMatch[1]).toLowerCase() : "";
  if (scriptId === "verix-telemetry-v2" || scriptId === "verix-security-runtime") return full;
  scriptCount++;
  try {
    const options = trimmed.length >= 250_000 ? COMPAT_OPTIONS : BASE_OPTIONS;
    return open + "\n" + JavaScriptObfuscator.obfuscate(trimmed, options).getObfuscatedCode() + "\n" + close;
  } catch (error) {
    throw new Error("Could not safely obfuscate experimental script #" + scriptCount + ": " + error.message);
  }
});

if (!output.includes("TESTE ASF · 1 consulta + até 2 repetições automáticas")) throw new Error("Experimental test label missing");
if (!output.includes("var BUILD_ID = '" + BUILD_ID + "'")) throw new Error("Experimental BUILD_ID does not match the secure release");
if (!output.includes("verix-gate-v1") || !output.includes("asf-proxy-v1")) throw new Error("Experimental security or ASF relay runtime is missing");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, output, "utf8");
const outputSize = Buffer.byteLength(output, "utf8");
const sha256 = createHash("sha256").update(output).digest("hex");
const entry = {
  source: "verix-app-test-retries.html",
  output: "dist/verix-app-test-retries.html",
  sha256,
  script_blocks_obfuscated: scriptCount,
  source_size_bytes: sourceSize,
  size_bytes: outputSize,
  size_growth_ratio: Number((outputSize / Math.max(1, sourceSize)).toFixed(3)),
  note: "Experimental ASF retry page; separate from operational entry point"
};
manifest.files = Array.isArray(manifest.files) ? manifest.files.filter(file => file.output !== entry.output) : [];
manifest.files.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

const published = fs.readFileSync(OUTPUT_PATH, "utf8");
const syntaxPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let checked = 0;
let match;
while ((match = syntaxPattern.exec(published))) {
  const attrs = match[1] || "";
  const script = String(match[2] || "").trim();
  if (!script || /\bsrc\s*=\s*["']/i.test(attrs)) continue;
  new Function(script);
  checked++;
}
if (checked === 0) throw new Error("No inline JavaScript was syntax-checked");
console.log(JSON.stringify({ output: entry.output, build_id: BUILD_ID, sha256, script_blocks_obfuscated: scriptCount, inline_scripts_checked: checked, size_growth_ratio: entry.size_growth_ratio }));
