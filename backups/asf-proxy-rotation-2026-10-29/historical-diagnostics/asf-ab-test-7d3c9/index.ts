
const ACCESS_KEY = "REDACTED_IN_PUBLIC_BACKUP"; // expired diagnostic key intentionally redacted
const EXPIRES_AT = Date.parse("2026-10-29T00:00:00Z");
const ASF_URL = "https://ext01.asf.com.pt/api/src/";
let lastRunAt = 0;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
  });
}
function normPlate(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
function validDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  const m = s.match(/^([0-9]{4})[/]([0-9]{2})[/]([0-9]{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? s : null;
}
async function one(label: string, url: string, init: RequestInit) {
  const started = Date.now();
  try {
    const r = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(12000) });
    const body = await r.text();
    const elapsedMs = Date.now() - started;
    let kind = "non_json", errors: unknown[] = [], dataPresent = false, nodesCount: number | null = null;
    try {
      const parsed = JSON.parse(body);
      kind = "json";
      errors = Array.isArray(parsed?.errors) ? parsed.errors.slice(0, 3).map((e: any) => ({
        message: String(e?.message ?? "unknown").slice(0, 180),
        path: Array.isArray(e?.path) ? e.path.slice(0, 8) : undefined,
        code: String(e?.extensions?.code ?? e?.code ?? "").slice(0, 50) || undefined
      })) : [];
      dataPresent = Object.prototype.hasOwnProperty.call(parsed ?? {}, "data");
      const nodes = parsed?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
      nodesCount = Array.isArray(nodes) ? nodes.length : null;
    } catch {
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const trimmed = body.trim().toLowerCase();
      if (!body.trim()) kind = "empty";
      else if (ct.includes("text/html") || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) kind = "html";
    }
    const result = {
      variant: label,
      httpStatus: r.status,
      elapsedMs,
      contentType: (r.headers.get("content-type") || "").split(";")[0],
      bodyKind: kind,
      graphqlErrorCount: errors.length,
      errors,
      dataPresent,
      nodesCount,
      retryAfter: r.headers.get("retry-after") || null
    };
    console.log("asf_ab_diagnostic", JSON.stringify({ variant: label, httpStatus: r.status, elapsedMs, bodyKind: kind, graphqlErrorCount: errors.length, dataPresent, nodesCount }));
    return result;
  } catch (e) {
    const result = {
      variant: label,
      httpStatus: null,
      elapsedMs: Date.now() - started,
      networkError: String(e instanceof Error ? e.message : e).slice(0, 180)
    };
    console.log("asf_ab_diagnostic", JSON.stringify({ variant: label, networkError: true, elapsedMs: result.elapsedMs }));
    return result;
  }
}
Deno.serve(async (req: Request) => {
  if (Date.now() > EXPIRES_AT) return json({ ok: false, error: "test_expired" }, 410);
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== ACCESS_KEY) return json({ ok: false, error: "not_found" }, 404);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method === "GET") return new Response("VÉRIX ASF A/B test API. Open the downloaded HTML test file.", {
    status: 200, headers: { ...corsHeaders(), "Content-Type": "text/plain; charset=utf-8" }
  });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const now = Date.now();
  if (now - lastRunAt < 30000) return json({ ok: false, error: "wait_30_seconds_before_running_another_test_in_this_runtime" }, 429);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (body?.key !== ACCESS_KEY) return json({ ok: false, error: "not_authorized" }, 401);
  const plate = normPlate(body?.matricula);
  const date = validDate(body?.date);
  if (!/^[A-Z0-9]{6,8}$/.test(plate)) return json({ ok: false, error: "invalid_plate_format" }, 400);
  if (!date) return json({ ok: false, error: "invalid_date_format" }, 400);
  lastRunAt = now;
  const query = 'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' + plate + '", date: "' + date + '") { nodes { id entity startDate endDate policy license code logo } } } } } }';
  const sameAccept = { "Accept": "application/json, text/plain, */*", "Cache-Control": "no-cache", "Pragma": "no-cache" };
  const variants: Record<string, {url:string, init:RequestInit}> = {
    A_current: {
      url: ASF_URL + "?query=" + encodeURIComponent(query),
      init: { method: "POST", headers: sameAccept, body: null }
    },
    B_json_body: {
      url: ASF_URL,
      init: { method: "POST", headers: { ...sameAccept, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ query }) }
    }
  };
  const plan = [
    { kind: "B_json_body", label: "B_json_body_first" },
    { kind: "A_current", label: "A_current_second" },
    { kind: "A_current", label: "A_current_third" },
    { kind: "B_json_body", label: "B_json_body_fourth" }
  ];
  const results = [];
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const v = variants[item.kind];
    results.push(await one(item.label, v.url, v.init));
    if (i < plan.length - 1) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return json({
    test: "VÉRIX ASF A/B round 3 — balanced order",
    completedAt: new Date().toISOString(),
    changedVariable: "Only request encoding differs; Accept headers are identical. Order is B-A followed by A-B to reduce warm-connection bias.",
    note: "Four requests total. Only diagnostics are returned; no raw response or insurance/policy values are returned.",
    results
  });
});
