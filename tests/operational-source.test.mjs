import test from "node:test";
import assert from "node:assert/strict";
import {readOperationalManifest,readOperationalSource} from "../tools/lib/operational-source.mjs";
test("manifest paths, markers and order are unique",()=>{
 const m=readOperationalManifest();
 assert.equal(m.blocks.length,m.expectedCounts.total);
 assert.equal(new Set(m.blocks.map(x=>x.file)).size,m.blocks.length);
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
});
test("ASF, security gate and current telemetry routes remain present",()=>{
 const html=readOperationalSource();
 assert.match(html,/functions\/v1\/telemetry-v2/);
 assert.match(html,/functions\/v1\/asf-proxy-v1/);
 assert.match(html,/functions\/v1\/verix-gate-v1/);
 assert.match(html,/verix-fresh-mobile-assets/);
 assert.match(html,/verix-security-runtime/);
});
