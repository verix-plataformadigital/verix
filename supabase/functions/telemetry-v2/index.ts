import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { createLocalRateLimiter } from "./rate_limit.ts";

declare const Deno: any;



function isLegacyLocal(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return false;
  const ua = req.headers.get("user-agent") || "";
  return /Trident\//i.test(ua) || /MSIE\s/i.test(ua) || /MSHTA/i.test(ua);
}

function corsHeaders(req?: Request) {
  const origin = req?.headers.get("origin") || "";
  const opaqueLocal = !origin || origin === "null";
  const allowedOrigin = opaqueLocal
    ? "*"
    : (ALLOWED_ORIGINS.has(origin) ? origin : "");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type,apikey,authorization,x-verix-build-id",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY"
  };
}

const TELEMETRY_GZIP_MAGIC = new Uint8Array([86, 88, 84, 71, 49, 10]); // "VXTG1\\n"

function hasTelemetryGzipPrefix(bytes: Uint8Array): boolean {
  if (bytes.byteLength < TELEMETRY_GZIP_MAGIC.byteLength) return false;
  for (let i = 0; i < TELEMETRY_GZIP_MAGIC.byteLength; i++) {
    if (bytes[i] !== TELEMETRY_GZIP_MAGIC[i]) return false;
  }
  return true;
}

async function parseTelemetryBody(raw: Uint8Array): Promise<any> {
  let payload = raw;
  if (hasTelemetryGzipPrefix(raw)) {
    if (typeof DecompressionStream !== "function" || typeof Blob !== "function") {
      throw new Error("gzip_not_supported");
    }

    const compressed = raw.slice(TELEMETRY_GZIP_MAGIC.byteLength);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > 1024 * 1024) {
          try { await reader.cancel(); } catch (_) {}
          const error = new Error("payload_too_large");
          (error as any).code = "PAYLOAD_TOO_LARGE";
          throw error;
        }
        chunks.push(part.value);
      }
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }

    payload = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  if (payload.byteLength > 1024 * 1024) {
    const error = new Error("payload_too_large");
    (error as any).code = "PAYLOAD_TOO_LARGE";
    throw error;
  }
  return JSON.parse(new TextDecoder().decode(payload));
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

function resolveSecretKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" && parsed) return parsed;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.default === "string" && parsed.default) return parsed.default;
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value) return value;
        }
      }
    } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

const secretKey = resolveSecretKey();
const rateSecret = Deno.env.get("VERIX_TELEMETRY_RATE_SECRET") || "";
// The collector must not query Postgres to decide whether it may query Postgres.
// This bounded per-isolate guard protects bursts without adding DB round-trips.
const consumeLocalRate = createLocalRateLimiter(5000);
const db = createClient(SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  // Telemetry is queued by the client and acknowledged by event ID.
  // Disable hidden PostgREST retries; each write below has an explicit deadline.
  db: { retry: false }
});

const ALLOWED_ORIGINS = new Set([
  "https://verix.vxops.workers.dev",
  "https://verix-plataformadigital.github.io",
  "http://localhost",
  "http://127.0.0.1"
]);

const allowedEvents = new Set([
  "app_open","heartbeat","vehicle_lookup",
  "vehicle_insurance_pending","vehicle_insurance_yes",
  "vehicle_insurance_no","vehicle_insurance_error",
  "imt_loaded","module_open","history_open","history_reopen",
  "external_tool_open","alcohol_lookup",
  "cinemometer_operation_start","cinemometer_speed_entry","cinemometer_calculation",
  "cinemometer_copy_code","cinemometer_copy_text","cinemometer_copy_location",
  "cinemometer_profile_select","cinemometer_profile_new",
  "cinemometer_profile_duplicate","cinemometer_profile_delete",
  "cinemometer_profile_save","legislation_category_open",
  "legislation_search","legislation_copy","legislation_favorite_toggle"
]);

function json(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" }
  });
}

function cleanText(value: unknown, max: number): string | null {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const m = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (m.queryId) out.queryId = cleanText(m.queryId, 120);
  if (m.source) out.source = cleanText(m.source, 80);
  if (m.itemId) out.itemId = cleanText(m.itemId, 120);
  if (m.itemLabel) out.itemLabel = cleanText(m.itemLabel, 180);
  if (m.copyType) out.copyType = cleanText(m.copyType, 40);
  if (m.resultConfirmed === true) out.resultConfirmed = true;
  if (m.asfUserMessage) out.asfUserMessage = cleanText(m.asfUserMessage, 500);
  if (m.profile_id) out.profile_id = cleanText(m.profile_id, 120);
  if (m.operation_id) out.operation_id = cleanText(m.operation_id, 120);
  if (m.build_id) out.build_id = cleanText(m.build_id, 60);

  if (m.cin && typeof m.cin === "object" && !Array.isArray(m.cin)) {
    const c = m.cin as Record<string, unknown>;
    out.cin = {
      velocidade_registada: finiteNumber(c.velocidade_registada),
      velocidade_deduzida: finiteNumber(c.velocidade_deduzida),
      limite: finiteNumber(c.limite),
      excesso: finiteNumber(c.excesso),
      gravidade: cleanText(c.gravidade, 40),
      codigo: cleanText(c.codigo, 30),
      modo: cleanText(c.modo, 30),
      veiculo: cleanText(c.veiculo, 80),
      enquadramento: cleanText(c.enquadramento, 60),
      verificacao: cleanText(c.verificacao, 30),
      operador_posto: cleanText(c.operador_posto, 120),
      operador_numero: cleanText(c.operador_numero, 40),
      operador_nome: cleanText(c.operador_nome, 100),
      operador_identificado: c.operador_identificado === true,
      aparelho_marca: cleanText(c.aparelho_marca, 100),
      aparelho_modelo: cleanText(c.aparelho_modelo, 100),
      aparelho_serie: cleanText(c.aparelho_serie, 80),
      aparelho_configurado: c.aparelho_configurado === true,
      perfil_id: cleanText(c.perfil_id, 120),
      operation_id: cleanText(c.operation_id, 120),
      local: cleanText(c.local, 120),
      distrito: cleanText(c.distrito, 80),
      via: cleanText(c.via, 160),
      sentido: cleanText(c.sentido, 80),
      km: cleanText(c.km, 40)
    };
  }
  if (m.copy_result === true) out.copy_result = true;
  if (m.retry === true) out.retry = true;
  if (m.retryOf) out.retryOf = cleanText(m.retryOf, 120);

  if (m.client && typeof m.client === "object" && !Array.isArray(m.client)) {
    const c = m.client as Record<string, unknown>;
    out.client = {
      browser: cleanText(c.browser, 40),
      browserVersion: cleanText(c.browserVersion, 40),
      osPlatform: cleanText(c.osPlatform, 30),
      osVersion: cleanText(c.osVersion, 40),
      navigatorPlatform: cleanText(c.navigatorPlatform, 40),
      uaMobile: typeof c.uaMobile === "boolean" ? c.uaMobile : null,
      online: typeof c.online === "boolean" ? c.online : null,
      connectionType: cleanText(c.connectionType, 30),
      effectiveType: cleanText(c.effectiveType, 20),
      downlinkMbps: finiteNumber(c.downlinkMbps),
      rttMs: finiteNumber(c.rttMs),
      saveData: typeof c.saveData === "boolean" ? c.saveData : null,
      hardwareConcurrency: finiteNumber(c.hardwareConcurrency),
      deviceMemoryGb: finiteNumber(c.deviceMemoryGb),
      viewport: cleanText(c.viewport, 30),
      devicePixelRatio: finiteNumber(c.devicePixelRatio),
      uaDataAvailable: typeof c.uaDataAvailable === "boolean" ? c.uaDataAvailable : false
    };
  }

  if (m.asfDiagnostic && typeof m.asfDiagnostic === "object" && !Array.isArray(m.asfDiagnostic)) {
    const a = m.asfDiagnostic as Record<string, unknown>;
    const isErrorDiag =
      !!a.asfErrorType ||
      Number(a.asfGraphqlErrorCount ?? 0) > 0 ||
      !!a.asfNetworkError ||
      !!a.asfRawResponse;

    const attempts = Array.isArray(a.asfAttempts)
      ? a.asfAttempts.slice(-6).map((t: any) => ({
          method: cleanText(t?.method, 20),
          transport: cleanText(t?.transport, 40),
          status: finiteNumber(t?.status),
          durationMs: finiteNumber(t?.durationMs),
          errorType: cleanText(t?.errorType, 60),
          message: cleanText(t?.message, 500),
          responseBytes: finiteNumber(t?.responseBytes),
          responseHash: cleanText(t?.responseHash, 20),
          responseContentType: cleanText(t?.responseContentType, 120),
          statusText: cleanText(t?.statusText, 120)
        }))
      : [];

    const diag: Record<string, unknown> = {
      captureVersion: cleanText(a.captureVersion, 10),
      asfForensicsVersion: cleanText(a.asfForensicsVersion, 10),
      asfCaptureId: cleanText(a.asfCaptureId, 120),
      build_id: cleanText(a.build_id, 60),
      queryId: cleanText(a.queryId, 120),
      asfHttpStatus: finiteNumber(a.asfHttpStatus),
      asfDurationMs: finiteNumber(a.asfDurationMs),
      asfTotalMs: finiteNumber(a.asfTotalMs),
      asfQueueWaitMs: finiteNumber(a.asfQueueWaitMs),
      asfQueuePosition: finiteNumber(a.asfQueuePosition),
      asfMethod: cleanText(a.asfMethod, 20),
      asfTransport: cleanText(a.asfTransport, 40),
      asfErrorType: cleanText(a.asfErrorType, 60),
      asfMessage: cleanText(a.asfMessage, 500),
      asfResponseBytes: finiteNumber(a.asfResponseBytes),
      asfRelayLatencyMs: finiteNumber(a.asfRelayLatencyMs),
      asfResponseHash: cleanText(a.asfResponseHash, 20),
      asfResponseContentType: cleanText(a.asfResponseContentType, 120),
      asfStatusText: cleanText(a.asfStatusText, 120),
      asfParsePath: cleanText(a.asfParsePath, 180),
      asfResponseClass: cleanText(a.asfResponseClass, 60),
      asfGraphqlErrorCount: finiteNumber(a.asfGraphqlErrorCount),
      asfGraphqlCodes: Array.isArray(a.asfGraphqlCodes)
        ? a.asfGraphqlCodes.slice(0, 10).map((x: unknown) => cleanText(x, 120)).filter(Boolean)
        : [],
      asfGraphqlMessages: Array.isArray(a.asfGraphqlMessages)
        ? a.asfGraphqlMessages.slice(0, 10).map((x: unknown) => cleanText(x, 1000)).filter(Boolean)
        : [],
      asfAttempts: attempts
    };

    if (isErrorDiag) {
      /*
       * Mantemos apenas forense leve. Query, body, URL, headers e resposta
       * bruta podem conter matrícula/apólice/dados do serviço ASF e não precisam
       * de ser persistidos para diagnosticar a falha.
       */
      diag.asfCaptureAgeMs = finiteNumber(a.asfCaptureAgeMs);
      diag.asfCaptureMatch = cleanText(a.asfCaptureMatch, 80);

      diag.asfNetworkError = a.asfNetworkError && typeof a.asfNetworkError === "object"
        ? {
            name: cleanText((a.asfNetworkError as any)?.name, 80),
            message: cleanText((a.asfNetworkError as any)?.message, 500)
          }
        : null;

      diag.asfResourceTiming = a.asfResourceTiming && typeof a.asfResourceTiming === "object"
        ? {
            startTime: finiteNumber((a.asfResourceTiming as any)?.startTime),
            responseStart: finiteNumber((a.asfResourceTiming as any)?.responseStart),
            responseEnd: finiteNumber((a.asfResourceTiming as any)?.responseEnd),
            duration: finiteNumber((a.asfResourceTiming as any)?.duration)
          }
        : null;

      diag.asfClientContext = a.asfClientContext && typeof a.asfClientContext === "object"
        ? {
            online: typeof (a.asfClientContext as any)?.online === "boolean"
              ? (a.asfClientContext as any).online
              : null,
            effectiveType: cleanText((a.asfClientContext as any)?.effectiveType, 20),
            rttMs: finiteNumber((a.asfClientContext as any)?.rttMs)
          }
        : null;

      diag.asfGraphqlErrors = Array.isArray(a.asfGraphqlErrors)
        ? a.asfGraphqlErrors.slice(0, 10).map((x: any) => ({
            message: cleanText(x?.message, 1000),
            path: Array.isArray(x?.path) ? x.path.slice(0, 10) : null
          }))
        : [];
    }

    out.asfDiagnostic = diag;
  }
  return out;
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

async function hmacHex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rateSecret || secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(value)
  ));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function isTimeoutOrAbort(error: unknown): boolean {
  const value = error as any;
  const name = String(value?.name || value?.cause?.name || "");
  const message = String(value?.message || value?.cause?.message || "");
  return name === "AbortError" ||
    name === "TimeoutError" ||
    String(value?.code || "") === "57014" ||
    /abort(?:ed)?|timeout|timed out|statement timeout/i.test(message);
}




/*
 * PostgREST outage circuit breaker.
 * During schema-cache/DB timeouts, durable events remain unacknowledged in
 * the client queue. Ephemeral heartbeats may be acknowledged because live
 * presence is handled independently by the Realtime presence channel.
 */
// Emergency global fail-closed mode while the Postgres/PostgREST backend recovers.
// Durable event IDs remain unacknowledged; clients must retain them for retry.
const TELEMETRY_DB_FAIL_CLOSED = false;
const TELEMETRY_DB_FAIL_CLOSED_RETRY_MS = 60_000;
const TELEMETRY_DB_COOLDOWN_MS = 20_000;
let telemetryDbUnavailableUntil = 0;

function isTransientPostgrestFailure(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : String((error as any)?.message || error || "");
  return /PGRST002|Could not query the database for the schema cache|atomic_ingest_timeout|statement timeout|57014|connection terminated|ECONNRESET|server closed the connection/i.test(message);
}

function telemetryCircuitOpenResponse(
  req: Request,
  received: any[],
  heartbeatAcknowledgedIds: string[],
  retryAfterMs: number
): Response {
  const retryIds = [...new Set(
    received
      .filter((event: any) => cleanText(event?.event, 80) !== "heartbeat")
      .map((event: any) => cleanText(event?.eventId, 120))
      .filter(Boolean)
  )] as string[];
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(JSON.stringify({
    ok: false,
    error: "telemetry_backend_degraded",
    retryable: true,
    retry_after_ms: retryAfterMs,
    received: received.length,
    considered: 0,
    acknowledged_event_ids: heartbeatAcknowledgedIds,
    discarded_heartbeat: heartbeatAcknowledgedIds.length,
    retry_event_ids: retryIds
  }), {
    status: 503,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(seconds),
      "Cache-Control": "no-store"
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, req);
  if (!SUPABASE_URL || !secretKey) return json({ ok: false, error: "telemetry_not_configured" }, 503, req);
  if (!rateSecret && !secretKey) return json({ ok: false, error: "rate_secret_not_configured" }, 503, req);

  const origin = req.headers.get("origin") || "";
  const opaqueLocal = !origin || origin === "null";
  if (!(opaqueLocal || ALLOWED_ORIGINS.has(origin) || isLegacyLocal(req))) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, req);
  }

  // O build ID é apenas metadado de correlação. A telemetria não depende dele
  // para permanecer operacional quando uma build legítima é atualizada.
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 1024 * 1024) {
      return json({ ok: false, error: "payload_too_large" }, 413, req);
    }

    if (!consumeLocalRate(`all:${await hmacHex(clientIp(req))}`, 600, 60)) {
      return json({ ok: false, error: "rate_limited" }, 429, req);
    }

    let body: any = null;
    try {
      const rawBody = new Uint8Array(await req.arrayBuffer());
      if (rawBody.byteLength > 1024 * 1024) {
        return json({ ok: false, error: "payload_too_large" }, 413, req);
      }
      body = await parseTelemetryBody(rawBody);
    } catch (error) {
      const code = (error as any)?.code;
      if (code === "PAYLOAD_TOO_LARGE" || code === "ERR_BUFFER_TOO_LARGE") {
        return json({ ok: false, error: "payload_too_large" }, 413, req);
      }
      return json({ ok: false, error: "invalid_payload" }, 400, req);
    }
    const received = Array.isArray(body?.events) ? body.events : [];
    // Keep only the newest ephemeral heartbeat per installation/session in each batch.
    // The SQL ingest RPC updates verix2_sessions.last_seen but deliberately does not
    // insert heartbeat rows into verix2_events.
    const heartbeatEvents = received.filter((x: any) => cleanText(x?.event, 80) === "heartbeat");
    const heartbeatAcknowledgedIds = [...new Set(
      heartbeatEvents
        .filter((x: any) => !!cleanText(x?.installationId, 120))
        .map((x: any) => cleanText(x?.eventId, 120))
        .filter(Boolean)
    )] as string[];
    const newestHeartbeatBySession = new Map<string, any>();
    for (const heartbeat of heartbeatEvents) {
      const installationId = cleanText(heartbeat?.installationId, 120);
      if (!installationId) continue;
      const sessionId = cleanText(heartbeat?.sessionId, 120);
      const key = installationId + "|" + (sessionId || "no-session");
      const old = newestHeartbeatBySession.get(key);
      const nextTime = Date.parse(String(heartbeat?.occurredAt || ""));
      const oldTime = old ? Date.parse(String(old?.occurredAt || "")) : Number.NEGATIVE_INFINITY;
      if (!old || (Number.isFinite(nextTime) && (!Number.isFinite(oldTime) || nextTime >= oldTime))) {
        newestHeartbeatBySession.set(key, heartbeat);
      }
    }
    const durableEvents = received.filter((x: any) => cleanText(x?.event, 80) !== "heartbeat");

    // Global fail-closed switch: every Edge isolate now rejects durable writes
    // before contacting PostgREST, preventing cold isolates from each making
    // a first 12-second database attempt during this incident.
    // Durable event IDs are returned for retry and are never acknowledged here.
    if (TELEMETRY_DB_FAIL_CLOSED) {
      return telemetryCircuitOpenResponse(
        req,
        durableEvents,
        heartbeatAcknowledgedIds,
        TELEMETRY_DB_FAIL_CLOSED_RETRY_MS
      );
    }

    // Do not fan out repeated PostgREST requests while its schema cache is unavailable.
    // No durable event ID is acknowledged here, so the client retains and retries it.
    const circuitRemaining = telemetryDbUnavailableUntil - Date.now();
    if (circuitRemaining > 0) {
      return telemetryCircuitOpenResponse(
        req,
        durableEvents,
        heartbeatAcknowledgedIds,
        circuitRemaining
      );
    }

    const durableInput = durableEvents.slice(0, 100);
    const heartbeatInput = [...newestHeartbeatBySession.values()].slice(0, Math.max(0, 100 - durableInput.length));
    const input = [...durableInput, ...heartbeatInput];
    // The browser acknowledges durable events by stable event ID; heartbeats are
    // acknowledged in bulk after the newest per-session signal is processed.
    let rejected = durableEvents.length - durableInput.length;
    const rejectedEventIds: string[] = [];
    const retryEventIds: string[] = [];
    const rejectionReasons: Record<string, string> = Object.create(null);
    const rejectedIdSet = new Set<string>();
    const retryIdSet = new Set<string>();
    function rejectEvent(x: any, reason: string, retryable = false) {
      rejected += 1;
      const id = cleanText(x?.eventId, 120);
      if (!id) return;
      if (!rejectedIdSet.has(id)) {
        rejectedIdSet.add(id);
        rejectedEventIds.push(id);
      }
      rejectionReasons[id] = reason;
      if (retryable && !retryIdSet.has(id)) {
        retryIdSet.add(id);
        retryEventIds.push(id);
      }
    }
    // Reject oversized tail entries explicitly; the normal client batch is 25.
    for (const x of durableEvents.slice(100, 1100)) {
      const id = cleanText(x?.eventId, 120);
      if (id && !rejectedIdSet.has(id)) {
        rejectedIdSet.add(id);
        rejectedEventIds.push(id);
        rejectionReasons[id] = "batch_too_large";
      }
    }
    if (!input.length) {
      return json({
        ok: true, accepted: 0, inserted: 0, duplicates: 0, rejected,
        received: received.length, considered: 0,
        acknowledged_event_ids: heartbeatAcknowledgedIds,
        discarded_heartbeat: heartbeatEvents.length,
        rejected_event_ids: rejectedEventIds,
        retry_event_ids: retryEventIds,
        rejection_reasons: rejectionReasons
      });
    }

    const events: any[] = [];
    for (const x of input) {
      const event = cleanText(x?.event, 80);
      if (!event || !allowedEvents.has(event)) { rejectEvent(x, "invalid_event"); continue; }

      const metadata = cleanMetadata(x?.metadata);
      const installationId = cleanText(x?.installationId, 120);
      const sessionId = cleanText(x?.sessionId, 120);
      const tabId = cleanText(x?.tabId, 120);
      const queryId = cleanText(x?.queryId || metadata.queryId, 120);
      const appVersion = cleanText(x?.appVersion, 40);
      const buildId = cleanText(x?.buildId || metadata.build_id, 60) || appVersion;
      if (!metadata.build_id) metadata.build_id = buildId;
      // installation_id é a única identidade técnica obrigatória: a coluna é NOT NULL.
      // session/tab são opcionais para permitir contabilização mesmo quando o browser
      // perde uma dessas chaves entre refresh/restore.
      if (!installationId) { rejectEvent(x, "missing_installation_id"); continue; }

      if (event === "vehicle_lookup") {
        // Uma consulta precisa de instalação, query e versão; sessão/tab podem faltar.
        if (!queryId || !appVersion) { rejectEvent(x, "missing_query_id_or_version"); continue; }

        const d = x?.occurredAt ? new Date(x.occurredAt) : new Date();
        const now = Date.now();
        const ts = d.getTime();
        if (!Number.isFinite(ts) || ts < now - 24 * 60 * 60 * 1000 || ts > now + 5 * 60 * 1000) { rejectEvent(x, "invalid_or_stale_timestamp"); continue; }

        const installationKey = await hmacHex(`installation:${installationId}`);
        if (!consumeLocalRate(`vehicle:${installationKey}`, 30, 60)) { rejectEvent(x, "rate_limited", true); continue; }
      }

      if (event === "imt_loaded") {
        if (!queryId || !appVersion || metadata.resultConfirmed !== true) { rejectEvent(x, "unconfirmed_imt_result"); continue; }
      }

      if (event === "vehicle_insurance_yes" || event === "vehicle_insurance_no" || event === "vehicle_insurance_error") {
        if (!queryId || !appVersion) { rejectEvent(x, "missing_query_id_or_version"); continue; }
      }

      const occurredAtDate = x?.occurredAt ? new Date(x.occurredAt) : new Date();
      const occurredAt = Number.isFinite(occurredAtDate.getTime())
        ? occurredAtDate.toISOString()
        : new Date().toISOString();
      const eventId = cleanText(x?.eventId, 120) || crypto.randomUUID();

      // No plate, metadata, installation/session identity or client fingerprint
      // is retained or forwarded. These three values are the complete DB payload.
      events.push({
        event_id: eventId,
        query_id: queryId,
        event,
        occurred_at: occurredAt
      });
    }

    if (!events.length) {
      return json({
        ok: true, accepted: 0, inserted: 0, duplicates: 0,
        rejected, received: received.length, considered: 0,
        acknowledged_event_ids: heartbeatAcknowledgedIds,
        discarded_heartbeat: heartbeatEvents.length,
        rejected_event_ids: rejectedEventIds,
        retry_event_ids: retryEventIds,
        rejection_reasons: rejectionReasons
      });
    }

    // Counter-only ingestion: send only event ID for acknowledgement plus query ID, event type and timestamp.
    // No installation/session aggregates or event metadata are sent to Postgres.
    // The RPC only updates the two lifetime counters and short-lived hashed dedupe state.
    const { data: ingestData, error: ingestError } = await db.rpc("verix2_ingest_telemetry", {
      p_events: events,
      p_installations: [],
      p_sessions: []
    }).abortSignal(AbortSignal.timeout(5000));
    if (ingestError) {
      if (isTransientPostgrestFailure(ingestError)) {
        telemetryDbUnavailableUntil = Date.now() + TELEMETRY_DB_COOLDOWN_MS;
      }
      if (isTimeoutOrAbort(ingestError)) {
        const timeout = new Error("atomic_ingest_timeout");
        timeout.name = "TimeoutError";
        throw timeout;
      }
      throw new Error(`atomic_ingest:${ingestError.message}`);
    }

    // A confirmed commit closes the circuit for this Edge isolate.
    telemetryDbUnavailableUntil = 0;
    const receipt = Array.isArray(ingestData) ? ingestData[0] : ingestData;
    const inserted = Number(receipt?.events_inserted);
    if (receipt?.ok !== true || !Number.isInteger(inserted) || inserted < 0 || inserted > events.length) {
      throw new Error("atomic_ingest:invalid_receipt");
    }

    const duplicates = events.filter((event: any) => event.event !== "heartbeat").length - inserted;
    const sessionsDetached = Number(receipt?.sessions_detached || 0);
    if (sessionsDetached > 0) {
      console.warn("telemetry_session_attribution_detached", JSON.stringify({
        count: sessionsDetached,
        inserted
      }));
    }
    return json({
      ok: true,
      accepted: inserted,
      inserted,
      duplicates,
      sessions_detached: sessionsDetached,
      rejected,
      received: received.length,
      considered: events.length,
      // Every valid submitted ID is now represented by an insert or an
      // existing id/query unique-key row after this RPC committed successfully.
      acknowledged_event_ids: [...new Set([
        ...events.map((event: any) => event.event_id),
        ...heartbeatAcknowledgedIds
      ])],
      discarded_heartbeat: heartbeatEvents.length,
      rejected_event_ids: rejectedEventIds,
      retry_event_ids: retryEventIds,
      rejection_reasons: rejectionReasons
    });
  } catch (error) {
    if (isTransientPostgrestFailure(error)) {
      telemetryDbUnavailableUntil = Date.now() + TELEMETRY_DB_COOLDOWN_MS;
    }
    console.error("telemetry_write_failed", error);
    if (isTimeoutOrAbort(error)) {
      return json({ ok: false, error: "telemetry_backend_timeout", retryable: true }, 503, req);
    }
    return json({ ok: false, error: "telemetry_write_failed" }, 500, req);
  }
});
