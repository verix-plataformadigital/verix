/**
 * VÉRIX Admin Telemetry API v3 — additive production endpoint.
 * Read-only: does not ingest events, mutate data, or touch ASF.
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
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, decodeBase64Url(encodedSignature),
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
  if (!result.ok) throw new Error(`rpc_failed:${name}:${result.status}`);
  return await result.json() as T;
}
function finiteCount(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
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
    const [dashboard, rawPresence] = await Promise.all([
      rpc<Record<string, unknown>>("verix2_admin_dashboard_v3", { p_now: now, p_force_refresh: false }),
      rpc<Record<string, unknown>>("verix2_admin_live_presence", { p_now: now }),
    ]);
    const presence = rawPresence && typeof rawPresence === "object" && !Array.isArray(rawPresence)
      ? rawPresence : {};
    const livePresence = {
      observed_at: typeof presence.observed_at === "string" ? presence.observed_at : now,
      presence_lease_seconds: finiteCount(presence.presence_lease_seconds, 90),
      online_now: finiteCount(presence.online_now),
      online_sessions: finiteCount(presence.online_sessions),
      online_installations: finiteCount(presence.online_installations),
      sessions_seen_last_hour: finiteCount(presence.sessions_seen_last_hour),
      installations_seen_last_hour: finiteCount(presence.installations_seen_last_hour),
      active_sessions_last_hour: finiteCount(presence.active_sessions_last_hour),
      active_installations_last_hour: finiteCount(presence.active_installations_last_hour),
      consultations_in_progress: finiteCount(presence.consultations_in_progress),
      consultations_started_last_hour: finiteCount(presence.consultations_started_last_hour),
    };
    return response(req, { ok: true, generated_at: now, dashboard, presence: livePresence });
  } catch (error) {
    console.error("admin_telemetry_v3_failed", error instanceof Error ? error.message : "unknown");
    return response(req, { ok: false, error: "telemetry_unavailable" }, 503);
  }
});