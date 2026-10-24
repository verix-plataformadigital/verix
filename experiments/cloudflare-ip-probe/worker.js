/**
 * VÉRIX Cloudflare connectivity probe.
 *
 * Diagnostic only: this worker contacts one fixed, harmless IP echo service.
 * It intentionally does not accept arbitrary target URLs and must not be used
 * to bypass a third-party service's access controls or rate limits.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const expectedToken = env.PROBE_TOKEN;
    if (!expectedToken) {
      return json({ ok: false, error: "probe_token_not_configured" }, 503);
    }

    const authorization = request.headers.get("Authorization") || "";
    if (authorization !== `Bearer ${expectedToken}`) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "verix-cloudflare-ip-probe" }, 200);
    }

    if (url.pathname !== "/ip") {
      return json({ ok: false, error: "not_found" }, 404);
    }

    try {
      const startedAt = Date.now();
      const response = await fetch("https://api.ipify.org?format=json", {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
        redirect: "error",
        cf: { cacheTtl: 0, cacheEverything: false },
      });

      if (!response.ok) {
        return json({
          ok: false,
          stage: "ipify",
          status: response.status,
          elapsedMs: Date.now() - startedAt,
        }, 502);
      }

      const payload = await response.json();
      if (typeof payload.ip !== "string") {
        return json({ ok: false, error: "unexpected_ipify_response" }, 502);
      }

      return json({
        ok: true,
        service: "verix-cloudflare-ip-probe",
        observedEgressIp: payload.ip,
        elapsedMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        note: "This shows the egress IP observed for this request; it does not guarantee a different IP on the next request.",
      }, 200);
    } catch (error) {
      return json({
        ok: false,
        stage: "outbound_fetch",
        error: String(error instanceof Error ? error.message : error).slice(0, 200),
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
