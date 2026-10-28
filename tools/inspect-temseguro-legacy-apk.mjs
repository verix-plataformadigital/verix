import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const work = mkdtempSync(join(tmpdir(), "temseguro-legacy-audit-"));
const apkPath = join(work, "temseguro-1.2.apk");
const jadxZip = join(work, "jadx-1.5.6.zip");
const jadxDir = join(work, "jadx");
const outDir = join(work, "decompiled");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 12 * 1024 * 1024,
    timeout: options.timeout ?? 240000,
    ...options
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

try {
  console.log("historicalAPK: starting; no production files or ASF queries are changed");
  run("curl", [
    "-fLsS", "--retry", "2", "--retry-delay", "2",
    "--connect-timeout", "15", "--max-time", "180",
    "-A", "Mozilla/5.0 (compatible; authorized static-analysis research)",
    "https://d.apkpure.net/b/APK/com.mobinteg.temseguro?versionCode=3001",
    "-o", apkPath
  ]);
  const apkSize = statSync(apkPath).size;
  if (apkSize < 10_000_000) throw new Error("Downloaded object is unexpectedly small; refusing to analyze");
  const signature = readFileSync(apkPath).subarray(0, 4).toString("hex");
  if (signature !== "504b0304") throw new Error("Downloaded object is not an APK/ZIP archive");
  run("unzip", ["-tq", apkPath], { timeout: 60000 });
  console.log(JSON.stringify({ historicalAPK: "downloaded", bytes: apkSize, sha256: sha256(apkPath), source: "APKPure version 1.2 page; download endpoint" }));

  run("curl", [
    "-fLsS", "--retry", "2", "--retry-delay", "2",
    "--connect-timeout", "15", "--max-time", "120",
    "https://github.com/skylot/jadx/releases/download/v1.5.6/jadx-1.5.6.zip",
    "-o", jadxZip
  ]);
  run("unzip", ["-q", jadxZip, "-d", jadxDir], { timeout: 60000 });
  const bin = join(jadxDir, "bin", "jadx");
  const version = run(bin, ["--version"], { timeout: 30000 }).trim();
  console.log(JSON.stringify({ decompiler: "jadx", version }));

  run(bin, [
    "--deobf", "--show-bad-code", "--no-res", "--threads-count", "2",
    "-d", outDir, apkPath
  ], { timeout: 240000 });
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && path.endsWith(".java")) files.push(path);
    }
  }
  walk(join(outDir, "sources"));

  const patterns = [
    /ws\\.mobinteg\\.com\\/asf-matricula/i,
    /ext01\\.asf\\.com\\.pt\\/api\\/src/i,
    /ASF_URL_OLD/,
    /ASF_URL/,
    /licenseNumber\\(/,
    /mobishoutEntry/
  ];
  const matches = [];
  for (const path of files) {
    const lines = readFileSync(path, "utf8").split(/\\r?\\n/);
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (patterns.some(re => re.test(lines[i]))) {
        hits.push({ line: i + 1, text: lines[i].trim().slice(0, 280) });
      }
    }
    if (hits.length) matches.push({ file: path.slice(join(outDir, "sources").length + 1), hits: hits.slice(0, 18) });
  }
  const appMatches = matches.filter(x => /com\\/mobinteg\\/temseguro/i.test(x.file));
  console.log(JSON.stringify({
    decompiledJavaFiles: files.length,
    relevantApplicationFiles: appMatches.length,
    relevantMatches: appMatches.slice(0, 30)
  }));
  console.log("historicalAPK: analysis completed; APK and decompiler remained in runner temp directory, no artifact uploaded");
} catch (error) {
  console.log(JSON.stringify({
    historicalAPK: "analysis_incomplete",
    error: String(error?.message || error).slice(0, 1000),
    stderr: String(error?.stderr?.toString?.() || "").slice(-2500)
  }));
  process.exitCode = 1;
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch {}
}
