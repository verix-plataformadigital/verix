import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;



function isLegacyLocal(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return false;
  const ua = req.headers.get("user-agent") || "";
  return /Trident\\//i.test(ua) || /MSIE\\s/i.test(ua) || /MSHTA/i.test(ua);
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
const db = createClient(SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
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
  if (m.matricula) out.matricula = cleanText(m.matricula, 30);
  if (m.matriculaNormalizada) out.matriculaNormalizada = cleanText(m.matriculaNormalizada, 30);
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
      matricula: cleanText(a.matricula, 30),
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

async function consumeRate(key: string, limit: number): Promise<boolean> {
  const { data, error } = await db.rpc("verix2_consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: 60
  });
  if (error) throw new Error(`rate_limit:${error.message}`);
  return data === true;
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

    if (!(await consumeRate(`all:${await hmacHex(clientIp(req))}`, 600))) {
      return json({ ok: false, error: "rate_limited" }, 429, req);
    }

    const body = await req.json().catch(() => null);
    const input = Array.isArray(body?.events) ? body.events.slice(0, 100) : [];
    if (!input.length) return json({ ok: true, accepted: 0, rejected: 0 });

    const events: any[] = [];

    for (const x of input) {
      const event = cleanText(x?.event, 80);
      if (!event || !allowedEvents.has(event)) continue;

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
      if (!installationId) continue;

      // Data minimization: the plate is only needed for technical ASF error investigation.
      // Correlation is done with query_id for all other outcomes.
      if (event !== "vehicle_insurance_error") {
        delete metadata.matricula;
        delete metadata.matriculaNormalizada;
        if (metadata.asfDiagnostic && typeof metadata.asfDiagnostic === "object") {
          const diag = metadata.asfDiagnostic as Record<string, unknown>;
          delete diag.matricula;
        }
      }

      // Apply one timestamp policy to every event. The queue may be offline for
      // days; dropping an old vehicle_lookup while accepting its pending/result
      // events creates orphan outcomes and false query totals. Match the 90-day
      // database retention window and reject malformed/future timestamps.
      const now = Date.now();
      const occurredAtDate = x?.occurredAt ? new Date(x.occurredAt) : new Date();
      const occurredAtMs = occurredAtDate.getTime();
      const MAX_EVENT_AGE_MS = 90 * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(occurredAtMs) ||
          occurredAtMs < now - MAX_EVENT_AGE_MS ||
          occurredAtMs > now + 5 * 60 * 1000) continue;

      if (event === "vehicle_lookup") {
        // Uma consulta precisa de instalação, query e versão; sessão/tab podem faltar.
        if (!queryId || !appVersion) continue;
        const installationKey = await hmacHex(`installation:${installationId}`);
        if (!(await consumeRate(`vehicle:${installationKey}`, 30))) continue;
      }

      if (event === "vehicle_insurance_pending" ||
          event === "vehicle_insurance_yes" ||
          event === "vehicle_insurance_no" ||
          event === "vehicle_insurance_error") {
        // Without a shared query ID these states cannot be correlated truthfully.
        if (!queryId || !appVersion) continue;
      }

      if (event === "imt_loaded") {
        if (!queryId || !appVersion || metadata.resultConfirmed !== true) continue;
      }

      if (event === "vehicle_insurance_yes" || event === "vehicle_insurance_no" || event === "vehicle_insurance_error") {
        if (!queryId || !appVersion) continue;
      }

      const occurredAt = occurredAtDate.toISOString();

      events.push({
        event_id: cleanText(x?.eventId, 120) || crypto.randomUUID(),
        installation_id: installationId,
        session_id: sessionId,
        tab_id: tabId,
        query_id: queryId,
        event,
        module: cleanText(x?.module, 60),
        occurred_at: occurredAt,
        app_version: appVersion,
        device_type: cleanText(x?.deviceType, 30),
        browser: cleanText(x?.browser, 40),
        metadata
      });
    }

    if (!events.length) return json({ ok: true, accepted: 0, rejected: input.length });

    // Impede nova duplicação do mesmo query_id. O índice SQL reforça isto,
    // mas filtramos antes do upsert para evitar conflitos que o PostgREST
    // não consegue tratar com onConflict=event_id.
    const lookupIds = [...new Set(events
      .filter(e => e.event === "vehicle_lookup" && e.query_id)
      .map(e => e.query_id))];
    const imtIds = [...new Set(events
      .filter(e => e.event === "imt_loaded" && e.query_id)
      .map(e => e.query_id))];
    const existingVehicle = new Set<string>();
    const existingImt = new Set<string>();

    if (lookupIds.length) {
      const { data, error } = await db
        .from("verix2_events")
        .select("query_id")
        .eq("event", "vehicle_lookup")
        .in("query_id", lookupIds);
      if (error) throw new Error(`lookup_dedupe:${error.message}`);
      for (const row of (data || [])) if (row?.query_id) existingVehicle.add(String(row.query_id));
    }

    if (imtIds.length) {
      const { data, error } = await db
        .from("verix2_events")
        .select("query_id")
        .eq("event", "imt_loaded")
        .eq("metadata->>resultConfirmed", "true")
        .in("query_id", imtIds);
      if (error) throw new Error(`imt_dedupe:${error.message}`);
      for (const row of (data || [])) if (row?.query_id) existingImt.add(String(row.query_id));
    }

    const batchVehicle = new Set<string>();
    const batchImt = new Set<string>();
    const seenEventIds = new Set<string>();
    const dedupedEvents = events.filter(e => {
      // A retried offline batch must not insert the same event ID twice,
      // including when duplicate IDs occur inside a single request.
      if (!e.event_id || seenEventIds.has(e.event_id)) return false;
      seenEventIds.add(e.event_id);
      if (e.event === "vehicle_lookup" && e.query_id) {
        if (existingVehicle.has(e.query_id) || batchVehicle.has(e.query_id)) return false;
        batchVehicle.add(e.query_id);
      }
      if (e.event === "imt_loaded" && e.query_id && e.metadata?.resultConfirmed === true) {
        if (existingImt.has(e.query_id) || batchImt.has(e.query_id)) return false;
        batchImt.add(e.query_id);
      }
      return true;
    });

    events.splice(0, events.length, ...dedupedEvents);
    if (!events.length) return json({ ok: true, accepted: 0, rejected: input.length });

    // One database transaction writes parent records, event rows and presence.
    // The RPC also applies database-level uniqueness rules to concurrent retries.
    const { data: ingestResult, error: ingestError } = await db.rpc("verix2_ingest_events", {
      p_events: events
    });
    if (ingestError) throw new Error(`ingest:${ingestError.message}`);
    const result = Array.isArray(ingestResult) ? ingestResult[0] : ingestResult;
    const accepted = Number(result?.accepted ?? 0);
    const rejected = Number(result?.rejected ?? Math.max(0, input.length - accepted));
    return json({
      ok: true,
      accepted,
      rejected,
      received: Number(result?.received ?? input.length),
      valid: Number(result?.valid ?? events.length)
    });
  } catch (error) {
    console.error("telemetry_write_failed", error);
    return json({ ok: false, error: "telemetry_write_failed" }, 500);
  }
});
