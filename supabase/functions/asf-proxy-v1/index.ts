const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Expose-Headers": "X-Verix-ASF-Relay, X-Verix-ASF-Latency-Ms, Retry-After",
  "Cache-Control": "no-store, max-age=0",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ASF_ORIGIN = "https://ext01.asf.com.pt";
const ASF_PATH = "/api/src/";
const MAX_BODY_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 15000;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...extraHeaders
    }
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return json({
      ok: true,
      service: "verix-asf-proxy",
      version: "2.0",
      upstream: ASF_ORIGIN,
      mode: "server-relay",
      retries: "client-transport-only",
      limiter: "none-local"
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "proxy_not_configured" }, 503);
  }

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

    if (!date) {
      return json({ ok: false, error: "invalid_date" }, 400);
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
          "Pragma": "no-cache"
        },
        body: null,
        redirect: "follow",
        signal: controller.signal
      });

      const text = await upstream.text();
      const elapsedMs = Date.now() - started;

      const outHeaders: Record<string, string> = {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "X-Verix-ASF-Relay": "1",
        "X-Verix-ASF-Latency-Ms": String(elapsedMs)
      };

      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) outHeaders["Retry-After"] = retryAfter;

      return new Response(text, {
        status: upstream.status,
        headers: outHeaders
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
    console.error(
      "verix_asf_proxy_failed",
      String((error as Error)?.message || error)
    );
    return json({ ok: false, error: "proxy_failed" }, 500);
  }
});
