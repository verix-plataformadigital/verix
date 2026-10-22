/**
 * VÉRIX Admin Telemetry API v3 — isolated replacement candidate.
 *
 * This function is intentionally NOT deployed. It is a reviewable candidate
 * for a later, explicitly approved rollout. It does not ingest events, mutate
 * data, touch the ASF engine, or expose the service-role key to clients.
 */
const ALLOWED_ORIGINS = new Set([
  "https://onilkakbgpklxvxuxmks.supabase.co",
  "https://verix-plataformadigital.github.io",
  "https://verix.vxops.workers.dev",
  "http://localhost",
  "http://127.0.0.1",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Cache-Control": "no-store, max-age=0",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
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

    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload)));
    return payload?.scope === "admin" && Number(payload?.exp ?? 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("server_configuration_missing");
  const result = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!result.ok) {
    // Never return upstream error text or credentials to the browser.
    throw new Error(`rpc_failed:${name}:${result.status}`);
  }
  return await result.json() as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "GET") return response(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!await isAdmin(req)) return response(req, { ok: false, error: "unauthorized" }, 401);

  const url = new URL(req.url);
  if (url.searchParams.get("view") !== "dashboard") {
    return response(req, { ok: false, error: "unsupported_view" }, 400);
  }

  try {
    const now = new Date().toISOString();
    // Both calls use server time. Presence is intentionally separate from
    // hourly activity, and the admin response is never browser-cacheable.
    const [dashboard, presence] = await Promise.all([
      rpc<Record<string, unknown>>("verix2_admin_dashboard_v3", {
        p_now: now,
        p_force_refresh: false,
      }),
      rpc<Record<string, unknown>>("verix2_admin_live_presence", { p_now: now }),
    ]);

    const livePresence = {
      observed_at: presence.observed_at ?? now,
      presence_lease_seconds: presence.presence_lease_seconds ?? 90,
      online_now: Number(presence.online_now ?? 0),
      online_sessions: Number(presence.online_sessions ?? 0),
      online_installations: Number(presence.online_installations ?? 0),
      sessions_seen_last_hour: Number(presence.sessions_seen_last_hour ?? 0),
      installations_seen_last_hour: Number(presence.installations_seen_last_hour ?? 0),
      active_sessions_last_hour: Number(presence.active_sessions_last_hour ?? 0),
      active_installations_last_hour: Number(presence.active_installations_last_hour ?? 0),
      consultations_in_progress: Number(presence.consultations_in_progress ?? 0),
      consultations_started_last_hour: Number(presence.consultations_started_last_hour ?? 0),
    };

    return response(req, {
      ok: true,
      generated_at: now,
      dashboard,
      presence: livePresence,
    });
  } catch (error) {
    console.error("admin_telemetry_v3_failed", error instanceof Error ? error.message : "unknown");
    return response(req, { ok: false, error: "telemetry_unavailable" }, 503);
  }
});
