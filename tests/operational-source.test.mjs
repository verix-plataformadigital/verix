import test from "node:test";
import assert from "node:assert/strict";
import {readOperationalManifest,readOperationalSource} from "../tools/lib/operational-source.mjs";
import fs from "node:fs";
import path from "node:path";
test("manifest paths, markers and order are unique",()=>{
 const m=readOperationalManifest();
 assert.equal(m.blocks.length,m.expectedCounts.total);
 const files=m.blocks.flatMap(x=>Array.isArray(x.parts)&&x.parts.length?x.parts:[x.file]);
 assert.equal(new Set(files).size,files.length);
 assert.equal(files.length,m.physicalSourceFiles);
 assert.equal(m.blocks.find(x=>x.ordinal===8).parts.length,7);
 assert.equal(m.partials.length,1);
 assert.equal(m.partials[0].file,"partials/legislacao.html");
 assert.ok(fs.existsSync(path.join(process.cwd(),"src","operational",m.partials[0].file)));
 assert.equal(new Set(m.blocks.map(x=>x.marker)).size,m.blocks.length);
 assert.deepEqual(m.blocks.map(x=>x.ordinal),m.blocks.map((_,i)=>i+1));
});
test("assembled HTML contains original inline blocks without placeholders",()=>{
 const m=readOperationalManifest(),html=readOperationalSource();
 assert.doesNotMatch(html,/<!-- @verix:module:\d{4} -->/);
 assert.equal([...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi)].length,26);
 const scripts=[...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi)];
 assert.equal(scripts.filter(x=>!/\bsrc\s*=\s*["']/i.test(x[1]||"")).length,34);
 assert.equal(m.blocks.length,60);
 assert.ok(html.includes("leg-search-new"));
 assert.ok(!html.includes("__VERIX_PARTIAL_LEGISLATION_HTML__"));
});
test("ASF, security gate and current telemetry routes remain present",()=>{
 const html=readOperationalSource();
 assert.match(html,/functions\/v1\/telemetry-v2/);
 assert.match(html,/functions\/v1\/asf-proxy-v1/);
 assert.match(html,/functions\/v1\/verix-gate-v1/);
 assert.match(html,/verix-fresh-mobile-assets/);
 assert.match(html,/verix-security-runtime/);
});
