import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JavaScriptObfuscator from "javascript-obfuscator";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "dist");

const BUILD_ID = process.env.VERIX_BUILD_ID || `1.5-sec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-a`;

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

function obfuscateHtml(html, label) {
  const scriptPattern = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  let scriptCount = 0;

  const output = html.replace(scriptPattern, (full, open, source, close) => {
    const trimmed = String(source || "").trim();
    if (!trimmed || /src\s*=\s*["']/i.test(open)) return full;

    // Skip tiny bootstrappers / redirects — not worth the cost
    if (trimmed.length < 120) return full;

    scriptCount++;
    try {
      const result = JavaScriptObfuscator.obfuscate(trimmed, OBFUSCATOR_OPTIONS).getObfuscatedCode();
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

  const source = fs.readFileSync(inputPath, "utf8");
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
