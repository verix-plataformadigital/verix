const ALLOWED_ORIGINS = new Set([
  "https://verix.vxops.workers.dev",
  "https://verix-plataformadigital.github.io"
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const opaqueLocal = !origin || origin === "null";
  return {
    "Access-Control-Allow-Origin": opaqueLocal ? "*" : (ALLOWED_ORIGINS.has(origin) ? origin : ""),
    "Access-Control-Allow-Headers": "content-type,x-verix-build-id,x-verix-client-token",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Expose-Headers": "X-Verix-ASF-Relay, X-Verix-ASF-Latency-Ms, X-Verix-ASF-Queue-Wait-Ms, X-Verix-ASF-GraphQL-Error, X-Verix-ASF-Queue-Status, Retry-After",
    "Cache-Control": "no-store, max-age=0",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY"
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ASF_ORIGIN = "https://ext01.asf.com.pt";
const ASF_PATH = "/api/src/";
const MAX_BODY_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 15000;

function json(data: unknown, status = 200, req?: Request, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(req ? corsHeaders(req) : {}),
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
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return s;
}


const ASF_MIN_INTERVAL_MS = 10_000;
const ASF_QUEUE_RPC_TIMEOUT_MS = 5_000;
const ASF_GRAPHQL_UNAVAILABLE_COOLDOWN_MS = 15_000;
const ASF_UPSTREAM_ERROR_COOLDOWN_MS = 5_000;

async function asfPacingRpc(
  name: string,
  payload: Record<string, unknown>
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASF_QUEUE_RPC_TIMEOUT_MS);
  try {
    const response = await fetch(
      SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + name,
      {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": "Bearer " + SERVICE_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );
    if (!response.ok) throw new Error("asf_pacing_rpc_failed_" + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function tryAcquireASFSlot(ownerToken: string): Promise<{
  granted: boolean;
  waitMs: number;
  reason: string;
}> {
  const state = await asfPacingRpc("verix_asf_acquire_slot_v1", {
    p_owner_token: ownerToken,
    p_lease_seconds: 30,
    p_min_interval_ms: ASF_MIN_INTERVAL_MS
  });

  return {
    granted: state?.granted === true,
    waitMs: Math.max(100, Number(state?.wait_ms) || 1_000),
    reason: String(state?.reason || "busy")
  };
}

async function releaseASFSlot(ownerToken: string, cooldownMs: number): Promise<void> {
  try {
    await asfPacingRpc("verix_asf_release_slot_v1", {
      p_owner_token: ownerToken,
      p_cooldown_ms: Math.max(0, Math.min(300_000, Math.floor(cooldownMs)))
    });
  } catch (error) {
    // A lease expiry is the recovery path if the release RPC fails.
    console.warn("verix_asf_pacing_release_failed", String((error as Error)?.message || error));
  }
}

function upstreamRetryAfterMs(value: string | null): number {
  if (!value) return 2_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(1_000, Math.min(300_000, seconds * 1_000));
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(1_000, Math.min(300_000, dateMs - Date.now()));
  return 2_000;
}

function inspectGraphqlErrors(bodyText: string): {
  count: number;
  serviceUnavailable: boolean;
} {
  try {
    const parsed = JSON.parse(bodyText);
    const errors = Array.isArray(parsed?.errors) ? parsed.errors : [];
    const normalized = errors.map((item: any) =>
      String(item?.message || "")
    ).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    return {
      count: errors.length,
      serviceUnavailable: /servico indisponivel|service unavailable|temporarily unavailable/.test(normalized)
    };
  } catch (_) {
    return { count: 0, serviceUnavailable: false };
  }
}

const GATE_SECRET =
  Deno.env.get("VERIX_GATE_SECRET") ||
  Deno.env.get("VERIX_ADMIN_SECRET") ||
  "";

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

function safeEqual(a: string, b: string): boolean {
  a = String(a || "");
  b = String(b || "");
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function base64UrlDecode(value: string): Uint8Array {
  let s = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function verifyClientToken(
  token: string,
  buildId: string,
  installationId: string,
  origin: string
): Promise<boolean> {
  if (!GATE_SECRET) return false;
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;

  const encoded = parts[1];
  const expectedSignature = await hmacHex(encoded);
  if (!safeEqual(expectedSignature, parts[2])) return false;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encoded))
    );
    const expectedOrigin = origin || "legacy-local";
    const now = Math.floor(Date.now() / 1000);
    return payload?.scope === "verix-client" &&
      String(payload?.build || "") === buildId &&
      String(payload?.install || "") === installationId &&
      String(payload?.origin || "") === expectedOrigin &&
      Number(payload?.exp || 0) > now &&
      Number(payload?.iat || 0) <= now + 60;
  } catch (_) {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, req);
  }

  const origin = req.headers.get("origin") || "";

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "proxy_not_configured" }, 503, req);
  }

  try {
    const buildId = cleanText(req.headers.get("x-verix-build-id"), 80);
    if (!/^1\.5-sec-(?:\d{8}-[a-z0-9-]{1,20}|[0-9]{1,8}-[a-f0-9]{7,64})$/i.test(buildId)) {
      return json({ ok: false, error: "invalid_build" }, 403, req);
    }

    const token = cleanText(req.headers.get("x-verix-client-token"), 4096);
    let bodyPreview: any = null;
    try {
      const raw = await req.clone().text();
      bodyPreview = raw ? JSON.parse(raw) : null;
    } catch (_) {}

    const installationId = cleanText(bodyPreview?.installationId, 120);
    if (!installationId || !(await verifyClientToken(
      token,
      buildId,
      installationId,
      origin
    ))) {
      return json({ ok: false, error: "client_not_authorized" }, 401, req);
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload_too_large" }, 413, req);
    }

    const body = await req.json().catch(() => null);
    const plate = normalizePlate(body?.matricula);
    const date = validDate(body?.date);

    if (!/^[A-Z0-9]{6,8}$/.test(plate)) {
      return json({ ok: false, error: "invalid_plate" }, 400, req);
    }

    if (!date) {
      return json({ ok: false, error: "invalid_date" }, 400, req);
    }

    const query =
      'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
      plate + '", date: "' + date +
      '") { nodes { id entity startDate endDate policy license code logo } } } } } }';

    const url = ASF_ORIGIN + ASF_PATH + "?query=" + encodeURIComponent(query);
    const queueOwner = crypto.randomUUID();
    const slotStarted = Date.now();
    let slot: { granted: boolean; waitMs: number; reason: string };

    try {
      slot = await tryAcquireASFSlot(queueOwner);
    } catch (error) {
      console.warn("verix_asf_pacing_unavailable", JSON.stringify({
        buildId,
        reason: "pacing_rpc_unavailable"
      }));
      return json({
        ok: false,
        error: "asf_queue_unavailable",
        message: "ASF query scheduling is temporarily unavailable"
      }, 503, req, {
        "Retry-After": "5",
        "X-Verix-ASF-Queue-Status": "unavailable"
      });
    }

    if (!slot.granted) {
      const retrySeconds = Math.max(1, Math.min(300, Math.ceil(slot.waitMs / 1000)));
      return json({
        ok: false,
        error: "asf_queue_wait",
        message: "The ASF query is waiting for the next shared slot",
        wait_ms: slot.waitMs
      }, 503, req, {
        "Retry-After": String(retrySeconds),
        "X-Verix-ASF-Queue-Status": slot.reason === "upstream_cooldown" ? "cooldown" : "waiting"
      });
    }

    const queueWaitMs = Date.now() - slotStarted;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const started = Date.now();
    let releaseCooldownMs = 0;

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
      const retryAfter = upstream.headers.get("retry-after");
      const graphql = inspectGraphqlErrors(text);

      if (upstream.status === 429) {
        releaseCooldownMs = upstreamRetryAfterMs(retryAfter);
      } else if (graphql.serviceUnavailable) {
        // ASF returns this execution error inside HTTP 200; respect Retry-After if present.
        releaseCooldownMs = Math.max(
          ASF_GRAPHQL_UNAVAILABLE_COOLDOWN_MS,
          retryAfter ? upstreamRetryAfterMs(retryAfter) : 0
        );
      } else if (upstream.status >= 500) {
        releaseCooldownMs = Math.max(ASF_UPSTREAM_ERROR_COOLDOWN_MS, upstreamRetryAfterMs(retryAfter));
      }

      if (graphql.count > 0) {
        console.warn("verix_asf_upstream_graphql_error", JSON.stringify({
          buildId,
          status: upstream.status,
          elapsedMs,
          queueWaitMs,
          errorCount: graphql.count,
          serviceUnavailable: graphql.serviceUnavailable
        }));
      }

      if (upstream.status === 429 || upstream.status >= 500) {
        console.warn("verix_asf_upstream_http_error", JSON.stringify({
          buildId,
          status: upstream.status,
          elapsedMs,
          queueWaitMs
        }));
      }

      const outHeaders: Record<string, string> = {
        ...corsHeaders(req),
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "X-Verix-ASF-Relay": "1",
        "X-Verix-ASF-Latency-Ms": String(elapsedMs),
        "X-Verix-ASF-Queue-Wait-Ms": String(queueWaitMs),
        "X-Verix-ASF-GraphQL-Error": graphql.count > 0 ? "1" : "0",
        "X-Verix-ASF-Queue-Status": "acquired"
      };

      if (retryAfter) outHeaders["Retry-After"] = retryAfter;

      return new Response(text, {
        status: upstream.status,
        headers: outHeaders
      });
    } catch (error) {
      const aborted = (error as Error)?.name === "AbortError";
      releaseCooldownMs = aborted ? 10_000 : ASF_UPSTREAM_ERROR_COOLDOWN_MS;
      return json({
        ok: false,
        error: aborted ? "upstream_timeout" : "upstream_network",
        message: aborted ? "ASF upstream timeout" : "ASF upstream network error"
      }, aborted ? 504 : 502, req);
    } finally {
      clearTimeout(timeout);
      await releaseASFSlot(queueOwner, releaseCooldownMs);
    }
  } catch (error) {
    console.error(
      "verix_asf_proxy_failed",
      String((error as Error)?.message || error)
    );
    return json({ ok: false, error: "proxy_failed" }, 500, req);
  }
});
