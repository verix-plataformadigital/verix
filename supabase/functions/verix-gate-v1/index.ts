declare const Deno: any;

const GATE_SECRET =
  Deno.env.get("VERIX_GATE_SECRET") ||
  Deno.env.get("VERIX_ADMIN_SECRET") ||
  "";

const ALLOWED_ORIGINS = new Set([
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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacHex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(GATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(value)
  ));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function legacyLocal(req: Request): boolean {
  if (req.headers.get("origin")) return false;
  const ua = req.headers.get("user-agent") || "";
  return /Trident\//i.test(ua) || /MSIE\s/i.test(ua) || /MSHTA/i.test(ua);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const opaqueLocal = !origin || origin === "null";
  return {
    "Access-Control-Allow-Origin": opaqueLocal ? "*" : (ALLOWED_ORIGINS.has(origin) ? origin : ""),
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store, max-age=0",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY"
  };
}

function json(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, req);
  }
  if (!GATE_SECRET) {
    return json({ ok: false, error: "gate_not_configured" }, 503, req);
  }

  const origin = req.headers.get("origin") || "";
  if (!(ALLOWED_ORIGINS.has(origin) || legacyLocal(req))) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, req);
  }

  try {
    const body = await req.json().catch(() => null);
    const buildId = cleanText(body?.build_id, 80);
    const installationId = cleanText(body?.installation_id, 120);
    const sessionId = cleanText(body?.session_id, 120);
    const tabId = cleanText(body?.tab_id, 120);

    if (!/^1\.5-sec-(?:[0-9]{8}-[a-z0-9-]{1,20}|[0-9]{1,8}-[a-f0-9]{7,64})$/i.test(buildId)) {
      return json({ ok: false, error: "invalid_build" }, 400, req);
    }
    if (!installationId || !sessionId || !tabId) {
      return json({ ok: false, error: "invalid_client_identity" }, 400, req);
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 15 * 60;
    const payload = {
      scope: "verix-client",
      build: buildId,
      install: installationId,
      session: sessionId,
      tab: tabId,
      origin: origin || "legacy-local",
      iat: now,
      exp
    };
    const encoded = base64UrlEncode(JSON.stringify(payload));
    const signature = await hmacHex(encoded);
    const token = "v1." + encoded + "." + signature;

    return json({ ok: true, token, expires_in: exp - now, build_id: buildId }, 200, req);
  } catch (_) {
    return json({ ok: false, error: "gate_failed" }, 400, req);
  }
});