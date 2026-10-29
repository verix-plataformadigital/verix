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
    "Access-Control-Expose-Headers": "X-Verix-ASF-Relay, X-Verix-ASF-Latency-Ms, X-Verix-ASF-Body-Kind, X-Verix-ASF-GraphQL-Errors, X-Verix-ASF-Data-Present, X-Verix-ASF-Nodes-Count, X-Verix-ASF-Route, X-Verix-ASF-Proxy-Index, Retry-After",
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

const PROXY_USERNAME = Deno.env.get("PROXY_USERNAME") || "";
const PROXY_PASSWORD = Deno.env.get("PROXY_PASSWORD") || "";
const MAX_PROXY_ENDPOINTS = 10;

// Per-isolate round-robin. Each Edge isolate keeps its own cursor.
let proxyCursor = Math.floor(Math.random() * 1_000_000);

// Diagnóstico temporário e limitado: mede tamanhos sem registar matrícula ou valores do seguro.
let payloadProfileBudget = 10;

// Reutilização por endpoint dentro de cada isolate. A seleção round-robin continua
// a ser feita por pedido; só se evita recriar TCP/CONNECT/TLS a cada consulta.
const proxyClientPool = new Map<string, Deno.HttpClient>();

function proxyClientKey(proxy: ProxyEndpoint): string {
  return proxy.transport + "|" + proxy.url;
}

function getOrCreateProxyClient(proxy: ProxyEndpoint): Deno.HttpClient {
  const key = proxyClientKey(proxy);
  const existing = proxyClientPool.get(key);
  if (existing) return existing;

  const client = Deno.createHttpClient({
    // Keep connections alive across round-robin cycles. Requests still rotate
    // proxies per call; reuse only occurs when the same endpoint is selected
    // again while its idle connection is still available.
    poolMaxIdlePerHost: 2,
    poolIdleTimeout: 120_000,
    proxy: {
      url: proxy.url,
      transport: proxy.transport,
      ...(PROXY_USERNAME && PROXY_PASSWORD
        ? { basicAuth: { username: PROXY_USERNAME, password: PROXY_PASSWORD } }
        : {})
    }
  });
  proxyClientPool.set(key, client);
  return client;
}

function discardProxyClient(proxy: ProxyEndpoint): void {
  const key = proxyClientKey(proxy);
  const client = proxyClientPool.get(key);
  if (!client) return;
  proxyClientPool.delete(key);
  try { client.close(); } catch (_) {}
}

type ProxyEndpoint = {
  url: string;
  host: string;
  port: string;
  transport: "http" | "https" | "socks5";
};

function getProxyPool(): ProxyEndpoint[] {
  const raw = Deno.env.get("PROXY_URLS") || "";
  const entries = raw.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);

  if (entries.length < 1 || entries.length > MAX_PROXY_ENDPOINTS) {
    throw new Error("proxy_pool_not_configured");
  }
  if (Boolean(PROXY_USERNAME) !== Boolean(PROXY_PASSWORD)) {
    throw new Error("proxy_credentials_incomplete");
  }

  return entries.map(entry => {
    const parsed = new URL(entry);
    if (!["http:", "https:", "socks5:"].includes(parsed.protocol) ||
        !parsed.hostname || parsed.username || parsed.password ||
        parsed.search || parsed.hash ||
        (parsed.pathname !== "/" && parsed.pathname !== "")) {
      throw new Error("proxy_endpoint_invalid");
    }

    const transport = parsed.protocol.slice(0, -1) as "http" | "https" | "socks5";
    return {
      url: parsed.origin,
      host: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
      transport
    };
  });
}

function nextProxyIndex(poolSize: number): number {
  const index = proxyCursor % poolSize;
  proxyCursor = (proxyCursor + 1) % poolSize;
  return index;
}


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

async function gzipASFResponseIfSupported(
  req: Request,
  text: string,
  status: number,
  headers: Record<string, string>
): Promise<Response> {
  const acceptEncoding = (req.headers.get("accept-encoding") || "").toLowerCase();
  const userAgent = req.headers.get("user-agent") || "";
  const acceptsGzip = acceptEncoding.split(",").some(value => value.trim().split(";")[0] === "gzip");
  const supportsGzip =
    acceptsGzip &&
    /(?:Chrome|Chromium|Edg|Firefox|Safari)[/]/i.test(userAgent) &&
    !/(?:MSIE|Trident|MSHTA)/i.test(userAgent);

  const plainBytes = new TextEncoder().encode(text);
  if (!supportsGzip || plainBytes.byteLength < 512 ||
      typeof CompressionStream !== "function" ||
      typeof Blob !== "function" ||
      typeof Response !== "function") {
    return new Response(text, { status, headers });
  }

  try {
    const compressedStream = new Blob([plainBytes]).stream()
      .pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer());
    if (compressed.byteLength >= plainBytes.byteLength) {
      return new Response(text, { status, headers });
    }

    const finalHeaders = new Headers(headers);
    finalHeaders.set("Content-Encoding", "gzip");
    const vary = (finalHeaders.get("Vary") || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    if (!vary.some(value => value.toLowerCase() === "accept-encoding")) {
      vary.push("Accept-Encoding");
    }
    finalHeaders.set("Vary", vary.join(", "));
    finalHeaders.delete("Content-Length");
    return new Response(compressed, { status, headers: finalHeaders });
  } catch (_) {
    // Compressão é uma otimização de transporte: em caso de falha, responde em texto normal.
    return new Response(text, { status, headers });
  }
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


function sanitizeGraphQLErrorMessage(
  value: unknown,
  plate: string,
  originalPlate: unknown
): string {
  let message = String(value ?? "GraphQL error")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const original = String(originalPlate ?? "").trim().toUpperCase();
  const candidates = new Set([
    plate,
    original,
    original.replace(/[^A-Z0-9]/g, "")
  ]);

  for (const candidate of candidates) {
    if (!candidate) continue;

    const escaped = candidate.replace(
      /[.*+?^\u0024{}()|[\]\\]/g,
      "\\$&"
    );

    message = message.replace(
      new RegExp(escaped, "gi"),
      "[MATRICULA]"
    );
  }

  return message.slice(0, 240);
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

    let proxyPool: ProxyEndpoint[];
    try {
      proxyPool = getProxyPool();
    } catch (error) {
      const reason = String((error as Error)?.message || error);
      console.error("verix_asf_proxy_pool_unavailable", reason);
      return json({
        ok: false,
        error: "proxy_pool_not_configured",
        message: "ASF proxy pool is not configured correctly"
      }, 503, req);
    }

    const proxyIndex = nextProxyIndex(proxyPool.length);
    const selectedProxy = proxyPool[proxyIndex];

    const query =
      'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
      plate + '", date: "' + date +
      '") { nodes { id entity startDate endDate policy license code logo } } } } } }';

    const url = ASF_ORIGIN + ASF_PATH + "?query=" + encodeURIComponent(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const started = Date.now();

    let upstreamClient: Deno.HttpClient | undefined;
    try {
      upstreamClient = getOrCreateProxyClient(selectedProxy);

      const upstream = await fetch(url, {
        client: upstreamClient,
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
      const upstreamContentType = upstream.headers.get("content-type") || "";

      // Diagnostics deliberately exclude the plate, raw body, and insurer/policy fields.
      // This distinguishes GraphQL errors (often HTTP 200) from transport/HTML failures.
      let bodyKind = "json";
      let graphqlErrorCount = 0;
      let graphqlErrorCodes: string[] = [];
      let graphqlErrorDetails: Array<{
        message: string;
        code: string;
        path: Array<string | number>;
      }> = [];
      let hasGraphQLData = false;
      let nodesCount = -1;

      if (!text.trim()) {
        bodyKind = "empty";
      } else {
        try {
          const parsed: any = JSON.parse(text);
          if (parsed && typeof parsed === "object") {
            const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
            graphqlErrorCount = errors.length;
            graphqlErrorCodes = errors.slice(0, 3).map((item: any) => {
              const rawCode = String(item?.extensions?.code || item?.code || "unknown");
              return rawCode.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) || "unknown";
            });
            graphqlErrorDetails = errors.slice(0, 3).map((item: any) => {
              const rawCode = String(item?.extensions?.code || item?.code || "unknown");
              const code =
                rawCode.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) ||
                "unknown";

              const path: Array<string | number> = Array.isArray(item?.path)
                ? item.path.slice(0, 8).map((part: unknown) => {
                    if (typeof part === "number" && Number.isFinite(part)) {
                      return part;
                    }
                    return sanitizeGraphQLErrorMessage(
                      part,
                      plate,
                      body?.matricula
                    ).slice(0, 80);
                  })
                : [];

              return {
                message: sanitizeGraphQLErrorMessage(
                  item?.message,
                  plate,
                  body?.matricula
                ),
                code,
                path
              };
            });
            hasGraphQLData = Object.prototype.hasOwnProperty.call(parsed, "data");
            const nodes = parsed?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
            if (Array.isArray(nodes)) nodesCount = nodes.length;

            if (payloadProfileBudget > 0) {
              const fields = ["id", "entity", "startDate", "endDate", "policy", "license", "code", "logo"];
              const fieldBytes: Record<string, number> = Object.create(null);
              for (const field of fields) fieldBytes[field] = 0;
              if (Array.isArray(nodes)) {
                for (const node of nodes) {
                  if (!node || typeof node !== "object") continue;
                  for (const field of fields) {
                    const value = (node as Record<string, unknown>)[field];
                    if (value !== undefined) fieldBytes[field] += new TextEncoder().encode(JSON.stringify(value)).byteLength;
                  }
                }
              }
              console.log("verix_asf_payload_profile", JSON.stringify({
                upstreamStatus: upstream.status,
                upstreamContentEncoding: upstream.headers.get("content-encoding") || "not-exposed-by-fetch",
                upstreamContentLength: upstream.headers.get("content-length") || "not-exposed-by-fetch",
                decodedBodyBytes: new TextEncoder().encode(text).byteLength,
                nodeCount: Array.isArray(nodes) ? nodes.length : 0,
                fieldBytes
              }));
              payloadProfileBudget--;
            }
          }
        } catch (_) {
          bodyKind = (/text\/html/i.test(upstreamContentType) || /^(?:<!doctype html|<html\b)/i.test(text.trim()))
            ? "html"
            : "non_json";
        }
      }

      const diagnostic = {
        buildId,
        route: "proxy",
        proxyIndex: proxyIndex + 1,
        proxyHost: selectedProxy.host,
        upstreamStatus: upstream.status,
        elapsedMs,
        contentType: upstreamContentType.split(";")[0].slice(0, 80),
        bodyKind,
        graphqlErrorCount,
        graphqlErrorCodes,
        graphqlErrorDetails,
        hasGraphQLData,
        nodesCount
      };
      if (upstream.status !== 200 || bodyKind !== "json" || graphqlErrorCount > 0 || !hasGraphQLData) {
        console.warn("verix_asf_upstream_anomaly", JSON.stringify(diagnostic));
      }

      const outHeaders: Record<string, string> = {
        ...corsHeaders(req),
        "Content-Type": upstreamContentType || "application/json; charset=utf-8",
        "X-Verix-ASF-Relay": "1",
        "X-Verix-ASF-Route": "proxy",
        "X-Verix-ASF-Proxy-Index": String(proxyIndex + 1),
        "X-Verix-ASF-Latency-Ms": String(elapsedMs),
        "X-Verix-ASF-Body-Kind": bodyKind,
        "X-Verix-ASF-GraphQL-Errors": String(graphqlErrorCount),
        "X-Verix-ASF-Data-Present": hasGraphQLData ? "1" : "0",
        "X-Verix-ASF-Nodes-Count": String(nodesCount)
      };

      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) outHeaders["Retry-After"] = retryAfter;

      return await gzipASFResponseIfSupported(req, text, upstream.status, outHeaders);
    } catch (error) {
      // Se uma ligação reutilizada falhar, descarta-se apenas o cliente desse
      // endpoint; o próximo pedido volta a criá-lo. A rotação continua por pedido.
      discardProxyClient(selectedProxy);
      const aborted = (error as Error)?.name === "AbortError";
      return json({
        ok: false,
        error: aborted ? "upstream_timeout" : "upstream_network",
        message: aborted ? "ASF upstream timeout" : "ASF upstream network error"
      }, aborted ? 504 : 502, req);
    } finally {
      // Não fechar o cliente em cada pedido: isso força nova ligação e TLS handshake.
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(
      "verix_asf_proxy_failed",
      String((error as Error)?.message || error)
    );
    return json({ ok: false, error: "proxy_failed" }, 500, req);
  }
});
