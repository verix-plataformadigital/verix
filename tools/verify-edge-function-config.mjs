import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const functionsRoot = path.join(root, "supabase", "functions");
const configPath = path.join(root, "supabase", "config.toml");

// An explicit inventory prevents a new or retired Edge Function from silently
// inheriting an accidental JWT setting. Update this map only after reviewing
// the function's own authentication contract.
const expected = new Map([
  ["admin-auth-v2", false],
  ["admin-telemetry-v3", false],
  ["asf-proxy-v1", false],
  ["hourly-history-v2", false],
  ["stats-v2", false],
  ["telemetry-v2", false],
  ["verix-admin-pwa", false],
  ["verix-gate-v1", false],

  ["asf-ab-test-7d3c9", true],
  ["asf-egress-scope-probe-20261028", true],
  ["asf-error-probe-13c9a", true],
  ["asf-url-encoding-ab-20261028", true],
  ["runtime-asf-proxy-single-probe", true],
  ["runtime-httpclient-probe", true],
  ["runtime-proxy-pool-probe", true],
  ["runtime-proxy-probe", true],
  ["tmp-egress-probe-9f4a7", true],
]);

function fail(message) {
  console.error("VÉRIX Edge Function configuration audit: " + message);
  process.exitCode = 1;
}

if (!fs.existsSync(functionsRoot) || !fs.existsSync(configPath)) {
  fail("required Supabase functions directory or config.toml is missing");
  process.exit(1);
}

const actualDirectories = fs.readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name)
  .sort();

const config = fs.readFileSync(configPath, "utf8");
const configured = new Map();
let currentFunction = null;

const seenJwtSettings = new Set();

for (const line of config.split(/\r?\n/)) {
  // Reset the function context for every TOML table, including array tables.
  // This prevents a later unrelated section from inheriting the preceding function.
  const section = line.match(/^\s*(\[{1,2})([^\]]+)(\]{1,2})\s*(?:#.*)?$/);
  if (section) {
    currentFunction = null;
    if (section[1].length !== section[3].length) {
      fail("malformed TOML section header: " + line.trim());
      continue;
    }

    const functionSection = section[2].trim().match(/^functions\.([a-z0-9-]+)$/i);
    if (section[1] === "[" && functionSection) {
      currentFunction = functionSection[1];
      if (configured.has(currentFunction)) {
        fail("duplicate config section for " + currentFunction);
      }
      configured.set(currentFunction, null);
    }
    continue;
  }

  if (!currentFunction || /^\s*(?:#.*)?$/.test(line)) continue;

  if (/^\s*verify_jwt\s*=/i.test(line)) {
    if (seenJwtSettings.has(currentFunction)) {
      fail("duplicate verify_jwt setting for " + currentFunction);
      continue;
    }
    seenJwtSettings.add(currentFunction);

    const jwt = line.match(/^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/i);
    if (!jwt) {
      fail("malformed verify_jwt setting for " + currentFunction);
      continue;
    }
    configured.set(currentFunction, jwt[1].toLowerCase() === "true");
  }
}

const expectedNames = [...expected.keys()].sort();
const configuredNames = [...configured.keys()].sort();

for (const name of expectedNames) {
  if (!actualDirectories.includes(name)) fail("expected function folder is missing: " + name);
  if (!configured.has(name)) fail("function has no config section: " + name);
  if (configured.has(name) && configured.get(name) === null) {
    fail("verify_jwt is missing or malformed for " + name);
  }
  if (configured.has(name) && configured.get(name) !== null &&
      configured.get(name) !== expected.get(name)) {
    fail(name + " must have verify_jwt = " + expected.get(name));
  }
  if (actualDirectories.includes(name) &&
      !fs.existsSync(path.join(functionsRoot, name, "index.ts"))) {
    fail("function entrypoint is missing: " + name + "/index.ts");
  }
}

for (const name of actualDirectories) {
  if (!expected.has(name)) fail("unreviewed function folder: " + name);
}
for (const name of configuredNames) {
  if (!expected.has(name)) fail("unreviewed config section: " + name);
}

if (process.exitCode) {
  console.error("Expected function inventory: " + expectedNames.join(", "));
  console.error("Configured inventory: " + configuredNames.join(", "));
  process.exit(1);
}

console.log(
  "VÉRIX Edge Function configuration audit passed: " +
  expected.size + " function folders, matching config sections and JWT policies."
);
