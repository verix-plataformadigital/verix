import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

const IP_CHECK_URL = "https://api.ipify.org?format=json";
const MAX_ENDPOINTS = 10;
const TIMEOUT_MS = 8000;

function safeError(error: unknown, username: string, password: string): string {
  let message = String(error instanceof Error ? error.message : error);
  if (username) message = message.split(username).join("[USER]");
  if (password) message = message.split(password).join("[PASS]");
  return message.replace(/https?:\/\/[^\s]+/gi, "[proxy endpoint]").slice(0, 160);
}

function parseProxyEndpoints(raw: string): URL[] {
  const items = raw.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  if (items.length === 0) throw new Error("PROXY_URLS is empty.");
  if (items.length > MAX_ENDPOINTS) throw new Error("Too many endpoints; maximum is " + MAX_ENDPOINTS + ".");

  return items.map((item) => {
    const u = new URL(item);
    if (!["http:", "https:", "socks5:"].includes(u.protocol)) {
      throw new Error("Each endpoint must use http://, https://, or socks5://.");
    }
    if (!u.hostname || u.username || u.password || u.search || u.hash ||
        (u.pathname !== "/" && u.pathname !== "")) {
      throw new Error("Endpoints must contain only protocol, host, and optional port; store credentials separately.");
    }
    return u;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return Response.json({ ok: false, error: "Use GET." }, { status: 405, headers: corsHeaders });
  }

  const rawEndpoints = Deno.env.get("PROXY_URLS") ?? "";
  const username = Deno.env.get("PROXY_USERNAME") ?? "";
  const password = Deno.env.get("PROXY_PASSWORD") ?? "";

  if (!rawEndpoints.trim()) {
    return Response.json({
      ok: false,
      stage: "configuration",
      proxyConfigured: false,
      message: "Add PROXY_URLS in Supabase Edge Function Secrets. Use one proxy URL per line. Add PROXY_USERNAME and PROXY_PASSWORD if required by the provider.",
      noExternalTestsPerformed: true,
    }, { status: 424, headers: corsHeaders });
  }
  if (Boolean(username) !== Boolean(password)) {
    return Response.json({
      ok: false,
      stage: "configuration",
      message: "Set both PROXY_USERNAME and PROXY_PASSWORD, or leave both empty.",
    }, { status: 400, headers: corsHeaders });
  }

  let endpoints: URL[];
  try {
    endpoints = parseProxyEndpoints(rawEndpoints);
  } catch (error) {
    return Response.json({
      ok: false,
      stage: "configuration",
      message: safeError(error, username, password),
    }, { status: 400, headers: corsHeaders });
  }

  // Connectivity diagnostic only: the destination is fixed to ipify.
  // This function does not call ASF or modify the production VÉRIX relay.
  const attempts = await Promise.all(endpoints.map(async (endpoint, index) => {
    const started = Date.now();
    let client: Deno.HttpClient | undefined;
    try {
      const protocol = endpoint.protocol.slice(0, -1) as "http" | "https" | "socks5";
      const proxy: Deno.Proxy = {
        url: endpoint.toString(),
        transport: protocol,
        ...(username && password ? { basicAuth: { username, password } } : {}),
      };
      client = Deno.createHttpClient({ proxy });
      const response = await fetch(IP_CHECK_URL, {
        client,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "Accept": "application/json" },
      });
      const body = await response.text();
      let ip: string | null = null;
      if (response.ok) {
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.ip === "string" && parsed.ip.length <= 64) ip = parsed.ip;
        } catch {
          // Bounded diagnostic only.
        }
      }
      return {
        endpoint: index + 1,
        host: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === "https:" ? "443" : "80"),
        ok: response.ok && ip !== null,
        status: response.status,
        elapsedMs: Date.now() - started,
        egressIp: ip,
        ...(!response.ok ? { error: "IP diagnostic endpoint returned a non-success status." } :
          (ip === null ? { error: "Unexpected response from IP diagnostic endpoint." } : {})),
      };
    } catch (error) {
      return {
        endpoint: index + 1,
        host: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === "https:" ? "443" : "80"),
        ok: false,
        elapsedMs: Date.now() - started,
        error: safeError(error, username, password),
      };
    } finally {
      client?.close();
    }
  }));

  const good = attempts.filter((x) => x.ok && typeof x.egressIp === "string");
  const distinctIps = new Set(good.map((x) => x.egressIp)).size;
  return Response.json({
    ok: good.length > 0 && good.length === endpoints.length,
    stage: "proxy-pool-connectivity",
    proxyConfigured: true,
    target: IP_CHECK_URL,
    configuredEndpoints: endpoints.length,
    successfulEndpoints: good.length,
    distinctExitIps: distinctIps,
    attempts,
    note: "Tests only proxy connectivity and observed egress IPs. It does not call ASF and does not change asf-proxy-v1.",
  }, { headers: corsHeaders });
});
