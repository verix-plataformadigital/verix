import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  readOperationalManifest,
  readOperationalSource,
} from "./lib/operational-source.mjs";

const root = process.cwd();
const sourceDirectory = path.join(root, "src", "operational");
const manifest = readOperationalManifest(root);
const html = readOperationalSource(root);
const blocks = manifest.blocks;

const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi)];
const scripts = [...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi)];
const inlineScripts = scripts.filter(
  (match) => !/\bsrc\s*=\s*["']/i.test(match[1] || ""),
);

assert.equal(blocks.length, manifest.expectedCounts.total, "Logical block count changed.");
assert.equal(styles.length, manifest.expectedCounts.styles, "CSS block count changed.");
assert.equal(
  inlineScripts.length,
  manifest.expectedCounts.inlineScripts,
  "Inline JavaScript block count changed.",
);

for (const partial of manifest.partials || []) {
  assert.ok(
    fs.existsSync(path.join(sourceDirectory, partial.file)),
    "Missing HTML partial: " + partial.file,
  );
}

const sourceFiles = [];
for (const block of blocks) {
  const paths = Array.isArray(block.parts) && block.parts.length > 0
    ? block.parts
    : [block.file];

  for (const relativePath of paths) {
    assert.ok(
      fs.existsSync(path.join(sourceDirectory, relativePath)),
      "Missing source module: " + relativePath,
    );
    sourceFiles.push(relativePath);
  }
}

assert.equal(
  sourceFiles.length,
  manifest.physicalSourceFiles,
  "Physical source-module inventory changed.",
);
assert.equal(
  new Set(sourceFiles).size,
  sourceFiles.length,
  "Duplicate physical source module detected.",
);

const requiredTokens = [
  "verix-telemetry-v2",
  "verix-gate-v1",
  "asf-proxy-v1",
  "verix-mobile.css?v=10",
  "verix-mobile.js?v=10",
  "verix-presence-v1.js?v=",
  "VÉRIX-ASF-GREEN-RELAYOUT-V3",
];

for (const token of requiredTokens) {
  assert.ok(html.includes(token), "Missing operational runtime token: " + token);
}

assert.ok(!html.includes("openToken"), "Per-open cache token regression detected.");
assert.ok(
  !/\/functions\/v1\/telemetry(?:['"?\s]|$)/.test(html),
  "Retired telemetry endpoint reference detected.",
);
assert.doesNotMatch(html, /<!-- @verix:module:\d{4} -->/);
assert.ok(!html.includes("__VERIX_PARTIAL_LEGISLATION_HTML__"), "Unresolved HTML partial marker.");

console.log("PASS: operational modules, critical paths, source inventory and compatibility.");
