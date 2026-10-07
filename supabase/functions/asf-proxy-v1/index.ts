const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Expose-Headers": "X-Verix-ASF-Relay, X-Verix-ASF-Latency-Ms",
  "Cache-Control": "no-store, max-age=0",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ASF_ORIGIN = "https://ext01.asf.com.pt";
const ASF_PATH = "/api/src/";
const MAX_BODY_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 12000;
const CLIENT_WINDOW_SECONDS = 60;
const CLIENT_LIMIT = 5;
const IP_LIMIT = 30;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePlate(value: unknown): string {
  return cleanText(value, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function validDate(value: unknown): string | null {
  const s = cleanText(value, 10);
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return "unknown";
}

async function hmacHex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(value)
  ));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function consumeRate(key: string, limit: number): Promise<boolean> {
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/verix2_consume_rate_limit", {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_key: key,
      p_limit: limit,
      p_window_seconds: CLIENT_WINDOW_SECONDS
    })
  });
  if (!r.ok) throw new Error("rate_limit_rpc_failed");
  return (await r.text()).trim() === "true";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (req.method === "GET") {
    return json({
      ok: true,
      service: "verix-asf-proxy",
      version: "1.0",
      upstream: ASF_ORIGIN,
      mode: "server-relay",
      retries: false
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "proxy_not_configured" }, 503);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload_too_large" }, 413);
    }

    const body = await req.json().catch(() => null);
    const plate = normalizePlate(body?.matricula);
    const date = validDate(body?.date);

    if (!/^[A-Z0-9]{6,8}$/.test(plate)) {
      return json({ ok: false, error: "invalid_plate" }, 400);
    }
    if (!date) return json({ ok: false, error: "invalid_date" }, 400);

    const installationId = cleanText(body?.installationId, 120);

    if (!installationId) return json({ ok: false, error: "missing_installation" }, 400);

    const ipKey = await hmacHex("ip:" + clientIp(req));
    const installKey = await hmacHex("installation:" + installationId);

    if (!(await consumeRate("asf-global", 60))) {
      return json({ ok: false, error: "rate_limited_global" }, 429);
    }
    if (!(await consumeRate("asf-ip:" + ipKey, IP_LIMIT))) {
      return json({ ok: false, error: "rate_limited" }, 429);
    }
    if (!(await consumeRate("asf-install:" + installKey, CLIENT_LIMIT))) {
      return json({ ok: false, error: "rate_limited" }, 429);
    }

    const query =
      'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
      plate + '", date: "' + date +
      '") { nodes { id entity startDate endDate policy license code logo } } } } } }';

    const url = ASF_ORIGIN + ASF_PATH + "?query=" + encodeURIComponent(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const started = Date.now();

    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "User-Agent": "VERIX-ASF-Relay/1.0"
        },
        body: null,
        redirect: "follow",
        signal: controller.signal
      });

      const text = await upstream.text();
      const elapsedMs = Date.now() - started;

      return new Response(text, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
          "X-Verix-ASF-Relay": "1",
          "X-Verix-ASF-Latency-Ms": String(elapsedMs),
        }
      });
    } catch (error) {
      const aborted = (error as Error)?.name === "AbortError";
      return json({
        ok: false,
        error: aborted ? "upstream_timeout" : "upstream_network",
        message: aborted ? "ASF upstream timeout" : "ASF upstream network error"
      }, aborted ? 504 : 502);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("verix_asf_proxy_failed", String((error as Error)?.message || error));
    return json({ ok: false, error: "proxy_failed" }, 500);
  }
});
