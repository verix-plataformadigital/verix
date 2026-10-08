import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_DIR = path.resolve(process.argv[2] || "audit-output");
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "dist-v2", "coverage", "tmp", "audit-output"]);
const TEXT_EXTENSIONS = new Set([".html",".css",".js",".mjs",".cjs",".ts",".tsx",".json",".sql",".md",".yml",".yaml",".cs",".csproj",".toml",".xml"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name)));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(ext)) out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

const files = walk(ROOT);
const rows = [];
const symbolIndex = new Map();
const endpointSet = new Set();
const tableSet = new Set();
const rpcSet = new Set();

for (const file of files) {
  const content = read(file);
  const rel = relative(file);
  if (!content && fs.statSync(file).size > 0) continue;

  const ext = path.extname(file).toLowerCase();
  const lines = content.split(/\r?\n/);
  const functionNames = [];
  const imports = [];
  const ids = [];
  const listeners = [];
  const inlineHandlers = [];
  const dynamicCode = [];
  const htmlInnerHtml = [];
  const globalPatterns = [];
  const cssSelectors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;

    const fnPatterns = [
      /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
      /\b(?:public|private|protected|static)?\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*\{/g
    ];
    for (const re of fnPatterns) {
      while ((m = re.exec(line))) {
        const name = m[1];
        if (name && !["if","for","while","switch","catch","function"].includes(name)) {
          functionNames.push(name);
          const arr = symbolIndex.get(name) || [];
          arr.push(rel + ":" + (i + 1));
          symbolIndex.set(name, arr);
        }
      }
    }

    if (/\b(?:import|export)\b/.test(line)) imports.push(i + 1);
    if (/addEventListener\s*\(/.test(line)) listeners.push(i + 1);
    if (/\bon(?:click|input|change|submit|load|error|keydown|keyup|touchstart|touchend)\s*=/.test(line)) inlineHandlers.push(i + 1);
    if (/\b(?:eval|new Function|Function\s*\()/.test(line)) dynamicCode.push(i + 1);
    if (/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/.test(line)) htmlInnerHtml.push(i + 1);
    if (/\b(?:window|globalThis)\s*\.[A-Za-z_$]/.test(line)) globalPatterns.push(i + 1);

    if (ext === ".html") {
      const idRe = /\bid\s*=\s*["']([^"']+)["']/gi;
      while ((m = idRe.exec(line))) ids.push({ id: m[1], line: i + 1 });
    }

    if (ext === ".css") {
      const selector = line.trim();
      if (selector.endsWith("{") && !selector.startsWith("@")) {
        cssSelectors.push(selector.slice(0, -1).trim());
      }
    }

    const urls = line.match(/https?:\/\/[^"'\s)<>]+/g) || [];
    for (const url of urls) endpointSet.add(url.replace(/[),.;]+$/, ""));
    const tables = line.match(/\bverix2_[A-Za-z0-9_]+\b/g) || [];
    for (const t of tables) tableSet.add(t);
    const rpcs = [...line.matchAll(/\brpc\s*\(\s*["']([^"']+)["']/g)];
    for (const x of rpcs) rpcSet.add(x[1]);
  }

  const duplicateIds = [];
  const idCount = new Map();
  for (const item of ids) idCount.set(item.id, (idCount.get(item.id) || 0) + 1);
  for (const [id, count] of idCount) if (count > 1) duplicateIds.push({ id, count });

  const debugMarkers = [];
  for (const [needle, label] of [["debugger","debugger"],["console.log","console.log"],["TODO","TODO"],["FIXME","FIXME"]]) {
    if (content.includes(needle)) debugMarkers.push(label);
  }

  rows.push({
    file: rel,
    extension: ext,
    bytes: Buffer.byteLength(content),
    lines: lines.length,
    functions: [...new Set(functionNames)].sort(),
    function_count: functionNames.length,
    imports_count: imports.length,
    add_event_listener_count: listeners.length,
    inline_handler_count: inlineHandlers.length,
    dynamic_code_count: dynamicCode.length,
    html_sink_count: htmlInnerHtml.length,
    global_reference_count: globalPatterns.length,
    html_id_count: ids.length,
    duplicate_ids: duplicateIds,
    css_selector_count: cssSelectors.length,
    debug_markers: debugMarkers
  });
}

const symbolDuplicates = [...symbolIndex.entries()]
  .filter(([, locations]) => locations.length > 1)
  .map(([name, locations]) => ({ name, locations }))
  .sort((a, b) => b.locations.length - a.locations.length);

const extensions = {};
for (const row of rows) extensions[row.extension] = (extensions[row.extension] || 0) + 1;

const summary = {
  generated_at: new Date().toISOString(),
  repository: "verix-plataformadigital/verix",
  files_analyzed: rows.length,
  total_bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
  total_lines: rows.reduce((sum, row) => sum + row.lines, 0),
  extensions,
  largest_files: [...rows].sort((a,b)=>b.bytes-a.bytes).slice(0,25),
  highest_function_counts: [...rows].sort((a,b)=>b.function_count-a.function_count).slice(0,25),
  listeners_by_file: [...rows].sort((a,b)=>b.add_event_listener_count-a.add_event_listener_count).slice(0,25),
  duplicate_function_symbols: symbolDuplicates.slice(0,200),
  duplicate_html_ids: rows.filter(r=>r.duplicate_ids.length>0).map(r=>({file:r.file,duplicate_ids:r.duplicate_ids})),
  dynamic_code_usage: rows.filter(r=>r.dynamic_code_count>0).map(r=>({file:r.file,count:r.dynamic_code_count})),
  html_sinks: rows.filter(r=>r.html_sink_count>0).map(r=>({file:r.file,count:r.html_sink_count})),
  global_reference_hotspots: rows.filter(r=>r.global_reference_count>0).map(r=>({file:r.file,count:r.global_reference_count})),
  debug_markers: rows.filter(r=>r.debug_markers.length>0).map(r=>({file:r.file,markers:r.debug_markers})),
  endpoints: [...endpointSet].sort(),
  supabase_objects: [...tableSet].sort(),
  rpc_names: [...rpcSet].sort(),
  files: rows.sort((a,b)=>a.file.localeCompare(b.file))
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, "repository-audit.json"), JSON.stringify(summary, null, 2) + "\n");

const md = [];
md.push("# VÉRIX — Repository Static Audit");
md.push("");
md.push(`Generated: ${summary.generated_at}`);
md.push(`Files analyzed: ${summary.files_analyzed}`);
md.push(`Total lines: ${summary.total_lines.toLocaleString("en-US")}`);
md.push(`Total bytes: ${summary.total_bytes.toLocaleString("en-US")}`);
md.push("");
md.push("## Largest files");
for (const r of summary.largest_files) md.push(`- ${r.file}: ${r.bytes.toLocaleString("en-US")} bytes / ${r.lines.toLocaleString("en-US")} lines`);
md.push("");
md.push("## Duplicate function symbols");
for (const x of summary.duplicate_function_symbols.slice(0,50)) md.push(`- ${x.name}: ${x.locations.join(", ")}`);
md.push("");
md.push("## Duplicate HTML IDs");
for (const x of summary.duplicate_html_ids) md.push(`- ${x.file}: ${x.duplicate_ids.map(v=>v.id+" ×"+v.count).join(", ")}`);
md.push("");
md.push("## Dynamic code / HTML sinks / globals");
md.push(`- dynamic code files: ${summary.dynamic_code_usage.length}`);
md.push(`- HTML sink files: ${summary.html_sinks.length}`);
md.push(`- global-reference hotspots: ${summary.global_reference_hotspots.length}`);
md.push("");
md.push("## Supabase objects");
md.push(summary.supabase_objects.length ? summary.supabase_objects.map(x=>`- ${x}`).join("\n") : "- none");
md.push("");
md.push("## RPC names");
md.push(summary.rpc_names.length ? summary.rpc_names.map(x=>`- ${x}`).join("\n") : "- none");
md.push("");
md.push("## External URLs");
md.push(summary.endpoints.length ? summary.endpoints.map(x=>`- ${x}`).join("\n") : "- none");
md.push("");
fs.writeFileSync(path.join(OUTPUT_DIR, "repository-audit.md"), md.join("\n") + "\n");

console.log(JSON.stringify({
  files_analyzed: summary.files_analyzed,
  total_lines: summary.total_lines,
  total_bytes: summary.total_bytes,
  duplicate_function_symbols: summary.duplicate_function_symbols.length,
  duplicate_html_id_files: summary.duplicate_html_ids.length,
  dynamic_code_files: summary.dynamic_code_usage.length,
  html_sink_files: summary.html_sinks.length,
  global_reference_hotspots: summary.global_reference_hotspots.length,
  endpoints: summary.endpoints.length,
  supabase_objects: summary.supabase_objects.length,
  rpc_names: summary.rpc_names.length
}, null, 2));
