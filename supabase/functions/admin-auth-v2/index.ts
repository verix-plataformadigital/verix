declare const Deno: any;

/*
 * The Admin uses explicit bearer tokens and never ambient browser cookies.
 * CORS is not the authorization boundary: the password, server-side rate limit,
 * and signed admin token remain mandatory. This also supports the Pages/PWA
 * entry points without coupling login to one distribution hostname.
 */
function getCorsHeaders(_req: Request) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type,authorization,apikey,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function json(data: unknown, status = 200, req?: Request) {
  const headers = req
    ? getCorsHeaders(req)
    : getCorsHeaders(new Request("https://verix-plataformadigital.github.io"));
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
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

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

// Emergency per-isolate fallback: keeps the Admin login available if Postgres
// is timing out. The durable database limiter remains primary whenever healthy.
// This is deliberately stricter than the normal 10 attempts / 5 minutes.
const localFallbackAttempts = new Map<string, number[]>();
async function consumeLocalFallback(req: Request, secret: string): Promise<boolean> {
  const key = await hmacHex("admin-login-fallback:" + clientIp(req), secret);
  const now = Date.now();
  const recent = (localFallbackAttempts.get(key) || []).filter(t => now - t < 300_000);
  if (recent.length >= 5) {
    localFallbackAttempts.set(key, recent);
    return false;
  }
  recent.push(now);
  localFallbackAttempts.set(key, recent);
  // Bound memory growth in long-lived isolates.
  if (localFallbackAttempts.size > 10_000) {
    for (const [k, times] of localFallbackAttempts) {
      if (!times.some(t => now - t < 300_000)) localFallbackAttempts.delete(k);
      if (localFallbackAttempts.size <= 8_000) break;
    }
  }
  return true;
}

async function consumeLoginRate(req: Request, secret: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("rate_limit_configuration_missing");
  }

  const rateSecret = Deno.env.get("VERIX_ADMIN_RATE_SECRET") || secret;
  const rateKey = await hmacHex("admin-login:" + clientIp(req), rateSecret);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(
      supabaseUrl + "/rest/v1/rpc/verix2_consume_rate_limit",
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: "Bearer " + serviceKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_key: rateKey,
          p_limit: 10,
          p_window_seconds: 300
        }),
        // Do not let a saturated analytics database lock the Admin login.
        // The strict per-isolate fallback takes over after this short deadline.
        signal: AbortSignal.timeout(2000)
      }
    );
  } catch (_) {
    console.error(
      "admin_login_rate_limit_fallback",
      "database_timeout",
      Date.now() - startedAt
    );
    return consumeLocalFallback(req, secret);
  }

  const body = await response.text();
  if (response.ok) {
    if (body.trim() === "true") return true;
    if (body.trim() === "false") return false;
    throw new Error("rate_limit_invalid_response");
  }

  // Any PostgREST/SQL 5xx is infrastructure failure, not a bad password.
  // Never retry PGRST002/statement timeouts in the same login request.
  if (response.status >= 500 && response.status <= 599) {
    console.error(
      "admin_login_rate_limit_fallback",
      "database_unavailable",
      response.status,
      /57014|statement timeout/i.test(body) ? "statement_timeout" : "server_error",
      Date.now() - startedAt
    );
    return consumeLocalFallback(req, secret);
  }

  // Configuration/authentication errors (4xx) remain fail-closed.
  throw new Error("rate_limit_backend_unavailable");
}

function b64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  return b64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(body)
      )
    )
  );
}

function safeEqual(a: string, b: string) {
  a = String(a ?? '');
  b = String(b ?? '');
  const max = Math.max(a.length, b.length);
  let v = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    v |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return v === 0;
}

async function makeToken(secret: string) {
  const payload = b64(
    new TextEncoder().encode(
      JSON.stringify({
        scope: "admin",
        exp:
          Math.floor(Date.now() / 1000) +
          8 * 60 * 60
      })
    )
  );

  return `${payload}.${await sign(payload, secret)}`;
}

Deno.serve(async (req: Request) => {

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req)
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        ok: false,
        error: "method_not_allowed"
      },
      405,
      req
    );
  }

  const expected =
    Deno.env.get(
      "VERIX_ADMIN_PASSWORD"
    ) || "";

  const secret =
    Deno.env.get(
      "VERIX_ADMIN_SECRET"
    ) || "";

  if (!expected || !secret) {
    return json(
      {
        ok: false,
        error:
          "admin_secret_not_configured"
      },
      500,
      req
    );
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
      return json({ ok: false, error: "payload_too_large" }, 413, req);
    }

    let loginAllowed: boolean;
    try {
      loginAllowed = await consumeLoginRate(req, secret);
    } catch (error) {
      // Database timeouts must not lock the administrator out. Fall back to a
      // stricter per-isolate limiter while retaining password verification,
      // HMAC token signing, and the normal durable limiter when Postgres recovers.
      console.error(
        "admin_login_rate_limit_fallback",
        String((error as Error)?.message || "unknown")
      );
      loginAllowed = await consumeLocalFallback(req, secret);
    }
    if (!loginAllowed) {
      return json({ ok: false, error: "rate_limited" }, 429, req);
    }

    const body =
      await req.json();

    const password =
      String(
        body?.password || ""
      ).slice(0, 256);

    if (
      !safeEqual(
        password,
        expected
      )
    ) {
      return json(
        {
          ok: false,
          error:
            "invalid_password"
        },
        401,
        req
      );
    }

    return json({
      ok: true,
      token:
        await makeToken(secret),
      expiresIn:
        8 * 60 * 60
    }, 200, req);

  } catch (error) {

    return json(
      {
        ok: false,
        error: "authentication_failed"
      },
      400,
      req
    );
  }

});