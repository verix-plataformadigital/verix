import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

const ASF_URL = "https://ext01.asf.com.pt/api/src/";
const TEST_PLATE = "ZZZZZZ";
const TEST_DATE = "2026/10/29";
const TIMEOUT_MS = 12000;

function safeError(error: unknown, username: string, password: string): string {
  let message = String(error instanceof Error ? error.message : error);
  if (username) message = message.split(username).join("[USER]");
  if (password) message = message.split(password).join("[PASS]");
  return message.replace(/https?:\/\/[^\s]+/gi, "[endpoint]").slice(0, 160);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return Response.json({ ok: false, error: "Use GET." }, { status: 405, headers: corsHeaders });
  }

  const raw = Deno.env.get("PROXY_URLS") ?? "";
  const username = Deno.env.get("PROXY_USERNAME") ?? "";
  const password = Deno.env.get("PROXY_PASSWORD") ?? "";
  if (!raw.trim()) {
    return Response.json({
      ok: false,
      stage: "configuration",
      message: "PROXY_URLS is missing.",
      requestsToASF: 0,
    }, { status: 424, headers: corsHeaders });
  }
  if (Boolean(username) !== Boolean(password)) {
    return Response.json({
      ok: false,
      stage: "configuration",
      message: "Set both proxy username and password, or leave both empty.",
      requestsToASF: 0,
    }, { status: 400, headers: corsHeaders });
  }

  const firstEndpoint = raw.split(/[\n,;]+/).map((x) => x.trim()).find(Boolean);
  let endpoint: URL;
  try {
    if (!firstEndpoint) throw new Error("PROXY_URLS contains no endpoint.");
    endpoint = new URL(firstEndpoint);
    if (!["http:", "https:", "socks5:"].includes(endpoint.protocol) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        (endpoint.pathname !== "/" && endpoint.pathname !== "")) {
      throw new Error("Invalid proxy URL format.");
    }
  } catch (error) {
    return Response.json({
      ok: false,
      stage: "configuration",
      message: safeError(error, username, password),
      requestsToASF: 0,
    }, { status: 400, headers: corsHeaders });
  }

  const query =
    'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
    TEST_PLATE + '", date: "' + TEST_DATE +
    '") { nodes { id entity startDate endDate policy license code logo } } } } } }';
  const url = ASF_URL + "?query=" + encodeURIComponent(query);
  const started = Date.now();
  let client: Deno.HttpClient | undefined;

  try {
    const protocol = endpoint.protocol.slice(0, -1) as "http" | "https" | "socks5";
    client = Deno.createHttpClient({
      proxy: {
        url: endpoint.toString(),
        transport: protocol,
        ...(username && password ? { basicAuth: { username, password } } : {}),
      },
    });

    // Exactly one ASF request per invocation. No retry, proxy rotation or real plate.
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      body: null,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = await response.text();
    let bodyKind = "non_json";
    let graphqlErrorCount = 0;
    let graphqlErrorCodes: string[] = [];
    let hasData = false;
    let nodesCount = -1;

    try {
      const parsed: any = JSON.parse(body);
      bodyKind = "json";
      const errors = Array.isArray(parsed?.errors) ? parsed.errors : [];
      graphqlErrorCount = errors.length;
      graphqlErrorCodes = errors.slice(0, 3).map((item: any) => {
        const rawCode = String(item?.extensions?.code || item?.code || "unknown");
        return rawCode.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) || "unknown";
      });
      hasData = Object.prototype.hasOwnProperty.call(parsed ?? {}, "data");
      const nodes = parsed?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
      if (Array.isArray(nodes)) nodesCount = nodes.length;
    } catch {
      if (/text\/html/i.test(response.headers.get("content-type") || "") ||
          /^(?:<!doctype html|<html\b)/i.test(body.trim())) bodyKind = "html";
    }

    return Response.json({
      ok: response.status >= 200 && response.status < 300 && bodyKind === "json",
      stage: "single-proxy-asf-connectivity",
      proxyEndpoint: endpoint.hostname + ":" + (endpoint.port || (endpoint.protocol === "https:" ? "443" : "80")),
      testPlate: TEST_PLATE,
      requestsToASF: 1,
      upstreamStatus: response.status,
      elapsedMs: Date.now() - started,
      responseBytes: new TextEncoder().encode(body).length,
      contentType: (response.headers.get("content-type") || "").split(";")[0].slice(0, 80),
      bodyKind,
      graphqlErrorCount,
      graphqlErrorCodes,
      hasGraphQLData: hasData,
      nodesCount,
      note: "One synthetic diagnostic request through the first configured proxy only. No retries, no proxy rotation, no production changes.",
    }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({
      ok: false,
      stage: "single-proxy-asf-connectivity",
      proxyEndpoint: endpoint.hostname + ":" + (endpoint.port || (endpoint.protocol === "https:" ? "443" : "80")),
      requestsToASF: 1,
      elapsedMs: Date.now() - started,
      error: safeError(error, username, password),
      note: "One request attempted through the first configured proxy only. No retries or proxy rotation.",
    }, { status: 502, headers: corsHeaders });
  } finally {
    client?.close();
  }
});
