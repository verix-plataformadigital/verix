
const ACCESS_KEY = "REDACTED_IN_PUBLIC_BACKUP"; // expired diagnostic key intentionally redacted
const EXPIRES_AT = Date.parse("2026-10-29T00:00:00Z");
const ASF_URL = "https://ext01.asf.com.pt/api/src/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};
function json(data: unknown, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
}
function plateNorm(v: unknown) { return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8); }
function dateNorm(v: unknown): string | null {
  const s=String(v ?? "").trim(), m=s.match(/^([0-9]{4})[/]([0-9]{2})[/]([0-9]{2})$/);
  if(!m) return null;
  const y=Number(m[1]), mo=Number(m[2]), d=Number(m[3]), dt=new Date(Date.UTC(y,mo-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===mo-1 && dt.getUTCDate()===d ? s : null;
}
Deno.serve(async (req: Request) => {
  if(Date.now()>EXPIRES_AT) return json({ok:false,error:"diagnostic_expired"},410);
  const u=new URL(req.url);
  if(u.searchParams.get("k")!==ACCESS_KEY) return json({ok:false,error:"not_found"},404);
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(req.method==="GET") return new Response("VÉRIX ASF single-query diagnostic. Submit a POST using the diagnostic page.",{status:200,headers:{...cors,"Content-Type":"text/plain; charset=utf-8"}});
  if(req.method!=="POST") return json({ok:false,error:"method_not_allowed"},405);
  let body:any;
  try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  if(body?.key!==ACCESS_KEY) return json({ok:false,error:"not_authorized"},401);
  const plate=plateNorm(body?.matricula), date=dateNorm(body?.date);
  if(!/^[A-Z0-9]{6,8}$/.test(plate)) return json({ok:false,error:"invalid_plate_format"},400);
  if(!date) return json({ok:false,error:"invalid_date_format"},400);
  const query='mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "'+plate+'", date: "'+date+'") { nodes { id entity startDate endDate policy license code logo } } } } } }';
  const started=Date.now();
  try {
    const r=await fetch(ASF_URL+"?query="+encodeURIComponent(query),{
      method:"POST",
      headers:{"Accept":"application/json, text/plain, */*","Cache-Control":"no-cache","Pragma":"no-cache"},
      body:null,
      redirect:"follow",
      signal:AbortSignal.timeout(12000)
    });
    const raw=await r.text();
    const elapsedMs=Date.now()-started;
    let bodyKind="non_json", errors:any[]=[], dataPresent=false, nodesCount:number|null=null;
    try {
      const p=JSON.parse(raw); bodyKind="json";
      errors=Array.isArray(p?.errors)?p.errors.slice(0,3).map((e:any)=>{
        let message=String(e?.message ?? "unknown").slice(0,220);
        message=message.replaceAll(plate,"[MATRICULA]").replace(/[A-Z0-9]{6,8}/g,"[IDENTIFICADOR]");
        return {
          message,
          code:String(e?.extensions?.code ?? e?.code ?? "").slice(0,60)||null,
          path:Array.isArray(e?.path)?e.path.slice(0,8):null
        };
      }):[];
      dataPresent=Object.prototype.hasOwnProperty.call(p??{},"data");
      const nodes=p?.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
      nodesCount=Array.isArray(nodes)?nodes.length:null;
    } catch {
      const ct=(r.headers.get("content-type")||"").toLowerCase(), t=raw.trim().toLowerCase();
      if(!raw.trim()) bodyKind="empty";
      else if(ct.includes("text/html")||t.startsWith("<!doctype html")||t.startsWith("<html")) bodyKind="html";
    }
    console.log("asf_error_probe",JSON.stringify({httpStatus:r.status,elapsedMs,bodyKind,graphqlErrorCount:errors.length,dataPresent,nodesCount}));
    return json({
      test:"VÉRIX ASF single-query diagnostic",
      completedAt:new Date().toISOString(),
      result:{
        httpStatus:r.status,elapsedMs,contentType:(r.headers.get("content-type")||"").split(";")[0],
        bodyKind,graphqlErrorCount:errors.length,errors,dataPresent,nodesCount,
        retryAfter:r.headers.get("retry-after")||null
      },
      note:"One request only. Raw response, plate, policy, insurer and vehicle data are not returned."
    });
  } catch(e) {
    return json({test:"VÉRIX ASF single-query diagnostic",result:{httpStatus:null,elapsedMs:Date.now()-started,networkError:String(e instanceof Error?e.message:e).slice(0,180)},note:"One request only; no retries."});
  }
});
