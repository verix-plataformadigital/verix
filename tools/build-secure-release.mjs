import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JavaScriptObfuscator from "javascript-obfuscator";
import { build as esbuildBuild } from "esbuild";

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


const ADMIN_PWA_OBFUSCATOR_OPTIONS = {
  ...OBFUSCATOR_OPTIONS,
  // The restored V3 Admin includes larger diagnostics and PWA scripts.
  // Keep the production obfuscator for the operational VÉRIX app unchanged.
  controlFlowFlattening: false,
  controlFlowFlatteningThreshold: 0,
  debugProtection: false,
  debugProtectionInterval: 0,
  selfDefending: false,
  stringArray: false,
  stringArrayCallsTransform: false,
  stringArrayIndexShift: false,
  stringArrayRotate: false,
  stringArrayShuffle: false,
  stringArrayThreshold: 0,
  splitStrings: false
};

function obfuscateHtml(html, label, optionsOverride = null) {
  const scriptPattern = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  let scriptCount = 0;

  const output = html.replace(scriptPattern, (full, open, source, close) => {
    const trimmed = String(source || "").trim();
    if (!trimmed || /src\s*=\s*["']/i.test(open)) return full;

    // Critical runtime blocks must remain executable. The heavy obfuscator
    // can interfere with browser lifecycle/telemetry code in legacy hosts.
    const idMatch = open.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const scriptId = idMatch ? String(idMatch[1]).toLowerCase() : "";
    if (scriptId === "verix-telemetry-v2" || scriptId === "verix-security-runtime" || scriptId === "verix-startup-controller" || scriptId === "verix-startup-failsafe" || scriptId === "verix-mobile-route-capture" || scriptId === "verix-startup-flag") {
      return full;
    }

    // Skip tiny bootstrappers / redirects — not worth the cost
    if (trimmed.length < 120) return full;

    scriptCount++;
    try {
      const options = optionsOverride || (trimmed.length >= 250_000
        ? COMPATIBILITY_OPTIONS
        : OBFUSCATOR_OPTIONS);
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
    // Use the current release identity for both mobile adapters. Match the
    // existing version instead of assuming an old hard-coded value: source
    // assets may already have been bumped independently of this builder.
    const mobileAdapterVersion = encodeURIComponent(String(BUILD_ID));
    function updateMobileAdapterReference(fileName) {
      const pattern = fileName === "verix-mobile.css"
        ? /verix-mobile\.css\?v=[^"'&\s<>]+/g
        : /verix-mobile\.js\?v=[^"'&\s<>]+/g;
      const matches = source.match(pattern) || [];
      if (matches.length === 0) {
        throw new Error("Mobile adapter reference not found in verix-app.html: " + fileName);
      }
      source = source.replace(pattern, fileName + "?v=" + mobileAdapterVersion);
    }
    updateMobileAdapterReference("verix-mobile.css");
    updateMobileAdapterReference("verix-mobile.js");
    if (!source.includes("verix-mobile.css?v=" + mobileAdapterVersion) ||
        !source.includes("verix-mobile.js?v=" + mobileAdapterVersion)) {
      throw new Error("Mobile adapter cache version was not updated in the secure build");
    }
  }

  // Inject authoritative styles after legacy inline styles. The handheld
  // startup controller keeps the body hidden until this exact style block has
  // been parsed; the finalizer then reveals the current UI in one paint.
  // This prevents obsolete notice styling from flashing before the final CSS.
  if (relativeSource === "verix-app.html") {
    const depthCssPath = path.join(ROOT, "verix-depth-ui.css");
    if (!fs.existsSync(depthCssPath)) {
      throw new Error("Required VÉRIX depth stylesheet missing: verix-depth-ui.css");
    }
    const depthCss = fs.readFileSync(depthCssPath, "utf8").trim();
    if (!depthCss) throw new Error("VÉRIX depth stylesheet is empty");

    const mobileFinalCssPath = path.join(ROOT, "verix-mobile-final.css");
    if (!fs.existsSync(mobileFinalCssPath)) {
      throw new Error("Required VÉRIX handheld stylesheet missing: verix-mobile-final.css");
    }
    const mobileFinalCss = fs.readFileSync(mobileFinalCssPath, "utf8").trim();
    if (!mobileFinalCss) throw new Error("VÉRIX handheld stylesheet is empty");

    if (!/<\/body>/i.test(source)) {
      throw new Error("Cannot inject VÉRIX stylesheets: closing </body> not found");
    }
    const mobileFinalizer = [
      '<script id="verix-mobile-finalize">',
      '(function(){',
      '  "use strict";',
      '  if(!window.__VERIX_MOBILE_ROUTE)return;',
      '  var root=document.documentElement;',
      '  var notice=document.getElementById("verixAsfNoticeOverlay");',
      '  if(notice)notice.setAttribute("aria-hidden","false");',
      '  root.classList.add("vx-mobile-ready");',
      '  try{document.dispatchEvent(new CustomEvent("verix:boot-complete"));}catch(e){}',
      '})();',
      '</script>'
    ].join("\n");
    source = source.replace(
      /<\/body>/i,
      '<style id="verix-depth-ui">\n' + depthCss + '\n</style>\n' +
      '<style id="verix-mobile-final-ui">\n' + mobileFinalCss + '\n</style>\n' +
      mobileFinalizer + '\n</body>'
    );  }

  if (relativeSource === "verix-app.html" && (!source.includes('id="verix-mobile-finalize"') || !source.includes('id="verix-mobile-final-ui"'))) {
    throw new Error("Handheld final style/reveal sequence is incomplete");
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

// Lightweight entry points (no heavy obfuscation needed).
// Reuse one app URL within a release, then change it on the next published build.
for (const f of ["index.html", "verix-mobile.html"]) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    const template = fs.readFileSync(src, "utf8");
    if (!template.includes("__VERIX_CACHE_VERSION__")) {
      throw new Error(`Missing __VERIX_CACHE_VERSION__ placeholder in ${f}`);
    }
    const versioned = template.replaceAll("__VERIX_CACHE_VERSION__", BUILD_ID);
    fs.writeFileSync(path.join(OUTPUT_DIR, f), versioned, "utf8");
    results.push({ source: f, output: `dist/${f}`, note: "versioned bootstrap (" + BUILD_ID + ")" });
  }
}

// Optional mobile assets
for (const f of ["verix-mobile.css", "verix-mobile.js"]) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUTPUT_DIR, f));
  }
}

// Dedicated Admin V3 bundle. This does not modify the operational app or its ASF runtime.
const presenceEntry = path.join(ROOT, "verix-presence-v1.mjs");
if (!fs.existsSync(presenceEntry)) throw new Error("Required Admin presence source missing: verix-presence-v1.mjs");
const presenceOutput = path.join(OUTPUT_DIR, "verix-presence-v1.js");
await esbuildBuild({
  entryPoints: [presenceEntry],
  outfile: presenceOutput,
  bundle: true,
  minify: true,
  sourcemap: false,
  legalComments: "none",
  platform: "browser",
  format: "iife",
  target: ["es2020"]
});
results.push({ source: "verix-presence-v1.mjs", output: "dist/verix-presence-v1.js", size_bytes: fs.statSync(presenceOutput).size });

const adminPolicySource = path.join(ROOT, "AI-ACCESS-POLICY.md");
if (!fs.existsSync(adminPolicySource)) throw new Error("Required Admin policy document missing");
fs.copyFileSync(adminPolicySource, path.join(OUTPUT_DIR, "AI-ACCESS-POLICY.md"));

const adminIconSource = path.join(ROOT, "assets", "admin-icon.svg");
if (!fs.existsSync(adminIconSource)) throw new Error("Required Admin icon missing");
const adminIconOutput = path.join(OUTPUT_DIR, "assets", "admin-icon.svg");
fs.mkdirSync(path.dirname(adminIconOutput), { recursive: true });
fs.copyFileSync(adminIconSource, adminIconOutput);

const adminManifestSource = path.join(ROOT, "admin.webmanifest");
if (!fs.existsSync(adminManifestSource)) throw new Error("Required Admin manifest source missing");
const adminManifest = JSON.parse(fs.readFileSync(adminManifestSource, "utf8"));
adminManifest.id = "/verix/admin/";
adminManifest.start_url = "./index.html?app=verix-admin-v5";
adminManifest.scope = "./";
adminManifest.icons = [{
  src: "../assets/admin-icon.svg",
  sizes: "any",
  type: "image/svg+xml",
  purpose: "any"
}];

const adminPwaSourcePath = path.join(ROOT, "admin_v2.html");
let adminPwaSource = fs.readFileSync(adminPwaSourcePath, "utf8");
if (!adminPwaSource.includes("admin-telemetry-v3") || !adminPwaSource.includes("stats-v2")) {
  throw new Error("Admin V3 source does not reference its expected telemetry APIs");
}
adminPwaSource = adminPwaSource.replace(/<link rel="manifest" href="[^"]*admin\.webmanifest[^"]*">\s*/i, "");
adminPwaSource = adminPwaSource.replace(/href="\.\/favicon\.svg/g, 'href="../assets/admin-icon.svg');
adminPwaSource = adminPwaSource.replace(/\.\/assets\//g, "../assets/");
adminPwaSource = adminPwaSource.replace(/src="\.\/verix-presence-v1\.js/g, 'src="../verix-presence-v1.js');
adminPwaSource = adminPwaSource.replace(/(src="\.\.\/verix-presence-v1\.js\?v=)[^"]+/g, "$1" + encodeURIComponent(String(BUILD_ID)));

// Fix the Admin live cards: browser Realtime presence is not populated by the
// operational client, while the server-side heartbeat API has authoritative
// short-lease presence data. Keep this patch Admin-only; do not touch verix-app
// or the ASF runtime.
function patchAdminPresenceUi(source) {
  const edits = [
    [
      "let serverTelemetryBusy=false,serverTelemetryRun=0,serverTelemetryQueriesLastHour=null;",
      "let serverTelemetryBusy=false,serverTelemetryRun=0,serverTelemetryQueriesLastHour=null,serverPresenceSnapshot=null;",
      "presence snapshot state"
    ],
    [
      "function clearServerTelemetry(message){\n  serverTelemetryQueriesLastHour=null;",
      "function clearServerTelemetry(message){\n  serverPresenceSnapshot=null;\n  serverTelemetryQueriesLastHour=null;",
      "clear stale server snapshot"
    ],
    [
      "  if(dashboardData)renderAll();\n}",
      "  if(dashboardData)renderAll();\n  if(window.VERIX_LIVE_PRESENCE&&typeof window.VERIX_LIVE_PRESENCE.snapshot==='function')renderLivePresence(window.VERIX_LIVE_PRESENCE.snapshot());\n}",
      "rerender after server telemetry clears"
    ],
    [
      "    if(!result||result.ok!==true||!p||typeof p!=='object')throw new Error('Resposta de telemetria inválida.');\n    const count=value=>",
      "    if(!result||result.ok!==true||!p||typeof p!=='object')throw new Error('Resposta de telemetria inválida.');\n    serverPresenceSnapshot=p;\n    const count=value=>",
      "store authoritative server presence"
    ],
    [
      "  setValue('livePresenceOnline',ready?s.onlineInstallations:null);\n  setValue('livePresenceActive',ready?s.activeInstallations:null);",
      "  const serverPresence=serverPresenceSnapshot&&typeof serverPresenceSnapshot==='object'?serverPresenceSnapshot:null;\n  const parsePresenceCount=value=>value!==null&&value!==undefined&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;\n  const serverOnline=serverPresence?parsePresenceCount(serverPresence.online_now):null;\n  const users=dashboardData&&dashboardData.users&&typeof dashboardData.users==='object'?dashboardData.users:{};\n  const serverActive=parsePresenceCount(users.activeInstallations);\n  setValue('livePresenceOnline',serverOnline!==null?serverOnline:(ready?s.onlineInstallations:null));\n  setValue('livePresenceActive',serverActive!==null?serverActive:(ready?s.activeInstallations:null));",
      "use server counts in live cards"
    ],
    [
      "const cls=ready?'online':(s.status==='locked'?'loading':(s.status==='unavailable'?'offline':(s.status==='reconnecting'?'offline':'loading')));",
      "const cls=(serverOnline!==null||ready)?'online':(s.status==='locked'?'loading':(s.status==='unavailable'?'offline':(s.status==='reconnecting'?'offline':'loading')));",
      "server status badge"
    ],
    [
      "const label=ready?'Ligado · tempo real':(s.status==='locked'?'Inicia sessão':(s.status==='unavailable'?'Indisponível':(s.status==='reconnecting'?'A recuperar ligação':'A ligar')));",
      "const label=serverOnline!==null?'Ligado · servidor':(ready?'Ligado · tempo real':(s.status==='locked'?'Inicia sessão':(s.status==='unavailable'?'Indisponível':(s.status==='reconnecting'?'A recuperar ligação':'A ligar'))));",
      "server status label"
    ],
    [
      "    if(ready&&s.observedAt){\n      const time=new Date(s.observedAt);\n      updated.textContent='Presença sincronizada em tempo real · última sincronização '+time.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'.';",
      "    if(serverOnline!==null&&serverPresence&&serverPresence.observed_at){\n      const time=new Date(serverPresence.observed_at);\n      updated.textContent='Presença confirmada no servidor · última leitura '+time.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · janela de 90 s.';\n    }else if(ready&&s.observedAt){\n      const time=new Date(s.observedAt);\n      updated.textContent='Presença sincronizada em tempo real · última sincronização '+time.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'.';",
      "server-based freshness label"
    ],
    [
      "Ligações Realtime ativas neste momento; não são pessoas únicas.",
      "Instalações com sinal do servidor nos últimos 90 s; não equivale a pessoas únicas.",
      "accurate live metric note"
    ],
    [
      "    setServerTelemetryStatus('online','API confirmada');",
      "    setServerTelemetryStatus('online','API confirmada');\n    if(window.VERIX_LIVE_PRESENCE&&typeof window.VERIX_LIVE_PRESENCE.snapshot==='function')renderLivePresence(window.VERIX_LIVE_PRESENCE.snapshot());",
      "rerender when server presence arrives"
    ],
    [
      "    dashboardData=res.data;renderAll();setStatus('online','Backend online');lastUpdated=Date.now();",
      "    dashboardData=res.data;renderAll();if(window.VERIX_LIVE_PRESENCE&&typeof window.VERIX_LIVE_PRESENCE.snapshot==='function')renderLivePresence(window.VERIX_LIVE_PRESENCE.snapshot());setStatus('online','Backend online');lastUpdated=Date.now();",
      "refresh active count after dashboard data arrives"
    ]
  ];
  for (const [before, after, label] of edits) {
    const first = source.indexOf(before);
    if (first < 0) throw new Error("Admin presence patch marker missing: " + label);
    if (source.indexOf(before, first + before.length) >= 0) {
      throw new Error("Admin presence patch marker duplicated: " + label);
    }
    source = source.slice(0, first) + after + source.slice(first + before.length);
  }
  return source;
}
adminPwaSource = patchAdminPresenceUi(adminPwaSource);

adminPwaSource = adminPwaSource.replace(/\.\/AI-ACCESS-POLICY\.md/g, "../AI-ACCESS-POLICY.md");
const adminPwaHeadLinks = [
  '  <link rel="icon" href="../assets/admin-icon.svg" type="image/svg+xml" sizes="any">',
  '  <link rel="manifest" href="./manifest.webmanifest?v=' + encodeURIComponent(String(BUILD_ID)) + '">'
];
if (!/<\/head>/i.test(adminPwaSource)) throw new Error("Admin V3 source has no closing head");
adminPwaSource = adminPwaSource.replace(/<\/head>/i, adminPwaHeadLinks.join("\n") + "\n</head>");

const adminPwaBuilt = obfuscateHtml(adminPwaSource, "admin/index.html", ADMIN_PWA_OBFUSCATOR_OPTIONS);
const adminPwaDir = path.join(OUTPUT_DIR, "admin");
fs.mkdirSync(adminPwaDir, { recursive: true });
const adminPwaOutput = path.join(adminPwaDir, "index.html");
fs.writeFileSync(adminPwaOutput, adminPwaBuilt.html, "utf8");
fs.writeFileSync(path.join(adminPwaDir, "manifest.webmanifest"), JSON.stringify(adminManifest, null, 2) + "\n", "utf8");
const adminServiceWorker = path.join(ROOT, "sw.js");
if (!fs.existsSync(adminServiceWorker)) throw new Error("Required Admin service worker missing");
fs.copyFileSync(adminServiceWorker, path.join(adminPwaDir, "sw.js"));
if (verifyJavaScriptSyntax(adminPwaOutput) === 0) throw new Error("Admin V3 bundle has no validated inline JavaScript");
results.push({
  source: "admin_v2.html",
  output: "dist/admin/index.html",
  script_blocks_obfuscated: adminPwaBuilt.scriptCount,
  size_bytes: Buffer.byteLength(adminPwaBuilt.html, "utf8")
});

// Release-time runtime invariants. These critical blocks are intentionally
// excluded from heavy obfuscation and must survive packaging unchanged enough
// to expose their endpoint, heartbeat and security runtime markers.
function extractInlineScript(html, id) {
  const opener = new RegExp('<script[^>]*id=[\"\\\']' + id + '[\"\\\'][^>]*>', 'i');
  const match = html.match(opener);
  if (!match || match.index == null) return null;
  const contentStart = match.index + match[0].length;
  const contentEnd = html.indexOf('</script>', contentStart);
  if (contentEnd < 0) return null;
  return html.slice(contentStart, contentEnd);
}

function verifyCriticalRuntime(outputPath) {
  const html = fs.readFileSync(outputPath, "utf8");
  const telemetry = extractInlineScript(html, "verix-telemetry-v2");
  const security = extractInlineScript(html, "verix-security-runtime");
  if (!telemetry) throw new Error("Critical telemetry runtime block missing from secure build");
  if (!/telemetry-v2/i.test(telemetry)) throw new Error("Critical telemetry endpoint marker missing");
  if (!/heartbeat/i.test(telemetry)) throw new Error("Critical telemetry heartbeat marker missing");
  if (!security) throw new Error("Critical security runtime block missing from secure build");
  if (!security.includes("var BUILD_ID = '" + BUILD_ID + "'")) {
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

// The admin panel is shipped in the same secure Pages artifact. Parse its
// inline JavaScript at release time as well so syntax regressions are caught
// before they can break the deployed dashboard.
const adminOutput = path.join(OUTPUT_DIR, "admin_v2.html");
if (fs.existsSync(adminOutput)) {
  const adminScriptsChecked = verifyJavaScriptSyntax(adminOutput);
  if (adminScriptsChecked === 0) {
    throw new Error("Admin panel does not contain any validated inline JavaScript");
  }
}

if (!fs.existsSync(adminPwaOutput)) throw new Error("Dedicated Admin PWA entry was not generated");
if (verifyJavaScriptSyntax(adminPwaOutput) === 0) {
  throw new Error("Admin PWA entry does not contain any validated inline JavaScript");
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
