import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JavaScriptObfuscator from "javascript-obfuscator";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "verix-app.html");
const OUTPUT_DIR = path.join(ROOT, "dist");
const OUTPUT = path.join(OUTPUT_DIR, "verix-app.html");

const BUILD_ID = process.env.VERIX_BUILD_ID || "1.5-sec-20261008-a";

if (!fs.existsSync(INPUT)) {
  throw new Error("verix-app.html not found");
}

const html = fs.readFileSync(INPUT, "utf8");
const scriptPattern = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;

let scriptCount = 0;
const output = html.replace(scriptPattern, (full, open, source, close) => {
  const trimmed = String(source || "").trim();
  if (!trimmed || /src\s*=\s*["']/i.test(open)) return full;

  scriptCount++;
  const result = JavaScriptObfuscator.obfuscate(trimmed, {
    target: "browser-no-eval",
    compact: true,
    simplify: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.45,
    deadCodeInjection: false,
    debugProtection: true,
    debugProtectionInterval: 0,
    disableConsoleOutput: true,
    domainLock: [
      "verix.vxops.workers.dev",
      "verix-plataformadigital.github.io"
    ],
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
      "^ActiveXObject$"
    ],
    selfDefending: true,
    sourceMap: false,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.75,
    transformObjectKeys: false,
    unicodeEscapeSequence: false
  }).getObfuscatedCode();

  return open + "\n" + result + "\n" + close;
});

const secureHtml = output;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, secureHtml, "utf8");

const sha256 = createHash("sha256").update(secureHtml).digest("hex");
fs.writeFileSync(
  path.join(OUTPUT_DIR, "build-manifest.json"),
  JSON.stringify({
    build_id: BUILD_ID,
    source_file: "verix-app.html",
    output_file: "dist/verix-app.html",
    sha256,
    script_blocks_obfuscated: scriptCount,
    source_maps: false,
    generated_at: new Date().toISOString()
  }, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify({
  build_id: BUILD_ID,
  output: "dist/verix-app.html",
  sha256,
  script_blocks_obfuscated: scriptCount
}, null, 2));
