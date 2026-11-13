/**
 * VÉRIX Admin Telemetry API v3.
 * Read-only: does not ingest events, mutate data, or touch the ASF engine.
 */

/*
 * This read-only Admin API authorizes every request with a signed bearer token.
 * It does not use cookies, so CORS is not an authorization boundary.
 */
function corsHeaders(_req: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store, max-age=0",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  };
}

function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes.buffer;
}

async function isAdmin(req: Request): Promise<boolean> {
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return false;

    const token = authorization.slice(7);
    const [encodedPayload, encodedSignature, extra] = token.split(".");
    if (!encodedPayload || !encodedSignature || extra !== undefined) return false;

    const secret = Deno.env.get("VERIX_ADMIN_SECRET") ?? "";
    if (!secret) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    );
    return payload?.scope === "admin" &&
      Number(payload?.exp ?? 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
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

async function rpc<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("server_configuration_missing");
  }

  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const result = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const responseBody = await result.text();

    if (result.ok) return (responseBody ? JSON.parse(responseBody) : null) as T;

    // Retry only the cache-rebuild failure that happens before the RPC runs.
    if (
      isPostgrestSchemaCacheFailure(result.status, responseBody) &&
      attempt < delays.length
    ) {
      await wait(delays[attempt]);
      continue;
    }
    throw new Error(`rpc_failed:${name}:${result.status}`);
  }

  throw new Error(`rpc_failed:${name}:postgrest_schema_cache_unavailable`);
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return jsonResponse(req, { ok: false, error: "method_not_allowed" }, 405);
  }
  if (!await isAdmin(req)) {
    return jsonResponse(req, { ok: false, error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  if (url.searchParams.get("view") !== "dashboard") {
    return jsonResponse(req, { ok: false, error: "unsupported_view" }, 400);
  }

  try {
    const now = new Date().toISOString();
    const consultations = await rpc<number>(
      "verix_admin_recent_consultations",
      { p_now: now },
    );
    if (!Number.isSafeInteger(consultations) || consultations < 0) {
      throw new Error("recent_consultation_count_invalid");
    }
    const liveMetrics = {
      observed_at: now,
      consultations_started_last_5m: consultations,
    };

    return jsonResponse(req, {
      ok: true,
      generated_at: now,
      presence: liveMetrics,
    });
  } catch (error) {
    console.error(
      "admin_telemetry_v3_failed",
      error instanceof Error ? error.message : "unknown",
    );
    return jsonResponse(req, { ok: false, error: "telemetry_unavailable" }, 503);
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
