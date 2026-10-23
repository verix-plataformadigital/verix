import { handleRequest } from "./index.ts";

function toBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function adminToken(secret: string, exp: number): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ scope: "admin", exp })),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return payload + "." + toBase64Url(new Uint8Array(signature));
}

Deno.test("admin telemetry v3 — authentication, CORS and response contract", async (t) => {
  const previousSecret = Deno.env.get("VERIX_ADMIN_SECRET");
  const previousUrl = Deno.env.get("SUPABASE_URL");
  const previousServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const previousFetch = globalThis.fetch;
  const secret = "test-only-admin-secret";
  let shouldFailRpc = false;
  const rpcCalls: string[] = [];

  try {
    Deno.env.set("VERIX_ADMIN_SECRET", secret);
    Deno.env.set("SUPABASE_URL", "https://supabase.example.test");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-service-key");

    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      rpcCalls.push(url);
      if (shouldFailRpc) {
        return new Response("PRIVATE_UPSTREAM_DETAIL", { status: 500 });
      }
      if (url.endsWith("/verix2_admin_dashboard_v3")) {
        return Response.json({ total: 12 });
      }
      if (url.endsWith("/verix2_admin_live_presence")) {
        return Response.json({
          observed_at: "2026-10-22T09:00:00.000Z",
          presence_lease_seconds: 90,
          online_now: 4,
          online_sessions: 4,
          online_installations: 3,
          sessions_seen_last_hour: 8,
          installations_seen_last_hour: 6,
          active_sessions_last_hour: 5,
          active_installations_last_hour: 4,
          consultations_in_progress: 1,
          consultations_started_last_hour: 11,
        });
      }
      return new Response("Unexpected RPC", { status: 404 });
    }) as typeof fetch;

    await t.step("preflight returns CORS and no-store headers", async () => {
      const response = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3",
        {
          method: "OPTIONS",
          headers: { origin: "https://verix-plataformadigital.github.io" },
        },
      ));
      if (response.status !== 204) throw new Error("Expected 204 for OPTIONS");
      if (
        response.headers.get("Access-Control-Allow-Origin") !==
          "https://verix-plataformadigital.github.io"
      ) throw new Error("Allowed origin was not reflected");
      if (!response.headers.get("Cache-Control")?.includes("no-store")) {
        throw new Error("Response must not be cached");
      }
    });

    await t.step("rejects non-GET requests", async () => {
      const response = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3?view=dashboard",
        { method: "POST" },
      ));
      if (response.status !== 405) throw new Error("Expected 405");
    });

    await t.step("rejects missing, invalid and expired admin tokens", async () => {
      const missing = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3?view=dashboard",
      ));
      if (missing.status !== 401) throw new Error("Missing token must return 401");

      const invalid = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3?view=dashboard",
        { headers: { Authorization: "Bearer a.b" } },
      ));
      if (invalid.status !== 401) throw new Error("Invalid token must return 401");

      const expiredToken = await adminToken(secret, Math.floor(Date.now() / 1000) - 1);
      const expired = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3?view=dashboard",
        { headers: { Authorization: "Bearer " + expiredToken } },
      ));
      if (expired.status !== 401) throw new Error("Expired token must return 401");
    });

    const token = await adminToken(secret, Math.floor(Date.now() / 1000) + 300);

    await t.step("rejects unsupported view without calling RPC", async () => {
      const before = rpcCalls.length;
      const response = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3?view=other",
        { headers: { Authorization: "Bearer " + token } },
      ));
      if (response.status !== 400) throw new Error("Expected 400 for unsupported view");
      if (rpcCalls.length !== before) throw new Error("Unsupported view called an RPC");
    });

    await t.step("returns verified presence separately from dashboard data", async () => {
      rpcCalls.length = 0;
      const response = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3?view=dashboard",
        {
          headers: {
            Authorization: "Bearer " + token,
            origin: "https://verix-plataformadigital.github.io",
          },
        },
      ));
      if (response.status !== 200) throw new Error("Expected 200");
      const data = await response.json();
      if (data.ok !== true || data.dashboard?.total !== 12) {
        throw new Error("Dashboard payload is missing");
      }
      if (
        data.presence?.online_sessions !== 4 ||
        data.presence?.consultations_in_progress !== 1 ||
        data.presence?.presence_lease_seconds !== 90
      ) throw new Error("Presence payload is not mapped correctly");
      if (rpcCalls.length !== 2) throw new Error("Expected two RPC requests");
      if (response.headers.get("Cache-Control")?.includes("no-store") !== true) {
        throw new Error("Successful admin responses must be no-store");
      }
    });

    await t.step("does not leak upstream error details", async () => {
      shouldFailRpc = true;
      const response = await handleRequest(new Request(
        "https://edge.example.test/admin-telemetry-v3?view=dashboard",
        { headers: { Authorization: "Bearer " + token } },
      ));
      const body = await response.text();
      if (response.status !== 503) throw new Error("Expected 503 on RPC failure");
      if (body.includes("PRIVATE_UPSTREAM_DETAIL")) {
        throw new Error("Upstream detail leaked to the client");
      }
      shouldFailRpc = false;
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) Deno.env.delete("VERIX_ADMIN_SECRET");
    else Deno.env.set("VERIX_ADMIN_SECRET", previousSecret);
    if (previousUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", previousUrl);
    if (previousServiceKey === undefined) {
      Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    } else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", previousServiceKey);
  }
});
