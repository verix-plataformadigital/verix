import fs from "node:fs";
import path from "node:path";

const publishDirectory = path.resolve(
  process.argv[2] ?? "windows/VerixPortable/bin/Release/net10.0-windows/win-x64/publish"
);

function fail(message) {
  console.error("Portable package verification failed: " + message);
  process.exit(1);
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(label + " is missing: " + filePath);
  }
}

function walkFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(fullPath));
    else result.push(fullPath);
  }
  return result;
}

const executable = path.join(publishDirectory, "VERIX.exe");
const launcher = path.join(publishDirectory, "Run-V2-Local.cmd");
const assetsRoot = path.join(publishDirectory, "v2-assets");
const indexPath = path.join(assetsRoot, "index.html");

requireFile(executable, "Portable Windows executable");
requireFile(launcher, "Local V2 launcher");
requireFile(indexPath, "Packaged V2 entry point");

const launcherText = fs.readFileSync(launcher, "utf8");
if (!launcherText.includes("VERIX.exe") || !launcherText.includes("--v2-local")) {
  fail("Run-V2-Local.cmd must launch VERIX.exe with --v2-local.");
}

const html = fs.readFileSync(indexPath, "utf8");
const assetNames = Array.from(
  html.matchAll(/(?:src|href)=["']\.\/assets\/([^"']+)["']/g),
  match => decodeURIComponent(match[1])
);
const scripts = assetNames.filter(name => /\.m?js$/i.test(name));
const stylesheets = assetNames.filter(name => /\.css$/i.test(name));

if (scripts.length === 0) fail("The V2 entry point does not reference a JavaScript bundle.");
if (stylesheets.length === 0) fail("The V2 entry point does not reference a CSS bundle.");

for (const assetName of assetNames) {
  const assetPath = path.join(assetsRoot, "assets", assetName);
  requireFile(assetPath, "Referenced V2 asset");
}

const files = walkFiles(publishDirectory);
const sourceMaps = files.filter(filePath => filePath.toLowerCase().endsWith(".map"));
if (sourceMaps.length > 0) {
  fail("Source maps must not be included in the Windows package: " + sourceMaps.join(", "));
}

const debugSymbols = files.filter(filePath => filePath.toLowerCase().endsWith(".pdb"));
if (debugSymbols.length > 0) {
  fail("Debug symbol files must not be included in the Windows package: " + debugSymbols.join(", "));
}

console.log(
  "Portable V2 package verified: executable, local launcher, entry point, " +
  assetNames.length + " referenced JS/CSS assets; no source maps or debug symbols."
);
