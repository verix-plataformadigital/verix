import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

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

  const result: Record<string, unknown> = {
    test: "deno-create-http-client-compatibility",
    denoVersion: Deno.version?.deno ?? null,
    createHttpClientType: typeof Deno.createHttpClient,
    runtime: "supabase-edge",
    timestamp: new Date().toISOString(),
  };

  try {
    const started = Date.now();
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    result.directFetch = {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      response: response.ok ? text.slice(0, 200) : undefined,
    };
  } catch (error) {
    result.directFetch = {
      ok: false,
      error: String(error instanceof Error ? error.message : error).slice(0, 300),
    };
  }

  if (typeof Deno.createHttpClient === "function") {
    let client: Deno.HttpClient | undefined;
    try {
      client = Deno.createHttpClient({});
      const started = Date.now();
      const response = await fetch("https://api.ipify.org?format=json", {
        client,
        signal: AbortSignal.timeout(8000),
      });
      const text = await response.text();
      result.customClientFetch = {
        ok: response.ok,
        status: response.status,
        elapsedMs: Date.now() - started,
        response: response.ok ? text.slice(0, 200) : undefined,
      };
    } catch (error) {
      result.customClientFetch = {
        ok: false,
        error: String(error instanceof Error ? error.message : error).slice(0, 300),
      };
    } finally {
      client?.close();
    }
  } else {
    result.customClientFetch = {
      ok: false,
      error: "Deno.createHttpClient is not exposed in this Edge Runtime.",
    };
  }

  return Response.json(result, { headers: corsHeaders });
});