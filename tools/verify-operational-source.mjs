import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {readOperationalManifest,readOperationalSource} from "./lib/operational-source.mjs";
const root=process.cwd(),manifest=readOperationalManifest(root),html=readOperationalSource(root),blocks=manifest.blocks;
const styles=[...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi)];
const scripts=[...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi)];
const inline=scripts.filter(m=>!/\bsrc\s*=\s*["']/i.test(m[1]||""));
assert.equal(blocks.length,manifest.expectedCounts.total);
assert.equal(styles.length,manifest.expectedCounts.styles);
assert.equal(inline.length,manifest.expectedCounts.inlineScripts);
for(const p of manifest.partials||[])assert.ok(fs.existsSync(path.join(root,"src","operational",p.file)),"Missing HTML partial: "+p.file);
for(const b of blocks){
 const paths=Array.isArray(b.parts)&&b.parts.length?b.parts:[b.file];
 for(const file of paths)assert.ok(fs.existsSync(path.join(root,"src","operational",file)),"Missing module: "+file);
}
const sourceFiles=blocks.flatMap(b=>Array.isArray(b.parts)&&b.parts.length?b.parts:[b.file]);
assert.equal(sourceFiles.length,manifest.physicalSourceFiles,"Physical source-module inventory changed.");
assert.equal(new Set(sourceFiles).size,sourceFiles.length,"Duplicate physical source-module path.");
for(const s of ["verix-telemetry-v2","verix-gate-v1","asf-proxy-v1","verix-mobile.css?v=10","verix-mobile.js?v=10","verix-presence-v1.js?v="])assert.ok(html.includes(s),"Missing runtime token: "+s);
assert.ok(!html.includes("openToken"),"Per-open cache token regression.");
assert.ok(!/\/functions\/v1\/telemetry(?:['"?\s]|$)/.test(html),"Retired telemetry endpoint.");
assert.doesNotMatch(html,/<!-- @verix:module:\d{4} -->/);
console.log("PASS: operational modules, critical paths, counts and compatibility.");
