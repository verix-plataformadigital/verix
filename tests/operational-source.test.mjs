import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  readOperationalManifest,
  readOperationalSource,
} from "../tools/lib/operational-source.mjs";

const sourceDirectory = path.join(process.cwd(), "src", "operational");

test("source manifest contains unique paths, markers and ordered blocks", () => {
  const manifest = readOperationalManifest();
  const sourceFiles = manifest.blocks.flatMap((block) =>
    Array.isArray(block.parts) && block.parts.length > 0
      ? block.parts
      : [block.file]
  );

  assert.equal(manifest.blocks.length, manifest.expectedCounts.total);
  assert.equal(manifest.blocks.length, 60);
  assert.equal(sourceFiles.length, manifest.physicalSourceFiles);
  assert.equal(new Set(sourceFiles).size, sourceFiles.length);
  assert.equal(new Set(manifest.blocks.map((block) => block.marker)).size, manifest.blocks.length);
  assert.deepEqual(
    manifest.blocks.map((block) => block.ordinal),
    manifest.blocks.map((_, index) => index + 1),
  );

  assert.equal(manifest.blocks.find((block) => block.ordinal === 8).parts.length, 7);
  assert.equal(manifest.blocks.find((block) => block.ordinal === 60).parts.length, 3);
  assert.equal(manifest.partials.length, 1);
  assert.equal(manifest.partials[0].file, "partials/legislacao.html");

  for (const relativePath of [...sourceFiles, ...manifest.partials.map((partial) => partial.file)]) {
    assert.ok(
      fs.existsSync(path.join(sourceDirectory, relativePath)),
      "Missing source file: " + relativePath,
    );
  }
});

test("assembly restores one stylesheet/script per logical block and resolves the static partial", () => {
  const manifest = readOperationalManifest();
  const html = readOperationalSource();
  const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi)];
  const scripts = [...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi)];
  const inlineScripts = scripts.filter(
    (match) => !/\bsrc\s*=\s*["']/i.test(match[1] || ""),
  );
  const partialContent = fs.readFileSync(
    path.join(sourceDirectory, manifest.partials[0].file),
    "utf8",
  );

  assert.equal(styles.length, 26);
  assert.equal(inlineScripts.length, 34);
  assert.doesNotMatch(html, /<!-- @verix:module:\d{4} -->/);
  assert.ok(!html.includes("__VERIX_PARTIAL_LEGISLATION_HTML__"));
  assert.ok(html.includes("html: " + JSON.stringify(partialContent)));
  assert.ok(html.includes("leg-search-new"));
  assert.ok(html.includes("VÉRIX-ASF-GREEN-RELAYOUT-V3"));
});

test("ASF, security gate and current telemetry routes remain present", () => {
  const html = readOperationalSource();

  assert.match(html, /functions\/v1\/telemetry-v2/);
  assert.match(html, /functions\/v1\/asf-proxy-v1/);
  assert.match(html, /functions\/v1\/verix-gate-v1/);
  assert.match(html, /verix-fresh-mobile-assets/);
  assert.match(html, /verix-security-runtime/);
});
