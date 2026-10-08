import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["v2", "src"];
const SOURCE_EXTENSIONS = new Set([".html", ".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) inspect(full);
  }
}

function inspect(file) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).replaceAll(path.sep, "/");
  const lines = text.split(/\r?\n/);

  const checks = [
    { re: /\bon(?:click|input|change|submit|load|error|keydown|keyup|touchstart|touchend)\s*=/i, code: "inline-event-handler" },
    { re: /javascript\s*:/i, code: "javascript-url" },
    { re: /\beval\s*\(/, code: "eval" },
    { re: /\bnew\s+Function\s*\(/, code: "function-constructor" }
  ];

  for (const [lineNumber, line] of lines.entries()) {
    for (const check of checks) {
      if (check.re.test(line)) {
        violations.push({ file: rel, line: lineNumber + 1, code: check.code });
      }
    }
  }
}

for (const dir of TARGET_DIRS) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full)) walk(full);
}

if (violations.length) {
  console.error("V2 security policy violations:");
  for (const violation of violations) {
    console.error(
      violation.file + ":" + violation.line + " " + violation.code
    );
  }
  process.exit(1);
}

console.log("✓ V2 source security policy passed.");
