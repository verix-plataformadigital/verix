import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

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
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function read(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}
function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}
function sourceKind(file) {
  const ext = path.extname(file).toLowerCase();
  return ext === ".html" ? ts.ScriptKind.JS
    : ext === ".tsx" ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
}
function scriptBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*>([\\s\\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const content = match[1] ?? "";
    if (!content.trim()) continue;
    out.push({ content, offset: match.index, length: match[0].length });
  }
  return out;
}
function nodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
function declaredFunctionName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  if ((ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return null;
}
function analyzeScript(script, virtualFile, offsetLine = 1) {
  const sf = ts.createSourceFile(virtualFile, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = [];
  const listeners = [];
  const sinks = [];
  const dynamic = [];
  const globals = [];
  const storage = [];
  const timers = [];
  const fetches = [];
  const calls = new Map();

  function visit(node) {
    const line = nodeLine(sf, node) + offsetLine - 1;

    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
      const name = declaredFunctionName(node);
      functions.push({ name, line });
    }

    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const property = node.expression.name.text;
        if (property === "addEventListener") listeners.push(line);
        if (property === "fetch") fetches.push(line);
      }
      if (ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        calls.set(name, (calls.get(name) || 0) + 1);
        if (name === "eval") dynamic.push(line);
        if (name === "fetch") fetches.push(line);
        if (name === "setTimeout" || name === "setInterval" || name === "clearTimeout" || name === "clearInterval") timers.push({ name, line });
      }
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === "Function") dynamic.push(line);
    }

    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (["innerHTML","outerHTML","insertAdjacentHTML"].includes(name)) sinks.push({ kind: name, line });
      const receiver = node.expression;
      if (ts.isIdentifier(receiver) && ["window","globalThis"].includes(receiver.text)) globals.push({ kind: receiver.text + "." + name, line });
      if (ts.isIdentifier(receiver) && ["localStorage","sessionStorage","indexedDB"].includes(receiver.text)) storage.push({ kind: receiver.text + "." + name, line });
      if (ts.isIdentifier(receiver) && ["window","globalThis"].includes(receiver.text) && ["localStorage","sessionStorage","indexedDB"].includes(name)) storage.push({ kind: receiver.text + "." + name, line });
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return {
    functions,
    listeners,
    sinks,
    dynamic,
    globals,
    storage,
    timers,
    fetches,
    calls: [...calls.entries()].sort((a,b)=>b[1]-a[1]).slice(0,100)
  };
}

const files = walk(ROOT);
const rows = [];
const symbolIndex = new Map();
const endpointSet = new Set();
const tableSet = new Set();
const rpcSet = new Set();
const functionCallIndex = new Map();
const htmlScriptInventory = [];

for (const file of files) {
  const content = read(file);
  const rel = relative(file);
  if (!content && fs.statSync(file).size > 0) continue;
  const ext = path.extname(file).toLowerCase();
  const lines = content.split(/\r?\n/);
  const ids = [];
  const inlineHandlers = [];
  const debugMarkers = [];

  if (ext === ".html") {
    const idRe = /\bid\s*=\s*["']([^"']+)["']/gi;
    let idMatch;
    while ((idMatch = idRe.exec(content))) {
      const prefix = content.slice(0, idMatch.index);
      ids.push({ id: idMatch[1], line: prefix.split(/\r?\n/).length });
    }
    for (const [needle, label] of [["on(click|input|change|submit|load|error|keydown|keyup|touchstart|touchend)\\s*=", "inline-handler"]]) {
      const re = new RegExp(needle, "gi");
      let m;
      while ((m = re.exec(content))) inlineHandlers.push(content.slice(0,m.index).split(/\r?\n/).length);
    }
  }

  const analysisParts = [];
  if (ext === ".html") {
    const blocks = scriptBlocks(content);
    htmlScriptInventory.push({ file: rel, blocks: blocks.map((b, i)=>({ index:i, bytes:Buffer.byteLength(b.content), lines:b.content.split(/\r?\n/).length })) });
    for (const [i, block] of blocks.entries()) {
      const prefix = content.slice(0, block.offset);
      const startLine = prefix.split(/\r?\n/).length;
      analysisParts.push(analyzeScript(block.content, rel + "#script-" + i, startLine));
    }
  } else if ([".js",".mjs",".cjs",".ts",".tsx"].includes(ext)) {
    analysisParts.push(analyzeScript(content, rel, 1));
  }

  const merged = {
    functions: analysisParts.flatMap(x=>x.functions),
    listeners: analysisParts.flatMap(x=>x.listeners),
    sinks: analysisParts.flatMap(x=>x.sinks),
    dynamic: analysisParts.flatMap(x=>x.dynamic),
    globals: analysisParts.flatMap(x=>x.globals),
    storage: analysisParts.flatMap(x=>x.storage),
    timers: analysisParts.flatMap(x=>x.timers),
    fetches: analysisParts.flatMap(x=>x.fetches),
    calls: analysisParts.flatMap(x=>x.calls)
  };

  for (const fn of merged.functions) {
    if (fn.name) {
      const arr = symbolIndex.get(fn.name) || [];
      arr.push(rel + ":" + fn.line);
      symbolIndex.set(fn.name, arr);
    }
  }
  for (const [name,count] of merged.calls) functionCallIndex.set(name,(functionCallIndex.get(name)||0)+count);

  const URLs = content.match(/https?:\/\/[^"'\s)<>]+/g) || [];
  for (const url of URLs) endpointSet.add(url.replace(/[),.;]+$/,""));
  for (const t of content.match(/\bverix2_[A-Za-z0-9_]+\b/g) || []) tableSet.add(t);
  for (const x of content.matchAll(/\brpc\s*\(\s*["']([^"']+)["']/g)) rpcSet.add(x[1]);

  for (const [needle, label] of [["TODO","TODO"],["FIXME","FIXME"],["debugger","debugger"]]) {
    if (content.includes(needle)) debugMarkers.push(label);
  }
  if (/console\.(log|debug|info)\s*\(/.test(content)) debugMarkers.push("console.*");

  const duplicateIds = [];
  const idCount = new Map();
  for (const item of ids) idCount.set(item.id,(idCount.get(item.id)||0)+1);
  for (const [id,count] of idCount) if (count > 1) duplicateIds.push({id,count});

  rows.push({
    file: rel,
    extension: ext,
    bytes: Buffer.byteLength(content),
    lines: lines.length,
    function_count: merged.functions.length,
    named_function_count: merged.functions.filter(x=>x.name).length,
    named_functions: [...new Set(merged.functions.map(x=>x.name).filter(Boolean))].sort(),
    add_event_listener_count: merged.listeners.length,
    listener_lines: merged.listeners,
    inline_handler_count: inlineHandlers.length,
    dynamic_code_count: merged.dynamic.length,
    html_sink_count: merged.sinks.length,
    html_sink_kinds: merged.sinks.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{}),
    global_reference_count: merged.globals.length,
    storage_reference_count: merged.storage.length,
    timer_call_count: merged.timers.length,
    fetch_call_count: merged.fetches.length,
    html_id_count: ids.length,
    duplicate_ids: duplicateIds,
    css_selector_count: ext === ".css" ? (content.match(/^[^@{}][^{}]*\{\s*$/gm)||[]).length : 0,
    debug_markers: [...new Set(debugMarkers)]
  });
}

const duplicateFunctionSymbols = [...symbolIndex.entries()]
  .filter(([,locations]) => locations.length > 1)
  .map(([name,locations]) => ({name,locations,count:locations.length}))
  .sort((a,b)=>b.count-a.count);

const likelyDeadNamedFunctions = [...symbolIndex.entries()]
  .filter(([name]) => !(functionCallIndex.get(name) > 0))
  .filter(([name]) => name.length > 2)
  .map(([name,locations]) => ({name,locations}))
  .sort((a,b)=>a.name.localeCompare(b.name));

const extensions = {};
for (const row of rows) extensions[row.extension] = (extensions[row.extension] || 0) + 1;

const summary = {
  generated_at: new Date().toISOString(),
  repository: "verix-plataformadigital/verix",
  files_analyzed: rows.length,
  total_bytes: rows.reduce((sum,row)=>sum+row.bytes,0),
  total_lines: rows.reduce((sum,row)=>sum+row.lines,0),
  extensions,
  largest_files: [...rows].sort((a,b)=>b.bytes-a.bytes).slice(0,25),
  highest_function_counts: [...rows].sort((a,b)=>b.function_count-a.function_count).slice(0,25),
  listeners_by_file: [...rows].sort((a,b)=>b.add_event_listener_count-a.add_event_listener_count).slice(0,25),
  dynamic_code_usage: rows.filter(r=>r.dynamic_code_count>0).map(r=>({file:r.file,count:r.dynamic_code_count,lines:r.dynamic_code_count})),
  html_sinks: rows.filter(r=>r.html_sink_count>0).map(r=>({file:r.file,count:r.html_sink_count,kinds:r.html_sink_kinds})),
  global_reference_hotspots: rows.filter(r=>r.global_reference_count>0).map(r=>({file:r.file,count:r.global_reference_count})),
  storage_hotspots: rows.filter(r=>r.storage_reference_count>0).map(r=>({file:r.file,count:r.storage_reference_count})),
  timer_hotspots: rows.filter(r=>r.timer_call_count>0).map(r=>({file:r.file,count:r.timer_call_count})),
  fetch_hotspots: rows.filter(r=>r.fetch_call_count>0).map(r=>({file:r.file,count:r.fetch_call_count})),
  duplicate_function_symbols: duplicateFunctionSymbols.slice(0,200),
  possible_unreferenced_named_functions: likelyDeadNamedFunctions.slice(0,300),
  duplicate_html_ids: rows.filter(r=>r.duplicate_ids.length>0).map(r=>({file:r.file,duplicate_ids:r.duplicate_ids})),
  debug_markers: rows.filter(r=>r.debug_markers.length>0).map(r=>({file:r.file,markers:r.debug_markers})),
  html_scripts: htmlScriptInventory,
  endpoints: [...endpointSet].sort(),
  supabase_objects: [...tableSet].sort(),
  rpc_names: [...rpcSet].sort(),
  files: rows.sort((a,b)=>a.file.localeCompare(b.file))
};

fs.mkdirSync(OUTPUT_DIR,{recursive:true});
fs.writeFileSync(path.join(OUTPUT_DIR,"repository-audit.json"),JSON.stringify(summary,null,2)+"\n");

const md=[];
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
md.push("## AST function inventory");
for (const r of summary.highest_function_counts.slice(0,15)) md.push(`- ${r.file}: ${r.named_function_count} named / ${r.function_count} total functions`);
md.push("");
md.push("## Event / DOM / platform hotspots");
for (const r of summary.listeners_by_file.slice(0,15)) md.push(`- ${r.file}: ${r.add_event_listener_count} addEventListener calls`);
for (const r of summary.html_sinks) md.push(`- HTML sink ${r.file}: ${r.count} (${JSON.stringify(r.kinds)})`);
md.push("");
md.push("## Possible unreferenced named functions");
md.push("These are candidates only. Dynamic calls, HTML attributes, string references and external integration can make textual/AST call counts incomplete.");
for (const x of summary.possible_unreferenced_named_functions.slice(0,100)) md.push(`- ${x.name}: ${x.locations.join(", ")}`);
md.push("");
md.push("## Dynamic code / globals / storage / timers");
md.push(`- dynamic-code files: ${summary.dynamic_code_usage.length}`);
md.push(`- global-reference hotspots: ${summary.global_reference_hotspots.length}`);
md.push(`- storage hotspots: ${summary.storage_hotspots.length}`);
md.push(`- timer hotspots: ${summary.timer_hotspots.length}`);
md.push("");
md.push("## Supabase objects");
md.push(summary.supabase_objects.map(x=>`- ${x}`).join("\n"));
md.push("");
md.push("## RPC names");
md.push(summary.rpc_names.map(x=>`- ${x}`).join("\n"));
md.push("");
md.push("## External URLs");
md.push(summary.endpoints.map(x=>`- ${x}`).join("\n"));
md.push("");
fs.writeFileSync(path.join(OUTPUT_DIR,"repository-audit.md"),md.join("\n")+"\n");

console.log(JSON.stringify({
  files_analyzed:summary.files_analyzed,
  total_lines:summary.total_lines,
  total_bytes:summary.total_bytes,
  duplicate_function_symbols:summary.duplicate_function_symbols.length,
  possible_unreferenced_named_functions:summary.possible_unreferenced_named_functions.length,
  dynamic_code_files:summary.dynamic_code_usage.length,
  html_sink_files:summary.html_sinks.length,
  global_reference_hotspots:summary.global_reference_hotspots.length,
  endpoints:summary.endpoints.length,
  supabase_objects:summary.supabase_objects.length,
  rpc_names:summary.rpc_names.length
},null,2));
