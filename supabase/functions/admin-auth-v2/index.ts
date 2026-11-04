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

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPostgrestSchemaCacheFailure(status: number, body: string): boolean {
  return status === 503 && (
    /"code"\s*:\s*"PGRST002"/i.test(body) ||
    /could not query the database for the schema cache/i.test(body)
  );
}

type LocalRateWindow = { startedAt: number; count: number };
const localLoginRateWindows = new Map<string, LocalRateWindow>();

/*
 * Emergency-only limiter used when PostgREST/Postgres is unavailable.
 * The durable database limiter remains the primary path. This per-isolate
 * fallback is deliberately bounded to the same 10 attempts / 5 minutes.
 * Password verification and the signed 8-hour admin token are never skipped.
 */
function consumeLocalLoginRate(rateKey: string): boolean {
  const now = Date.now();
  let state = localLoginRateWindows.get(rateKey);

  if (!state || now - state.startedAt >= 5 * 60 * 1000) {
    state = { startedAt: now, count: 0 };
    localLoginRateWindows.set(rateKey, state);
  }

  if (state.count >= 10) return false;
  state.count += 1;

  // Bound memory in a long-lived isolate and remove expired entries.
  if (localLoginRateWindows.size > 4096) {
    for (const [key, value] of localLoginRateWindows) {
      if (now - value.startedAt >= 5 * 60 * 1000) {
        localLoginRateWindows.delete(key);
      }
      if (localLoginRateWindows.size <= 3072) break;
    }
    while (localLoginRateWindows.size > 4096) {
      const oldest = localLoginRateWindows.keys().next().value;
      if (!oldest) break;
      localLoginRateWindows.delete(oldest);
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
  const retryDelays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    if (attempt > 0) await wait(retryDelays[attempt - 1]);

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
          signal: AbortSignal.timeout(8000)
        }
      );
    } catch (_) {
      // Postgres/network failure: preserve a bounded emergency login path.
      console.error("admin_login_rate_limit_fallback", "network_unavailable");
      return consumeLocalLoginRate(rateKey);
    }

    const body = await response.text();
    if (response.ok) {
      if (body.trim() === "true") return true;
      if (body.trim() === "false") return false;
      throw new Error("rate_limit_invalid_response");
    }

    // PGRST002 is returned before the RPC executes; retry this exact failure.
    if (
      isPostgrestSchemaCacheFailure(response.status, body) &&
      attempt < retryDelays.length
    ) {
      continue;
    }

    // SQL statement timeouts (57014) and temporary server-side 5xx errors
    // indicate infrastructure failure, not an exceeded user attempt limit.
    // Do not retry an executed query; switch to the bounded local limiter.
    if (response.status >= 500 && response.status <= 599) {
      console.error(
        "admin_login_rate_limit_fallback",
        "database_unavailable",
        response.status,
        /57014|statement timeout/i.test(body) ? "statement_timeout" : "server_error"
      );
      return consumeLocalLoginRate(rateKey);
    }

    // Configuration/authentication errors (4xx) remain fail-closed.
    throw new Error("rate_limit_backend_unavailable");
  }

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
      console.error(
        "admin_login_rate_limit_unavailable",
        String((error as Error)?.message || "unknown")
      );
      return json({ ok: false, error: "temporarily_unavailable" }, 503, req);
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