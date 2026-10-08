import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JavaScriptObfuscator from "javascript-obfuscator";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "dist");

const BUILD_ID = process.env.VERIX_BUILD_ID || `1.5-sec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-a`;

if (!/^1\.5-sec-(?:\d{8}-[a-z0-9-]{1,20}|\d{1,8}-[a-f0-9]{7,64})$/i.test(String(BUILD_ID))) {
  throw new Error("Invalid VERIX_BUILD_ID: " + BUILD_ID);
}

const DOMAIN_LOCK = [
  "verix-plataformadigital.github.io",
  "localhost",
  "127.0.0.1",
  "[::1]"
];

/** Shared strong but safe obfuscation options */
const OBFUSCATOR_OPTIONS = {
  target: "browser-no-eval",
  compact: true,
  simplify: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  deadCodeInjection: false,          // keep false — can break large single-file apps
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  domainLock: DOMAIN_LOCK,
  domainLockRedirectUrl: "about:blank",
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  renameProperties: false,
  reservedNames: [
    "^window$",
    "^document$",
    "^navigator$",
    "^location$",
    "^console$",
    "^fetch$",
    "^setTimeout$",
    "^setInterval$",
    "^clearTimeout$",
    "^clearInterval$",
    "^Promise$",
    "^ActiveXObject$",
    "^localStorage$",
    "^sessionStorage$",
    "^indexedDB$",
    "^crypto$",
    "^performance$",
    "^requestAnimationFrame$",
    "^cancelAnimationFrame$"
  ],
  selfDefending: true,
  sourceMap: false,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.85,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  splitStrings: true,
  splitStringsChunkLength: 8
};


const CRITICAL_RUNTIME_NAMES = [
  "criarDiagASF",
  "reservarSlotFisicoASF",
  "textoErroASF",
  "classificarErroASF",
  "finalizarTentativaDiagASF",
  "erroComDiagASF",
  "agoraMsASFDiag",
  "hashTextoASF",
  "consultarSeguroASF",
  "processarConsultaSeguroComCadencia",
  "realizarConsultaASF_IPO",
  "renderSeguroEncontrado",
  "renderSeguroNaoEncontrado",
  "mostrarSeguroErro"
];

const COMPATIBILITY_OPTIONS = {
  ...OBFUSCATOR_OPTIONS,
  // The main VÉRIX runtime is a large legacy single-file application.
  // Keep semantics deterministic: no control-flow rewriting, anti-debug
  // runtime, or self-defending wrapper in this critical block.
  controlFlowFlattening: false,
  controlFlowFlatteningThreshold: 0,
  debugProtection: false,
  debugProtectionInterval: 0,
  selfDefending: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayIndexShift: false,
  stringArrayRotate: false,
  stringArrayShuffle: false,
  stringArrayThreshold: 0.5,
  splitStrings: false,
  reservedNames: [
    ...OBFUSCATOR_OPTIONS.reservedNames,
    ...CRITICAL_RUNTIME_NAMES.map(name => "^" + name + "$")
  ]
};


function obfuscateHtml(html, label) {
  const scriptPattern = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  let scriptCount = 0;

  const output = html.replace(scriptPattern, (full, open, source, close) => {
    const trimmed = String(source || "").trim();
    if (!trimmed || /src\s*=\s*["']/i.test(open)) return full;

    // Critical runtime blocks must remain executable. The heavy obfuscator
    // can interfere with browser lifecycle/telemetry code in legacy hosts.
    const idMatch = open.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const scriptId = idMatch ? String(idMatch[1]).toLowerCase() : "";
    if (scriptId === "verix-telemetry-v2" || scriptId === "verix-security-runtime") {
      return full;
    }

    // Skip tiny bootstrappers / redirects — not worth the cost
    if (trimmed.length < 120) return full;

    scriptCount++;
    try {
      const options = trimmed.length >= 250_000
        ? COMPATIBILITY_OPTIONS
        : OBFUSCATOR_OPTIONS;
      const result = JavaScriptObfuscator.obfuscate(trimmed, options).getObfuscatedCode();
      return open + "\n" + result + "\n" + close;
    } catch (err) {
      console.error(`[${label}] Failed to obfuscate script block #${scriptCount}:`, err.message);
      return full; // fail-safe: keep original block
    }
  });

  return { html: output, scriptCount };
}

function writeSecureFile(relativeSource, relativeOutput) {
  const inputPath = path.join(ROOT, relativeSource);
  if (!fs.existsSync(inputPath)) {
    console.warn(`Skip: ${relativeSource} not found`);
    return null;
  }

  let source = fs.readFileSync(inputPath, "utf8");

  // Inject the exact build identity into the client security runtime. The
  // Pages workflow creates a new build ID on every release.
  if (relativeSource === "verix-app.html") {
    const safeBuildId = String(BUILD_ID).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    source = source.replace(
      /var BUILD_ID = ['"][^'"]+['"]/,
      "var BUILD_ID = '" + safeBuildId + "'"
    );
    source = source.replace(/1\.5-sec-20261008-a/g, BUILD_ID);
  }

  const { html, scriptCount } = obfuscateHtml(source, relativeSource);
  const outPath = path.join(OUTPUT_DIR, relativeOutput);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");

  const sha256 = createHash("sha256").update(html).digest("hex");
  return {
    source: relativeSource,
    output: path.join("dist", relativeOutput).replace(/\\/g, "/"),
    sha256,
    script_blocks_obfuscated: scriptCount,
    size_bytes: Buffer.byteLength(html, "utf8")
  };
}

// ── Build ───────────────────────────────────────────────────────────────────
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const results = [];

// Main application
const app = writeSecureFile("verix-app.html", "verix-app.html");
if (app) results.push(app);

// Admin panel
const admin = writeSecureFile("admin_v2.html", "admin_v2.html");
if (admin) results.push(admin);

// Lightweight entry points (no heavy obfuscation needed)
for (const f of ["index.html", "verix-mobile.html"]) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUTPUT_DIR, f));
    results.push({ source: f, output: `dist/${f}`, note: "copied (bootstrap)" });
  }
}

// Optional mobile assets
for (const f of ["verix-mobile.css", "verix-mobile.js"]) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUTPUT_DIR, f));
  }
}

// Release-time runtime invariants. These critical blocks are intentionally
// excluded from heavy obfuscation and must survive packaging unchanged enough
// to expose their endpoint, heartbeat and security runtime markers.
function verifyCriticalRuntime(outputPath) {
  const html = fs.readFileSync(outputPath, "utf8");
  const telemetry = html.match(/<script\b[^>]*id=["']verix-telemetry-v2["'][^>]*>[\s\S]*?<\/script>/i);
  const security = html.match(/<script\b[^>]*id=["']verix-security-runtime["'][^>]*>[\s\S]*?<\/script>/i);
  if (!telemetry) throw new Error("Critical telemetry runtime block missing from secure build");
  if (!/telemetry-v2/i.test(telemetry[0])) throw new Error("Critical telemetry endpoint marker missing");
  if (!/heartbeat/i.test(telemetry[0])) throw new Error("Critical telemetry heartbeat marker missing");
  if (!security) throw new Error("Critical security runtime block missing from secure build");
  const escapedExpectedBuild = String(BUILD_ID).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\  if (!/heartbeat/i.test(telemetry[0])) throw new Error("Critical telemetry heartbeat marker missing");
  if (!security) throw new Error("Critical security runtime block missing from secure build");
  return { telemetry_runtime: true, security_runtime: true };");
  const expectedBuild = new RegExp("var\\s+BUILD_ID\\s*=\\s*['\"]" + escapedExpectedBuild + "['\"]");
  if (!expectedBuild.test(security[0])) {
    throw new Error("Client BUILD_ID does not match release BUILD_ID");
  }
  return { telemetry_runtime: true, security_runtime: true };
}

function verifyJavaScriptSyntax(outputPath) {
  const html = fs.readFileSync(outputPath, "utf8");
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let checked = 0;
  let match;
  while ((match = scriptPattern.exec(html))) {
    const attrs = match[1] || "";
    const source = String(match[2] || "").trim();
    if (!source || /\bsrc\s*=\s*["']/i.test(attrs)) continue;
    try {
      // Parse only. Never execute application code in CI.
      new Function(source);
    } catch (error) {
      throw new Error(`JavaScript syntax check failed for inline script #${checked + 1}: ${error.message}`);
    }
    checked++;
  }
  return checked;
}

const appOutput = path.join(OUTPUT_DIR, "verix-app.html");
if (fs.existsSync(appOutput)) {
  verifyCriticalRuntime(appOutput);
  verifyJavaScriptSyntax(appOutput);
}

// Build manifest
const manifest = {
  build_id: BUILD_ID,
  generated_at: new Date().toISOString(),
  source_maps: false,
  domain_lock: DOMAIN_LOCK.filter(d => !d.includes("localhost") && !d.includes("127.")),
  files: results,
  notes: [
    "This dist/ folder is the ONLY version that should be published.",
    "Never publish the clear-text source HTML files.",
    "Keep the GitHub repository private.",
    "Rotate VERIX_GATE_SECRET / VERIX_ADMIN_SECRET if a build is compromised."
  ]
};

fs.writeFileSync(
  path.join(OUTPUT_DIR, "build-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

// Simple README inside dist so anyone who finds it knows the rules
fs.writeFileSync(
  path.join(OUTPUT_DIR, "README-RELEASE.txt"),
  `VÉRIX — Secure Production Build
================================
Build ID : ${BUILD_ID}
Generated: ${manifest.generated_at}

This folder contains the obfuscated, domain-locked production assets.
Do NOT publish the source HTML files from the repository root.

Publish only the contents of this dist/ directory.
`,
  "utf8"
);

console.log(JSON.stringify({
  build_id: BUILD_ID,
  files: results.map(r => ({
    output: r.output,
    scripts: r.script_blocks_obfuscated ?? 0,
    sha256: r.sha256?.slice(0, 16) + "…"
  })),
  output_dir: "dist/"
}, null, 2));
