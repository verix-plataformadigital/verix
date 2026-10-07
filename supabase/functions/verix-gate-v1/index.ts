declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ASF_ALLOWED_ORIGINS = new Set([
  "https://verix.vxops.workers.dev",
  "https://verix-plataformadigital.github.io"
]);

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
    "HMAC",
    key,
    new TextEncoder().encode(value)
  ));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signToken(payload: Record<string, unknown>): Promise<string> {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(encoded);
  return "v1." + encoded + "." + signature;
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

async function consumeRate(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_KEY) return false;
  const h = await hmacHex(key);
  const response = await fetch(
    SUPABASE_URL + "/rest/v1/rpc/verix2_consume_rate_limit",
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_key: h,
        p_limit: limit,
        p_window_seconds: windowSeconds
      })
    }
  );
  if (!response.ok) return false;
  return (await response.text()).trim() === "true";
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = ASF_ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
}

function json(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function localLegacyTransport(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return false;
  const ua = req.headers.get("user-agent") || "";
  return /Trident\//i.test(ua) || /MSIE\s/i.test(ua) || /MSHTA/i.test(ua);
}

async function buildEnabled(buildId: string): Promise<boolean> {
  const q = new URLSearchParams({
    select: "build_id,enabled",
    build_id: "eq." + buildId,
    enabled: "eq.true",
    limit: "1"
  });
  const response = await fetch(
    SUPABASE_URL + "/rest/v1/verix_build_registry?" + q.toString(),
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: "Bearer " + SERVICE_KEY
      }
    }
  );
  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1 && rows[0]?.enabled === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, req);
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "gate_not_configured" }, 503, req);
  }

  const origin = req.headers.get("origin") || "";
  const originAllowed = ASF_ALLOWED_ORIGINS.has(origin) || localLegacyTransport(req);
  if (!originAllowed) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, req);
  }

  if (!(await consumeRate("gate-ip:" + clientIp(req), 20, 60))) {
    return json({ ok: false, error: "rate_limited" }, 429, req);
  }

  try {
    const body = await req.json().catch(() => null);
    const buildId = cleanText(body?.build_id, 80);
    const installationId = cleanText(body?.installation_id, 120);
    const sessionId = cleanText(body?.session_id, 120);
    const tabId = cleanText(body?.tab_id, 120);

    if (!/^1\.5-sec-[0-9]{8}-[a-z0-9-]{1,20}$/i.test(buildId)) {
      return json({ ok: false, error: "invalid_build" }, 400, req);
    }
    if (!installationId || !sessionId || !tabId) {
      return json({ ok: false, error: "invalid_client_identity" }, 400, req);
    }

    if (!(await buildEnabled(buildId))) {
      return json({ ok: false, error: "build_revoked" }, 403, req);
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 15 * 60;
    const token = await signToken({
      scope: "verix-client",
      build: buildId,
      install: installationId,
      session: sessionId,
      tab: tabId,
      origin: origin || "legacy-local",
      iat: now,
      exp
    });

    return json({
      ok: true,
      token,
      expires_in: exp - now,
      build_id: buildId
    }, 200, req);
  } catch (_) {
    return json({ ok: false, error: "gate_failed" }, 400, req);
  }
});
