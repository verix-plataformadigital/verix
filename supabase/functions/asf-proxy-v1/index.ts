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
    "Access-Control-Expose-Headers": "X-Verix-ASF-Relay, X-Verix-ASF-Latency-Ms, X-Verix-ASF-Queue-Wait-Ms, X-Verix-ASF-Attempts, Retry-After",
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
const UPSTREAM_TIMEOUT_MS = 10000;
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

function isTransientLicenseUnavailable(bodyText: string): boolean {
  try {
    const parsed = JSON.parse(String(bodyText || ""));
    if (!parsed || !Array.isArray(parsed.errors) || !parsed.errors.length) return false;

    return parsed.errors.some((item: any) => {
      const message = cleanText(item?.message, 240)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const unavailable =
        message.includes("servico indisponivel") ||
        message.includes("service unavailable") ||
        message.includes("temporarily unavailable");
      if (!unavailable) return false;

      const path = Array.isArray(item?.path)
        ? item.path.map((part: unknown) => cleanText(part, 40)).join(".").toLowerCase()
        : "";
      return !path || path.includes("licensenumber");
    });
  } catch (_) {
    return false;
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
    const queueWaitMs = 0;
    const started = Date.now();
    const retryDelaysMs = [300, 900];
    const maxAttempts = 3;
    let upstream: Response | null = null;
    let text = "";
    let attemptsUsed = 0;

    // Retry only fast, explicit transient GraphQL errors from licenseNumber.
    // Network timeouts and HTTP 429 are not retried here.
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        upstream = await fetch(url, {
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
        text = await upstream.text();
        attemptsUsed = attempt + 1;
      } catch (error) {
        const aborted = (error as Error)?.name === "AbortError";
        return json({
          ok: false,
          error: aborted ? "upstream_timeout" : "upstream_network",
          message: aborted ? "ASF upstream timeout" : "ASF upstream network error"
        }, aborted ? 504 : 502, req);
      } finally {
        clearTimeout(timeout);
      }

      const is2xx = upstream.status >= 200 && upstream.status < 300;
      if (
        is2xx &&
        attempt < maxAttempts - 1 &&
        isTransientLicenseUnavailable(text)
      ) {
        const waitMs = retryDelaysMs[attempt] ?? retryDelaysMs[retryDelaysMs.length - 1];
        console.warn("verix_asf_graphql_transient_retry", JSON.stringify({
          buildId,
          status: upstream.status,
          attempt: attemptsUsed,
          nextWaitMs: waitMs
        }));
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      break;
    }

    if (!upstream) {
      return json({ ok: false, error: "upstream_network", message: "ASF upstream network error" }, 502, req);
    }

    const elapsedMs = Date.now() - started;

    // Safe incident diagnostics: retain only GraphQL error summary, never
    // the submitted registration, request URL, raw request, or raw response.
    if (upstream.status === 200) {
      try {
        const bodyJson = JSON.parse(text);
        if (bodyJson && Array.isArray(bodyJson.errors) && bodyJson.errors.length) {
          const errors = bodyJson.errors.slice(0, 3).map((item: any) => ({
            message: cleanText(item?.message, 180),
            code: cleanText(item?.extensions?.code, 80),
            path: Array.isArray(item?.path)
              ? item.path.slice(0, 8).map((part: unknown) => cleanText(part, 40))
              : null
          }));
          console.warn("verix_asf_upstream_graphql_error", JSON.stringify({
            buildId,
            status: upstream.status,
            elapsedMs,
            queueWaitMs,
            attemptsUsed,
            responseBytes: new TextEncoder().encode(text).length,
            contentType: cleanText(upstream.headers.get("content-type"), 120),
            errorCount: bodyJson.errors.length,
            errors
          }));
        }
      } catch (_) {
        // Malformed responses continue through the unchanged relay behavior.
      }
    }

    const outHeaders: Record<string, string> = {
      ...corsHeaders(req),
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "X-Verix-ASF-Relay": "1",
      "X-Verix-ASF-Latency-Ms": String(elapsedMs),
      "X-Verix-ASF-Queue-Wait-Ms": String(queueWaitMs),
      "X-Verix-ASF-Attempts": String(attemptsUsed)
    };

    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) outHeaders["Retry-After"] = retryAfter;

    return new Response(text, {
      status: upstream.status,
      headers: outHeaders
    });

  } catch (error) {
    console.error(
      "verix_asf_proxy_failed",
      String((error as Error)?.message || error)
    );
    return json({ ok: false, error: "proxy_failed" }, 500, req);
  }
});
