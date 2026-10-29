import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const IP_CHECK_URL = "https://api.ipify.org?format=json";

function shortError(error: unknown): string {
  return String(error instanceof Error ? error.message : error).slice(0, 240);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return Response.json(
      { ok: false, error: "Use GET for this diagnostic endpoint." },
      { status: 405, headers: corsHeaders },
    );
  }

  const proxyUrl = Deno.env.get("PROXY_URL") ?? "";
  const proxyUsername = Deno.env.get("PROXY_USERNAME") ?? "";
  const proxyPassword = Deno.env.get("PROXY_PASSWORD") ?? "";

  if (!proxyUrl) {
    return Response.json({
      ok: false,
      stage: "configuration",
      message: "Proxy not configured. Add PROXY_URL in Supabase Edge Function Secrets. If required by the provider, also add PROXY_USERNAME and PROXY_PASSWORD.",
      proxyConfigured: false,
      noProxyTestPerformed: true,
    }, { status: 424, headers: corsHeaders });
  }

  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
    if (!["http:", "https:", "socks5:"].includes(parsed.protocol) ||
        !parsed.hostname || parsed.username || parsed.password) {
      throw new Error("Unsupported or invalid proxy URL. Use a URL such as http://host:port and set credentials separately.");
    }
  } catch (error) {
    return Response.json({
      ok: false,
      stage: "configuration",
      message: shortError(error),
      proxyConfigured: false,
    }, { status: 400, headers: corsHeaders });
  }

  // Strictly fixed diagnostic destination: no caller-supplied URL, no ASF requests.
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 3; i++) {
    let client: Deno.HttpClient | undefined;
    const started = Date.now();
    try {
      const proxy: Deno.Proxy = {
        url: proxyUrl,
        ...(proxyUsername && proxyPassword
          ? { basicAuth: { username: proxyUsername, password: proxyPassword } }
          : {}),
        ...(parsed.protocol === "socks5:" ? { transport: "socks5" as const } : {}),
      };
      client = Deno.createHttpClient({ proxy });
      const response = await fetch(IP_CHECK_URL, {
        client,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.text();
      let ip: string | null = null;
      if (response.ok) {
        try {
          const parsedBody = JSON.parse(body);
          ip = typeof parsedBody.ip === "string" ? parsedBody.ip : null;
        } catch {
          // Report only a bounded diagnostic if the response isn't JSON.
        }
      }
      results.push({
        attempt: i + 1,
        ok: response.ok && ip !== null,
        status: response.status,
        elapsedMs: Date.now() - started,
        ip,
        ...(response.ok && ip === null ? { error: "Unexpected response format from IP diagnostic service." } : {}),
      });
    } catch (error) {
      results.push({
        attempt: i + 1,
        ok: false,
        elapsedMs: Date.now() - started,
        error: shortError(error),
      });
    } finally {
      client?.close();
    }
  }

  const ips = results.filter((x) => x.ok && typeof x.ip === "string").map((x) => x.ip as string);
  return Response.json({
    ok: results.length === 3 && results.every((x) => x.ok),
    stage: "proxy-connectivity",
    proxyConfigured: true,
    target: "https://api.ipify.org?format=json",
    attempts: results,
    distinctExitIps: new Set(ips).size,
    note: "This checks proxy connectivity only. Distinct IPs depend on the provider's rotation policy; this diagnostic does not call ASF or any other target.",
  }, { headers: corsHeaders });
});