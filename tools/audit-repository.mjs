import fs from "node:fs";
import path from "node:path";
import { parseSync } from "oxc-parser";

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
  return ext;
}
function scriptBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const content = match[1] ?? "";
    if (!content.trim()) continue;
    out.push({ content, offset: match.index, length: match[0].length });
  }
  return out;
}
function lineAt(sourceText, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < sourceText.length; i += 1) {
    if (sourceText.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function parseSource(filename, sourceText) {
  const result = parseSync(filename, sourceText, {
    sourceType: "unambiguous",
    astType: "ts",
    range: true,
    showSemanticErrors: false
  });

  if (result.errors.length) {
    return { program: null, errors: result.errors.map(String) };
  }

  return { program: result.program, errors: [] };
}

function analyzeAst(sourceText, program, offsetLine = 1) {
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
    if (!node || typeof node !== "object") return;

    const line = lineAt(sourceText, Number(node.start ?? 0)) + offsetLine - 1;
    const type = node.type;

    if (
      type === "FunctionDeclaration" ||
      type === "FunctionExpression" ||
      type === "ArrowFunctionExpression"
    ) {
      functions.push({
        name: node.id?.name ?? null,
        line
      });
    }

    if (type === "CallExpression") {
      const callee = node.callee;
      if (callee?.type === "MemberExpression" || callee?.type === "OptionalMemberExpression") {
        const property = callee.property;
        const receiver = callee.object;
        const propertyName = property?.name ?? property?.value ?? null;

        if (propertyName === "addEventListener") listeners.push(line);
        if (propertyName === "fetch" || propertyName === "sendBeacon") fetches.push(line);

        if (
          receiver?.type === "Identifier" &&
          ["localStorage", "sessionStorage", "indexedDB"].includes(receiver.name)
        ) {
          storage.push({ kind: receiver.name + "." + String(propertyName), line });
        }

        if (
          receiver?.type === "Identifier" &&
          (receiver.name === "window" || receiver.name === "globalThis") &&
          ["localStorage", "sessionStorage", "indexedDB"].includes(String(propertyName))
        ) {
          storage.push({ kind: receiver.name + "." + String(propertyName), line });
        }
      }

      if (callee?.type === "Identifier") {
        const name = callee.name;
        calls.set(name, (calls.get(name) || 0) + 1);
        if (name === "eval") dynamic.push(line);
        if (name === "fetch") fetches.push(line);
        if (["setTimeout", "setInterval", "clearTimeout", "clearInterval"].includes(name)) {
          timers.push({ name, line });
        }
      }
    }

    if (type === "NewExpression" && node.callee?.type === "Identifier") {
      if (node.callee.name === "Function") dynamic.push(line);
    }

    if (type === "MemberExpression" || type === "OptionalMemberExpression") {
      const property = node.property;
      const propertyName = property?.name ?? property?.value ?? null;
      const receiver = node.object;

      if (["innerHTML", "outerHTML", "insertAdjacentHTML"].includes(String(propertyName))) {
        sinks.push({ kind: String(propertyName), line });
      }

      if (
        receiver?.type === "Identifier" &&
        ["window", "globalThis"].includes(receiver.name) &&
        propertyName
      ) {
        globals.push({ kind: receiver.name + "." + String(propertyName), line });
      }
    }

    for (const key of Object.keys(node)) {
      if (["start", "end", "loc", "range", "raw", "parent"].includes(key)) continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
      } else if (value && typeof value === "object" && typeof value.type === "string") {
        visit(value);
      }
    }
  }

  visit(program);

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
const parseErrors = [];
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
  const analysisParts = [];

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

    const blocks = scriptBlocks(content);
    htmlScriptInventory.push({
      file: rel,
      blocks: blocks.map((b, i)=>({
        index:i,
        bytes:Buffer.byteLength(b.content),
        lines:b.content.split(/\r?\n/).length
      }))
    });

    for (const [i, block] of blocks.entries()) {
      const parsed = parseSource(rel + "#script-" + i + ".js", block.content);
      if (parsed.program) {
        const startLine = content.slice(0, block.offset).split(/\r?\n/).length;
        analysisParts.push(analyzeAst(block.content, parsed.program, startLine));
      } else {
        parseErrors.push({file:rel,block:i,errors:parsed.errors});
      }
    }
  } else if ([".js",".mjs",".cjs",".ts",".tsx"].includes(ext)) {
    const parsed = parseSource(rel, content);
    if (parsed.program) {
      analysisParts.push(analyzeAst(content, parsed.program, 1));
    } else {
      parseErrors.push({file:rel,errors:parsed.errors});
    }
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

  for (const url of content.match(/https?:\/\/[^"'\s)<>]+/g) || []) endpointSet.add(url.replace(/[),.;]+$/,""));
  for (const t of content.match(/\bverix2_[A-Za-z0-9_]+\b/g) || []) tableSet.add(t);
  for (const x of content.matchAll(/\brpc\s*\(\s*["']([^"']+)["']/g)) rpcSet.add(x[1]);
  for (const [needle,label] of [["TODO","TODO"],["FIXME","FIXME"],["debugger","debugger"]]) if(content.includes(needle)) debugMarkers.push(label);
  if (/console\.(log|debug|info)\s*\(/.test(content)) debugMarkers.push("console.*");

  const duplicateIds = [];
  const idCount = new Map();
  for (const item of ids) idCount.set(item.id,(idCount.get(item.id)||0)+1);
  for (const [id,count] of idCount) if(count>1) duplicateIds.push({id,count});

  rows.push({
    file:rel,
    extension:ext,
    bytes:Buffer.byteLength(content),
    lines:lines.length,
    function_count:merged.functions.length,
    named_function_count:merged.functions.filter(x=>x.name).length,
    named_functions:[...new Set(merged.functions.map(x=>x.name).filter(Boolean))].sort(),
    add_event_listener_count:merged.listeners.length,
    listener_lines:merged.listeners,
    inline_handler_count:inlineHandlers.length,
    dynamic_code_count:merged.dynamic.length,
    html_sink_count:merged.sinks.length,
    html_sink_kinds:merged.sinks.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{}),
    global_reference_count:merged.globals.length,
    storage_reference_count:merged.storage.length,
    timer_call_count:merged.timers.length,
    fetch_call_count:merged.fetches.length,
    html_id_count:ids.length,
    duplicate_ids:duplicateIds,
    css_selector_count:ext === ".css" ? (content.match(/^[^@{}][^{}]*\{\s*$/gm)||[]).length : 0,
    debug_markers:[...new Set(debugMarkers)]
  });
}

const duplicateFunctionSymbols = [...symbolIndex.entries()]
  .filter(([,locations])=>locations.length>1)
  .map(([name,locations])=>({name,locations,count:locations.length}))
  .sort((a,b)=>b.count-a.count);

const likelyDeadNamedFunctions = [...symbolIndex.entries()]
  .filter(([name])=>!(functionCallIndex.get(name)>0))
  .filter(([name])=>name.length>2)
  .map(([name,locations])=>({name,locations}))
  .sort((a,b)=>a.name.localeCompare(b.name));

const extensions = {};
for(const row of rows) extensions[row.extension]=(extensions[row.extension]||0)+1;

const summary = {
  generated_at:new Date().toISOString(),
  repository:"verix-plataformadigital/verix",
  files_analyzed:rows.length,
  total_bytes:rows.reduce((sum,row)=>sum+row.bytes,0),
  total_lines:rows.reduce((sum,row)=>sum+row.lines,0),
  extensions,
  parse_errors:parseErrors,
  largest_files:[...rows].sort((a,b)=>b.bytes-a.bytes).slice(0,25),
  highest_function_counts:[...rows].sort((a,b)=>b.named_function_count-a.named_function_count).slice(0,25),
  listeners_by_file:[...rows].sort((a,b)=>b.add_event_listener_count-a.add_event_listener_count).slice(0,25),
  dynamic_code_usage:rows.filter(r=>r.dynamic_code_count>0).map(r=>({file:r.file,count:r.dynamic_code_count})),
  html_sinks:rows.filter(r=>r.html_sink_count>0).map(r=>({file:r.file,count:r.html_sink_count,kinds:r.html_sink_kinds})),
  global_reference_hotspots:rows.filter(r=>r.global_reference_count>0).map(r=>({file:r.file,count:r.global_reference_count})),
  storage_hotspots:rows.filter(r=>r.storage_reference_count>0).map(r=>({file:r.file,count:r.storage_reference_count})),
  timer_hotspots:rows.filter(r=>r.timer_call_count>0).map(r=>({file:r.file,count:r.timer_call_count})),
  fetch_hotspots:rows.filter(r=>r.fetch_call_count>0).map(r=>({file:r.file,count:r.fetch_call_count})),
  duplicate_function_symbols:duplicateFunctionSymbols.slice(0,200),
  possible_unreferenced_named_functions:likelyDeadNamedFunctions.slice(0,300),
  duplicate_html_ids:rows.filter(r=>r.duplicate_ids.length>0).map(r=>({file:r.file,duplicate_ids:r.duplicate_ids})),
  debug_markers:rows.filter(r=>r.debug_markers.length>0).map(r=>({file:r.file,markers:r.debug_markers})),
  html_scripts:htmlScriptInventory,
  endpoints:[...endpointSet].sort(),
  supabase_objects:[...tableSet].sort(),
  rpc_names:[...rpcSet].sort(),
  files:rows.sort((a,b)=>a.file.localeCompare(b.file))
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
md.push(`AST parse errors: ${summary.parse_errors.length}`);
md.push("");
md.push("## Largest files");
for(const r of summary.largest_files) md.push(`- ${r.file}: ${r.bytes.toLocaleString("en-US")} bytes / ${r.lines.toLocaleString("en-US")} lines`);
md.push("");
md.push("## AST function inventory");
for(const r of summary.highest_function_counts.slice(0,15)) md.push(`- ${r.file}: ${r.named_function_count} named / ${r.function_count} total functions`);
md.push("");
md.push("## Repeated named symbols");
for(const x of summary.duplicate_function_symbols.slice(0,100)) md.push(`- ${x.name}: ${x.locations.join(", ")}`);
md.push("");
md.push("## Event / DOM / platform hotspots");
for(const r of summary.listeners_by_file.slice(0,15)) md.push(`- ${r.file}: ${r.add_event_listener_count} addEventListener calls`);
for(const r of summary.html_sinks) md.push(`- HTML sink ${r.file}: ${r.count} (${JSON.stringify(r.kinds)})`);
md.push("");
md.push("## Possible unreferenced named functions");
md.push("Candidates only; dynamic calls, inline attributes, string references and global API use can make static call counts incomplete.");
for(const x of summary.possible_unreferenced_named_functions.slice(0,100)) md.push(`- ${x.name}: ${x.locations.join(", ")}`);
md.push("");
md.push("## Dynamic code / globals / storage / timers");
md.push(`- dynamic-code files: ${summary.dynamic_code_usage.length}`);
md.push(`- global-reference hotspots: ${summary.global_reference_hotspots.length}`);
md.push(`- storage hotspots: ${summary.storage_hotspots.length}`);
md.push(`- timer hotspots: ${summary.timer_hotspots.length}`);
md.push("");
md.push("## Supabase objects");
md.push(summary.supabase_objects.length ? summary.supabase_objects.map(x=>`- ${x}`).join("\n") : "- none");
md.push("");
md.push("## RPC names");
md.push(summary.rpc_names.length ? summary.rpc_names.map(x=>`- ${x}`).join("\n") : "- none");
md.push("");
md.push("## External URLs");
md.push(summary.endpoints.length ? summary.endpoints.map(x=>`- ${x}`).join("\n") : "- none");
if(summary.parse_errors.length){
  md.push("");
  md.push("## Parse errors");
  for(const e of summary.parse_errors.slice(0,50)) md.push(`- ${e.file}${e.block!==undefined?" block "+e.block:""}: ${e.errors.join(" | ")}`);
}
md.push("");
fs.writeFileSync(path.join(OUTPUT_DIR,"repository-audit.md"),md.join("\n")+"\n");

console.log(JSON.stringify({
  files_analyzed:summary.files_analyzed,
  total_lines:summary.total_lines,
  total_bytes:summary.total_bytes,
  parse_errors:summary.parse_errors.length,
  duplicate_function_symbols:summary.duplicate_function_symbols.length,
  possible_unreferenced_named_functions:summary.possible_unreferenced_named_functions.length,
  dynamic_code_files:summary.dynamic_code_usage.length,
  html_sink_files:summary.html_sinks.length,
  global_reference_hotspots:summary.global_reference_hotspots.length,
  endpoints:summary.endpoints.length,
  supabase_objects:summary.supabase_objects.length,
  rpc_names:summary.rpc_names.length
},null,2));
