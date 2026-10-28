import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
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

  console.log(JSON.stringify({ dexdumpStarting: true, note: "static-only extraction; the app is not installed or executed" }));
  const archiveEntries = run("unzip", ["-Z1", apkPath]).split(String.fromCharCode(10)).map(name => name.trim()).filter(Boolean);
  const dexEntries = archiveEntries.filter(name => {
    if (name === "classes.dex") return true;
    if (!name.startsWith("classes") || !name.endsWith(".dex")) return false;
    const middle = name.slice(7, -4);
    return middle.length > 0 && [...middle].every(char => char >= "0" && char <= "9");
  });
  const dexFindings = [];
  const searchTerms = ["asf-matricula", "ext01.asf.com.pt", "ASF_URL", "licenseNumber", "mobishoutEntry", "graphql", "http://", "https://"];
  for (const entry of dexEntries) {
    const dexBytes = execFileSync("unzip", ["-p", apkPath, entry], { encoding: "buffer", maxBuffer: 40 * 1024 * 1024 });
    const printable = [];
    let current = "";
    for (const byte of dexBytes) {
      if (byte >= 32 && byte <= 126) current += String.fromCharCode(byte);
      else {
        if (current.length >= 4) printable.push(current);
        current = "";
      }
    }
    if (current.length >= 4) printable.push(current);
    const selected = printable.filter(value => {
      const lower = value.toLowerCase();
      return searchTerms.some(term => lower.includes(term.toLowerCase()));
    });
    dexFindings.push({ dex: entry, matches: [...new Set(selected)].slice(0, 120) });
  }
  console.log(JSON.stringify({ dexEntries, dexFindings }));

  // Decode Android resources/manifest independently; old URLs may live in strings.xml rather than DEX.
  const apktoolJar = join(work, "apktool.jar");
  const apktoolOut = join(work, "apktool-decoded");
  run("curl", [
    "-fLsS", "--retry", "2", "--retry-delay", "2",
    "--connect-timeout", "15", "--max-time", "120",
    "https://github.com/iBotPeaches/Apktool/releases/download/v2.11.1/apktool_2.11.1.jar",
    "-o", apktoolJar
  ]);
  let apktoolStatus = { completed: false };
  try {
    run("java", ["-jar", apktoolJar, "d", "-f", "-o", apktoolOut, apkPath], { timeout: 240000 });
    apktoolStatus = { completed: true };
  } catch (error) {
    apktoolStatus = {
      completed: false,
      exitCode: error?.status ?? null,
      stdout: String(error?.stdout?.toString?.() || "").slice(-2500),
      stderr: String(error?.stderr?.toString?.() || "").slice(-2500)
    };
  }

  // JADX can return exit 3 after successfully decompiling almost all classes; still scan partial output.
  let jadxStatus = { completed: false };
  try {
    run(bin, ["--no-res", "--threads-count", "1", "-d", outDir, apkPath], { timeout: 240000 });
    jadxStatus = { completed: true };
  } catch (error) {
    jadxStatus = {
      completed: false,
      exitCode: error?.status ?? null,
      stdout: String(error?.stdout?.toString?.() || "").slice(-2500),
      stderr: String(error?.stderr?.toString?.() || "").slice(-2500)
    };
  }

  const terms = [
    "ws.mobinteg.com/asf-matricula",
    "ext01.asf.com.pt/api/src",
    "ASF_URL_OLD",
    "ASF_URL",
    "licenseNumber(",
    "mobishoutEntry",
    "http://",
    "https://"
  ];
  function scanTree(root, maxFiles = 8000) {
    const found = [];
    let visited = 0;
    if (!existsSync(root)) return { visited, found };
    function visit(dir) {
      if (visited >= maxFiles) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (visited >= maxFiles) break;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile()) {
          visited++;
          try {
            if (statSync(path).size > 3_000_000) continue;
            const raw = readFileSync(path, "utf8");
            const lines = raw.split(String.fromCharCode(10)).map(line => line.replace(String.fromCharCode(13), ""));
            const hits = [];
            for (let i = 0; i < lines.length; i++) {
              if (terms.some(term => lines[i].toLowerCase().includes(term.toLowerCase()))) {
                hits.push({ line: i + 1, text: lines[i].trim().slice(0, 260) });
                if (hits.length >= 14) break;
              }
            }
            if (hits.length) found.push({ file: path.slice(root.length + 1).split(sep).join("/"), hits });
          } catch {}
        }
      }
    }
    visit(root);
    return { visited, found: found.slice(0, 80) };
  }
  const decodedResources = scanTree(apktoolOut, 8000);
  const javaSources = scanTree(join(outDir, "sources"), 8000);
  let apktoolMetadata = "";
  try {
    apktoolMetadata = readFileSync(join(apktoolOut, "apktool.yml"), "utf8").split(String.fromCharCode(10)).slice(0, 45).join(String.fromCharCode(10));
  } catch {}
  console.log(JSON.stringify({
    historicalAPKSizeBytes: apkSize,
    historicalAPKSha256: sha256(apkPath),
    dexEntries,
    apktoolStatus,
    apktoolMetadata,
    decodedResourceMatches: decodedResources,
    jadxStatus,
    decompiledSourceMatches: javaSources
  }));
  console.log("historicalAPK: analysis completed; APK and decompiler remained in runner temp directory, no artifact uploaded");
} catch (error) {
  console.log(JSON.stringify({
    historicalAPK: "analysis_incomplete",
    error: String(error?.message || error).slice(0, 1000),
    exitCode: error?.status ?? null,
    stdout: String(error?.stdout?.toString?.() || "").slice(-5000),
    stderr: String(error?.stderr?.toString?.() || "").slice(-3000)
  }));
  process.exitCode = 1;
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch {}
}
