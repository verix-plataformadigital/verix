declare const Deno: any;

const ALLOWED_ORIGINS = new Set([
  "https://verix-plataformadigital.github.io",
  "https://verix.vxops.workers.dev",
  "http://localhost",
  "http://127.0.0.1"
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://verix-plataformadigital.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

async function consumeLoginRate(req: Request, secret: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return false;

  const rateSecret = Deno.env.get("VERIX_ADMIN_RATE_SECRET") || secret;
  const rateKey = await hmacHex("admin-login:" + clientIp(req), rateSecret);
  const response = await fetch(
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
      })
    }
  );
  if (!response.ok) return false;
  const body = await response.text();
  return body.trim() === "true";
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

Deno.serve(async (req) => {

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

    if (!(await consumeLoginRate(req, secret))) {
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