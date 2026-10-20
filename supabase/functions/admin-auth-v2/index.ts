import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "jsr:@simplewebauthn/server@13.3.3";

declare const Deno: any;

const ALLOWED_ORIGINS = new Set([
  "https://onilkakbgpklxvxuxmks.supabase.co",
  "https://verix-plataformadigital.github.io",
  "https://verix.vxops.workers.dev",
  "http://localhost",
  "http://127.0.0.1"
]);

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const USER_ID = new TextEncoder().encode("verix-admin-single-account-v1");

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff"
  };
}

function json(data: unknown, status = 200, req?: Request) {
  const headers = getCorsHeaders(req || new Request("https://verix-plataformadigital.github.io"));
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
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

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function consumeLoginRate(req: Request, secret: string): Promise<boolean> {
  if (!supabaseUrl || !serviceKey) return false;
  const rateSecret = Deno.env.get("VERIX_ADMIN_RATE_SECRET") || secret;
  const rateKey = await hmacHex("admin-login:" + clientIp(req), rateSecret);
  const response = await fetch(supabaseUrl + "/rest/v1/rpc/verix2_consume_rate_limit", {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_key: rateKey, p_limit: 10, p_window_seconds: 300 })
  });
  if (!response.ok) return false;
  return (await response.text()).trim() === "true";
}

function b64(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64(value: string): Uint8Array {
  const normal = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "=".repeat((4 - normal.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}

function safeEqual(a: string, b: string) {
  a = String(a ?? "");
  b = String(b ?? "");
  const max = Math.max(a.length, b.length);
  let value = a.length ^ b.length;
  for (let i = 0; i < max; i++) value |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return value === 0;
}

async function makeToken(secret: string) {
  const payload = b64(new TextEncoder().encode(JSON.stringify({
    scope: "admin",
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  })));
  return `${payload}.${await sign(payload, secret)}`;
}

async function verifyAdminToken(req: Request, secret: string): Promise<boolean> {
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return false;
    const parts = auth.slice(7).split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    if (!safeEqual(await sign(parts[0], secret), parts[1])) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromB64(parts[0])));
    return payload?.scope === "admin" && Number(payload?.exp || 0) > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

function allowedOrigin(req: Request): { origin: string; rpID: string } | null {
  const origin = String(req.headers.get("origin") || "").trim();
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && !["http://localhost", "http://127.0.0.1"].includes(origin)) return null;
    return { origin, rpID: parsed.hostname };
  } catch (_) {
    return null;
  }
}

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    Authorization: "Bearer " + serviceKey,
    "Content-Type": "application/json",
    ...extra
  };
}

async function dbRows(path: string): Promise<any[]> {
  const response = await fetch(supabaseUrl + path, { headers: serviceHeaders() });
  const text = await response.text();
  if (!response.ok) throw new Error("admin_passkey_database_read_failed");
  const data = text ? JSON.parse(text) : [];
  if (!Array.isArray(data)) throw new Error("admin_passkey_database_payload_invalid");
  return data;
}

async function loadPasskeys(rpID: string, origin: string): Promise<any[]> {
  const qs = new URLSearchParams();
  qs.set("select", "credential_id,public_key,counter,transports,device_type,backed_up,rp_id,origin");
  qs.set("rp_id", "eq." + rpID);
  qs.set("origin", "eq." + origin);
  qs.set("order", "created_at.asc");
  return await dbRows("/rest/v1/verix_admin_passkeys?" + qs.toString());
}

async function saveChallenge(challenge: string, ceremony: "registration" | "authentication", rpID: string, origin: string) {
  const now = new Date();
  const cleanup = new URLSearchParams({ expires_at: "lt." + now.toISOString() });
  // Expired challenges contain no long-lived secrets and are cleaned on each ceremony start.
  await fetch(supabaseUrl + "/rest/v1/verix_admin_webauthn_challenges?" + cleanup.toString(), {
    method: "DELETE", headers: serviceHeaders({ Prefer: "return=minimal" })
  });
  const response = await fetch(supabaseUrl + "/rest/v1/verix_admin_webauthn_challenges", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      challenge, ceremony, rp_id: rpID, origin,
      expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString()
    })
  });
  if (!response.ok) throw new Error("admin_passkey_challenge_store_failed");
}

async function consumeChallenge(challenge: string, ceremony: "registration" | "authentication", rpID: string, origin: string): Promise<boolean> {
  const response = await fetch(supabaseUrl + "/rest/v1/rpc/verix2_consume_admin_webauthn_challenge", {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      p_challenge: challenge, p_ceremony: ceremony,
      p_rp_id: rpID, p_origin: origin
    })
  });
  if (!response.ok) throw new Error("admin_passkey_challenge_consume_failed");
  const text = await response.text();
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) && rows.length === 1;
}

async function insertPasskey(record: Record<string, unknown>) {
  const response = await fetch(supabaseUrl + "/rest/v1/verix_admin_passkeys", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(record)
  });
  if (!response.ok) {
    const text = await response.text();
    if (text.includes("verix_admin_passkeys_credential_origin_uq")) throw new Error("passkey_already_registered");
    throw new Error("admin_passkey_database_write_failed");
  }
}

async function updatePasskeyAfterLogin(credentialID: string, rpID: string, origin: string, counter: number) {
  const qs = new URLSearchParams();
  qs.set("credential_id", "eq." + credentialID);
  qs.set("rp_id", "eq." + rpID);
  qs.set("origin", "eq." + origin);
  const response = await fetch(supabaseUrl + "/rest/v1/verix_admin_passkeys?" + qs.toString(), {
    method: "PATCH",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ counter, last_used_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error("admin_passkey_counter_update_failed");
}

async function passwordValid(body: any, expected: string): Promise<boolean> {
  const candidate = String(body?.password || "").slice(0, 256);
  return safeEqual(candidate, expected);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, req);

  const expected = Deno.env.get("VERIX_ADMIN_PASSWORD") || "";
  const secret = Deno.env.get("VERIX_ADMIN_SECRET") || "";
  if (!expected || !secret) return json({ ok: false, error: "admin_secret_not_configured" }, 500, req);
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "admin_auth_not_configured" }, 500, req);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
      return json({ ok: false, error: "payload_too_large" }, 413, req);
    }
    if (!(await consumeLoginRate(req, secret))) {
      return json({ ok: false, error: "rate_limited" }, 429, req);
    }

    const body = await req.json();
    const action = String(body?.action || "password-login");
    const requestOrigin = allowedOrigin(req);

    if (action === "passkey-status-public") {
      if (!requestOrigin) return json({ ok: false, error: "origin_not_allowed" }, 403, req);
      const passkeys = await loadPasskeys(requestOrigin.rpID, requestOrigin.origin);
      return json({ ok: true, available: passkeys.length > 0 }, 200, req);
    }

    if (action === "passkey-status") {
      if (!(await verifyAdminToken(req, secret))) return json({ ok: false, error: "unauthorized" }, 401, req);
      if (!requestOrigin) return json({ ok: false, error: "origin_not_allowed" }, 403, req);
      const passkeys = await loadPasskeys(requestOrigin.rpID, requestOrigin.origin);
      return json({ ok: true, available: passkeys.length > 0, count: passkeys.length }, 200, req);
    }

    if (action === "passkey-register-options") {
      if (!(await verifyAdminToken(req, secret))) return json({ ok: false, error: "unauthorized" }, 401, req);
      if (!(await passwordValid(body, expected))) return json({ ok: false, error: "invalid_password" }, 401, req);
      if (!requestOrigin) return json({ ok: false, error: "origin_not_allowed" }, 403, req);
      const passkeys = await loadPasskeys(requestOrigin.rpID, requestOrigin.origin);
      const options = await generateRegistrationOptions({
        rpName: "VÉRIX Admin",
        rpID: requestOrigin.rpID,
        userID: USER_ID,
        userName: "VÉRIX Admin",
        userDisplayName: "VÉRIX Admin",
        attestationType: "none",
        supportedAlgorithmIDs: [-7, -257],
        preferredAuthenticatorType: "localDevice",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required"
        },
        excludeCredentials: passkeys.map((row: any) => ({
          id: row.credential_id,
          transports: Array.isArray(row.transports) ? row.transports : []
        }))
      });
      await saveChallenge(options.challenge, "registration", requestOrigin.rpID, requestOrigin.origin);
      return json({ ok: true, options }, 200, req);
    }

    if (action === "passkey-register-verify") {
      if (!(await verifyAdminToken(req, secret))) return json({ ok: false, error: "unauthorized" }, 401, req);
      if (!(await passwordValid(body, expected))) return json({ ok: false, error: "invalid_password" }, 401, req);
      if (!requestOrigin) return json({ ok: false, error: "origin_not_allowed" }, 403, req);
      const challenge = String(body?.challenge || "");
      if (!challenge || !body?.credential) return json({ ok: false, error: "passkey_payload_invalid" }, 400, req);
      const consumed = await consumeChallenge(challenge, "registration", requestOrigin.rpID, requestOrigin.origin);
      if (!consumed) return json({ ok: false, error: "passkey_challenge_expired" }, 400, req);
      const verification = await verifyRegistrationResponse({
        response: body.credential,
        expectedChallenge: challenge,
        expectedOrigin: requestOrigin.origin,
        expectedRPID: requestOrigin.rpID,
        requireUserVerification: true
      });
      if (!verification.verified || !verification.registrationInfo) {
        return json({ ok: false, error: "passkey_registration_not_verified" }, 400, req);
      }
      const info = verification.registrationInfo;
      const credential = info.credential;
      await insertPasskey({
        credential_id: credential.id,
        public_key: b64(credential.publicKey),
        counter: credential.counter,
        transports: Array.isArray(credential.transports) ? credential.transports : [],
        device_type: info.credentialDeviceType || "singleDevice",
        backed_up: info.credentialBackedUp === true,
        rp_id: requestOrigin.rpID,
        origin: requestOrigin.origin
      });
      return json({ ok: true, registered: true }, 200, req);
    }

    if (action === "passkey-login-options") {
      if (!requestOrigin) return json({ ok: false, error: "origin_not_allowed" }, 403, req);
      const passkeys = await loadPasskeys(requestOrigin.rpID, requestOrigin.origin);
      if (!passkeys.length) return json({ ok: true, available: false }, 200, req);
      const options = await generateAuthenticationOptions({
        rpID: requestOrigin.rpID,
        allowCredentials: passkeys.map((row: any) => ({
          id: row.credential_id,
          transports: Array.isArray(row.transports) ? row.transports : []
        })),
        userVerification: "required"
      });
      await saveChallenge(options.challenge, "authentication", requestOrigin.rpID, requestOrigin.origin);
      return json({ ok: true, available: true, options }, 200, req);
    }

    if (action === "passkey-login-verify") {
      if (!requestOrigin) return json({ ok: false, error: "origin_not_allowed" }, 403, req);
      const challenge = String(body?.challenge || "");
      const suppliedCredential = body?.credential;
      const credentialID = String(suppliedCredential?.id || "");
      if (!challenge || !credentialID || !suppliedCredential) {
        return json({ ok: false, error: "passkey_payload_invalid" }, 400, req);
      }
      const matching = (await loadPasskeys(requestOrigin.rpID, requestOrigin.origin))
        .find((row: any) => row.credential_id === credentialID);
      if (!matching) return json({ ok: false, error: "passkey_not_registered" }, 401, req);
      const consumed = await consumeChallenge(challenge, "authentication", requestOrigin.rpID, requestOrigin.origin);
      if (!consumed) return json({ ok: false, error: "passkey_challenge_expired" }, 400, req);
      const verification = await verifyAuthenticationResponse({
        response: suppliedCredential,
        expectedChallenge: challenge,
        expectedOrigin: requestOrigin.origin,
        expectedRPID: requestOrigin.rpID,
        requireUserVerification: true,
        credential: {
          id: matching.credential_id,
          publicKey: new Uint8Array(fromB64(matching.public_key)),
          counter: Number(matching.counter || 0),
          transports: Array.isArray(matching.transports) ? matching.transports : []
        }
      });
      if (!verification.verified || verification.authenticationInfo.userVerified !== true) {
        return json({ ok: false, error: "passkey_authentication_not_verified" }, 401, req);
      }
      await updatePasskeyAfterLogin(
        matching.credential_id, requestOrigin.rpID, requestOrigin.origin,
        verification.authenticationInfo.newCounter
      );
      return json({
        ok: true,
        token: await makeToken(secret),
        expiresIn: 8 * 60 * 60
      }, 200, req);
    }

    if (action !== "password-login") return json({ ok: false, error: "unknown_action" }, 400, req);
    if (!(await passwordValid(body, expected))) return json({ ok: false, error: "invalid_password" }, 401, req);
    return json({ ok: true, token: await makeToken(secret), expiresIn: 8 * 60 * 60 }, 200, req);
  } catch (error) {
    console.error("VÉRIX Admin authentication flow failed:", String((error as Error)?.message || error));
    return json({ ok: false, error: "authentication_failed" }, 400, req);
  }
});
