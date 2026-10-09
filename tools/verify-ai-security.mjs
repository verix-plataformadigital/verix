import assert from "node:assert/strict";
import fs from "node:fs";

const policy = fs.readFileSync("AI-ACCESS-POLICY.md", "utf8");
const robots = fs.readFileSync("robots.txt", "utf8");
const build = fs.readFileSync("tools/build-secure-release.mjs", "utf8");
const pages = [
  fs.readFileSync("index.html", "utf8"),
  fs.readFileSync("verix-mobile.html", "utf8"),
  fs.readFileSync("admin_v2.html", "utf8")
];

assert.match(policy, /This is a request for responsible handling, not a technical access control/i);
assert.match(policy, /does **not** replace the host-root/i);
assert.match(policy, /não garante que os modelos ou rastreadores o cumpram/i);
assert.match(robots, /User-agent: GPTBot/);
assert.match(robots, /User-agent: OAI-SearchBot/);
assert.match(build, /function addAiAccessNotice\(html\)/);
assert.match(build, /<head\\b/);
assert.match(build, /AI-ACCESS-POLICY\.md/);
assert.match(build, /robots\.txt/);
for (const [i, html] of pages.entries()) {
  assert.match(html, /name="verix-ai-policy"/, "AI-use policy metadata missing from entry " + i);
}
for (const path of ["supabase/functions/asf-proxy-v1/index.ts","supabase/functions/verix-gate-v1/index.ts"]) {
  assert.ok(fs.existsSync(path), "Expected existing ASF integration file " + path);
}
console.log("PASS: public AI-use notice, advisory crawler preferences, secure-build injection, and unchanged ASF integration paths.");
