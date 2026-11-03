const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

Deno.serve((request: Request): Response => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...HEADERS,
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      },
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...HEADERS, "Allow": "GET, HEAD, OPTIONS" },
    });
  }

  const body = JSON.stringify({
    ok: false,
    error: "diagnostic_retired",
    message: "This VÉRIX diagnostic endpoint has been retired and no longer performs outbound requests.",
  });

  return new Response(request.method === "HEAD" ? null : body, {
    status: 410,
    headers: HEADERS,
  });
});
