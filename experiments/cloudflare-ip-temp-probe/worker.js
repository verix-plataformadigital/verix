/**
 * Temporary, non-production VÉRIX diagnostic.
 * It calls only the fixed IPify endpoint and never accepts a target URL.
 * Do not integrate this Worker with ASF or production VÉRIX traffic.
 */
export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/ip") {
      return json({ ok: false, error: "not_found" }, 404);
    }

    const startedAt = Date.now();
    try {
      const response = await fetch("https://api.ipify.org?format=json", {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        return json({
          ok: false,
          stage: "ipify",
          status: response.status,
          elapsedMs: Date.now() - startedAt,
        }, 502);
      }

      const body = await response.json();
      if (typeof body.ip !== "string") {
        return json({ ok: false, error: "unexpected_ipify_response" }, 502);
      }

      return json({
        ok: true,
        observedEgressIp: body.ip,
        elapsedMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        note: "Cloudflare does not guarantee a different egress IP for each request.",
      });
    } catch (error) {
      return json({
        ok: false,
        stage: "outbound_fetch",
        error: String(error instanceof Error ? error.message : error).slice(0, 180),
      }, 502);
    }
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
