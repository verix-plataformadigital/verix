declare const Deno: any;

const ALLOWED_ORIGINS = new Set([
  "https://verix.vxops.workers.dev",
  "https://verix-plataformadigital.github.io"
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY"
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{"Content-Type":"application/json",...corsHeaders}
  });
}

function b64Bytes(s: string) {
  const binary = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function hmac(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
  return key;
}
async function verifyToken(req: Request) {
  try {
  const auth = req.headers.get("Authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const parts = raw.split(".");
  if (parts.length !== 2) return false;

  const secret = Deno.env.get("VERIX_ADMIN_SECRET") || "";
  if (!secret) return false;

  const key = await hmac(parts[0], secret);
  const sig = b64Bytes(parts[1]);

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(parts[0])
  );
  if (!ok) return false;

  const payloadBinary = b64Bytes(parts[0]);
  const payload = JSON.parse(new TextDecoder().decode(payloadBinary));
  return payload?.scope === "admin" && Number(payload?.exp || 0) > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

async function rpc(name: string, body: Record<string,unknown>) {
  const r=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const t=await r.text();
  if(!r.ok) throw new Error(`${name}: ${t || r.status}`);
  return t?JSON.parse(t):[];
}

Deno.serve(async (req) => {
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
  if(req.method!=="GET") return json({ok:false,error:"method_not_allowed"},405);
  if(!(await verifyToken(req))) return json({ok:false,error:"unauthorized"},401);

  const parsedUrl = new URL(req.url);
  let date = parsedUrl.searchParams.get("date") || "";
  // Compatibilidade com versões antigas do ADMIN que geravam ?v=14.1?date=AAAA-MM-DD.
  if(!date){
    const legacyV = parsedUrl.searchParams.get("v") || "";
    const legacyMatch = legacyV.match(/\?date=(\d{4}-\d{2}-\d{2})/);
    if(legacyMatch) date = legacyMatch[1];
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||"")) return json({ok:false,error:"invalid_date"},400);

  try {
    const rows = await rpc("verix2_hourly", {p_date:date});
    return json({ok:true,date,rows},200);
  } catch(error) {
    return json({ok:false,error:"hourly_v2_failed",detail:String((error as Error)?.message||error)},500);
  }
});
