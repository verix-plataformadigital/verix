#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const warnings = [];

function fail(msg) { failures.push(msg); }
function warn(msg) { warnings.push(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const app = read("verix-app.html");
const edgePaths = [
  "supabase/functions/admin-auth-v2/index.ts",
  "supabase/functions/asf-proxy-v1/index.ts",
  "supabase/functions/hourly-history-v2/index.ts",
  "supabase/functions/stats-v2/index.ts",
  "supabase/functions/telemetry-v2/index.ts"
];

// HTML IDs must be unique.
const ids = [...app.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
const idCounts = new Map();
for (const id of ids) idCounts.set(id, (idCounts.get(id) || 0) + 1);
for (const [id, n] of idCounts) if (n > 1) fail(`Duplicate HTML id: ${id} (${n}x)`);

// Script/style tag IDs must be unique.
for (const kind of ["script", "style"]) {
  const seen = new Map();
  const re = new RegExp(`<${kind}\\\\b[^>]*\\\\bid=["']([^"']+)["']`, "gi");
  for (const m of app.matchAll(re)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  for (const [id, n] of seen) if (n > 1) fail(`Duplicate <${kind} id>: ${id} (${n}x)`);
}

// Inline JS must remain syntactically valid.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verix-audit-"));
try {
  let idx = 0;
  const scriptRe = /<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi;
  for (const m of app.matchAll(scriptRe)) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(attrs)) continue;
    const file = path.join(tempDir, `inline-${String(++idx).padStart(3, "0")}.js`);
    fs.writeFileSync(file, body);
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (e) {
      fail(`Inline script syntax error in ${path.basename(file)}: ${String(e.stderr || e.stdout || e.message).trim()}`);
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ASF client contract.
const defReserve = (app.match(/\basync\s+function\s+reservarSlotFisicoASF\s*\(/g) || []).length;
const callReserve = (app.match(/\bawait\s+reservarSlotFisicoASF\s*\(/g) || []).length;
if (defReserve !== 1) fail(`reservarSlotFisicoASF definition count = ${defReserve}, expected 1`);
if (callReserve < 1) fail("efetuarPedidoHttpASF no longer reserves a physical slot");
if (!/\bfunction\s+efetuarPedidoHttpASF\b[\s\S]*?reservarSlotFisicoASF/.test(app)) {
  fail("ASF HTTP path does not call reservarSlotFisicoASF");
}
if (!/\bfunction\s+interpretarRespostaASF\b[\s\S]*?node\.license\s*!==\s*undefined[\s\S]*?node\.license\s*!==\s*null/.test(app)) {
  fail("ASF result semantics no longer enforce node.license != null");
}
if (!/heroTitle\s*=\s*diasRestantes/.test(app)) {
  fail("ASF success UI is not tied to policy validity");
}

// No obsolete duplicate boot injector.
if (app.includes('id="verix-fx-holo-scan-inject"')) {
  fail("Obsolete verix-fx-holo-scan-inject is present");
}

// Backend CORS contract.
for (const rel of edgePaths) {
  const s = read(rel);
  if (/Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*/.test(s)) {
    fail(`Wildcard CORS remains in ${rel}`);
  }
  const count = (s.match(/const\s+ALLOWED_ORIGINS\s*=\s*new\s+Set/g) || []).length;
  if (count > 1) fail(`Duplicate ALLOWED_ORIGINS declaration in ${rel}`);
}
const relay = read("supabase/functions/asf-proxy-v1/index.ts");
if (!/new\s+Response\(text,[\s\S]*?\.\.\.corsHeaders\(req\)/.test(relay)) {
  fail("ASF relay success response does not include request-aware CORS headers");
}

// Report CSS complexity without blocking intentionally staged cleanup.
const important = (app.match(/!important\b/g) || []).length;
const styleCount = (app.match(/<style\b/gi) || []).length;
if (important > 5000) warn(`verix-app.html still contains ${important} !important declarations`);
if (styleCount > 100) warn(`verix-app.html still contains ${styleCount} <style> blocks`);

console.log(`VERIX audit: ${failures.length ? "FAIL" : "PASS"}`);
console.log(`HTML IDs: ${ids.length} unique`);
console.log(`CSS: ${styleCount} style blocks, ${important} !important`);
for (const w of warnings) console.log(`WARN: ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`ERROR: ${f}`);
  process.exitCode = 1;
}
